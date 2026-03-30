import type { FieldExpr } from "./field-expr";
import type { Field2D } from "./types";
import { FIELD_EXPR } from "./field-expr";
import { pnoise } from "../operators/top/perlin-noise";
import { simplex2 } from "../operators/top/simplex-noise";

// ─── FieldExpr JIT Compiler ─────────────────────────────────────
//
// Compiles a FieldExpr AST to a flat JavaScript function via
// `new Function()`. This eliminates the recursive tree-walk
// overhead of evalExpr() — no switch dispatch, no function call
// per AST node, and V8/SpiderMonkey can further JIT-optimize
// the generated code.
//
// Expected 5-10x speedup over the interpreter for complex fields
// (fbm with 6 octaves, domain warp chains, etc.)
//
// Falls back gracefully when `new Function()` is blocked by CSP.

// ─── Code generation ────────────────────────────────────────────

interface JitCtx {
  /** Accumulated helper function definitions (fbm loops, warp blocks) */
  helpers: string[];
  /** Counter for unique helper names */
  nextHelper: number;
  /** Map from FieldExpr identity to its helper function name */
  helperMap: Map<FieldExpr, string>;
}

function emitExpr(expr: FieldExpr, ctx: JitCtx): string {
  // If this sub-expression already has a helper, call it
  const existing = ctx.helperMap.get(expr);
  if (existing) return `${existing}(x,y)`;

  switch (expr.tag) {
    case "x": return "x";
    case "y": return "y";
    case "const": return numLit(expr.value);
    case "uniform": return numLit(expr.value);

    case "perlin":
      return `pnoise(${emitExpr(expr.px, ctx)},${emitExpr(expr.py, ctx)})`;
    case "simplex":
      return `simplex2(${emitExpr(expr.px, ctx)},${emitExpr(expr.py, ctx)})`;

    case "add": return `(${emitExpr(expr.a, ctx)}+${emitExpr(expr.b, ctx)})`;
    case "sub": return `(${emitExpr(expr.a, ctx)}-${emitExpr(expr.b, ctx)})`;
    case "mul": return `(${emitExpr(expr.a, ctx)}*${emitExpr(expr.b, ctx)})`;
    case "div": {
      const d = emitExpr(expr.b, ctx);
      const n = emitExpr(expr.a, ctx);
      return `(${d}===0?0:${n}/${d})`;
    }
    case "min": return `Math.min(${emitExpr(expr.a, ctx)},${emitExpr(expr.b, ctx)})`;
    case "max": return `Math.max(${emitExpr(expr.a, ctx)},${emitExpr(expr.b, ctx)})`;
    case "pow": return `Math.pow(Math.max(0,${emitExpr(expr.base, ctx)}),${emitExpr(expr.exp, ctx)})`;
    case "atan2": return `Math.atan2(${emitExpr(expr.y, ctx)},${emitExpr(expr.x, ctx)})`;

    case "mix": {
      const a = emitExpr(expr.a, ctx);
      const b = emitExpr(expr.b, ctx);
      const t = emitExpr(expr.t, ctx);
      return `(${a}+(${b}-${a})*${t})`;
    }
    case "clamp":
      return `Math.max(${emitExpr(expr.lo, ctx)},Math.min(${emitExpr(expr.hi, ctx)},${emitExpr(expr.a, ctx)}))`;
    case "smoothstep": {
      // Emit as helper to avoid repeated sub-expression evaluation
      return emitSmoothstepHelper(expr, ctx);
    }

    case "abs": return `Math.abs(${emitExpr(expr.a, ctx)})`;
    case "neg": return `(-${emitExpr(expr.a, ctx)})`;
    case "floor": return `Math.floor(${emitExpr(expr.a, ctx)})`;
    case "round": return `Math.round(${emitExpr(expr.a, ctx)})`;

    case "apply": {
      const fnName = ensureHelper(expr.fn, ctx);
      return `${fnName}(${emitExpr(expr.ax, ctx)},${emitExpr(expr.ay, ctx)})`;
    }

    case "fbm":
      return emitFbm(expr, ctx);

    case "warp":
      return emitWarp(expr, ctx);
  }
}

/** Ensure a sub-expression has a named helper function. */
function ensureHelper(expr: FieldExpr, ctx: JitCtx): string {
  const existing = ctx.helperMap.get(expr);
  if (existing) return existing;

  const name = `_f${ctx.nextHelper++}`;
  // Reserve the name so other expressions can reference this helper,
  // but temporarily remove it while emitting the body to prevent
  // the body from generating a self-call instead of the actual expression.
  ctx.helperMap.set(expr, name);
  ctx.helperMap.delete(expr);
  const body = emitExpr(expr, ctx);
  ctx.helperMap.set(expr, name);
  ctx.helpers.push(`function ${name}(x,y){return ${body};}`);
  return name;
}

/** Emit FBM as an inlined loop or unrolled sequence. */
function emitFbm(
  expr: Extract<FieldExpr, { tag: "fbm" }>,
  ctx: JitCtx,
): string {
  const srcFn = ensureHelper(expr.source, ctx);
  const lacStr = emitExpr(expr.lacunarity, ctx);
  const gainStr = emitExpr(expr.gain, ctx);
  const ampStr = emitExpr(expr.amplitude, ctx);

  // If octaves is a constant, unroll the loop
  if (expr.octaves.tag === "const") {
    const n = Math.round(expr.octaves.value);
    const lines: string[] = [];
    lines.push("var _s=0,_f=1,_a=1,_m=0");
    for (let i = 0; i < n; i++) {
      lines.push(`_s+=${srcFn}(x*_f,y*_f)*_a;_m+=_a;_f*=${lacStr};_a*=${gainStr}`);
    }
    lines.push(`return(_s/_m)*${ampStr}`);
    const name = `_f${ctx.nextHelper++}`;
    ctx.helperMap.set(expr, name);
    ctx.helpers.push(`function ${name}(x,y){${lines.join(";")}}`);
    return `${name}(x,y)`;
  }

  // Dynamic octaves — emit a loop
  const octStr = emitExpr(expr.octaves, ctx);
  const name = `_f${ctx.nextHelper++}`;
  ctx.helperMap.set(expr, name);
  ctx.helpers.push(
    `function ${name}(x,y){` +
      `var _s=0,_f=1,_a=1,_m=0,_n=Math.round(${octStr});` +
      `for(var _i=0;_i<_n;_i++){` +
        `_s+=${srcFn}(x*_f,y*_f)*_a;_m+=_a;_f*=${lacStr};_a*=${gainStr}` +
      `}` +
      `return(_s/_m)*${ampStr}` +
    `}`,
  );
  return `${name}(x,y)`;
}

/** Emit warp as a helper function. */
function emitWarp(
  expr: Extract<FieldExpr, { tag: "warp" }>,
  ctx: JitCtx,
): string {
  const srcFn = ensureHelper(expr.source, ctx);
  const warpFn = ensureHelper(expr.warp, ctx);
  const amtStr = emitExpr(expr.amount, ctx);
  const oxStr = emitExpr(expr.offsetX, ctx);
  const oyStr = emitExpr(expr.offsetY, ctx);

  const name = `_f${ctx.nextHelper++}`;
  ctx.helperMap.set(expr, name);
  ctx.helpers.push(
    `function ${name}(x,y){` +
      `var _amt=${amtStr};` +
      `var _wx=(${warpFn}(x,y)-0.5)*2*_amt;` +
      `var _wy=(${warpFn}(x+${oxStr},y+${oyStr})-0.5)*2*_amt;` +
      `return ${srcFn}(x+_wx,y+_wy)` +
    `}`,
  );
  return `${name}(x,y)`;
}

/** Emit smoothstep as a helper to avoid repeated sub-expression evaluation. */
function emitSmoothstepHelper(
  expr: Extract<FieldExpr, { tag: "smoothstep" }>,
  ctx: JitCtx,
): string {
  const e0 = emitExpr(expr.edge0, ctx);
  const e1 = emitExpr(expr.edge1, ctx);
  const v = emitExpr(expr.x, ctx);
  const name = `_f${ctx.nextHelper++}`;
  ctx.helperMap.set(expr, name);
  ctx.helpers.push(
    `function ${name}(x,y){` +
      `var _lo=${e0},_hi=${e1},_v=${v};` +
      `var _t=Math.max(0,Math.min(1,(_v-_lo)/(_hi-_lo)));` +
      `return _t*_t*(3-2*_t)` +
    `}`,
  );
  return `${name}(x,y)`;
}

/** Format a number as a JS literal. */
function numLit(n: number): string {
  // Avoid toString() quirks — always produce a parseable literal
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toString();
  return n.toPrecision(17);
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * JIT-compile a FieldExpr to a native JavaScript function.
 *
 * The returned Field2D carries the original FieldExpr via the
 * FIELD_EXPR symbol, so the GPU compilation path is unaffected.
 *
 * Throws if `new Function()` is blocked by Content Security Policy.
 */
export function jitCompileField(expr: FieldExpr): Field2D {
  const ctx: JitCtx = {
    helpers: [],
    nextHelper: 0,
    helperMap: new Map(),
  };

  const body = emitExpr(expr, ctx);

  // Helper functions go in the outer factory closure (created once).
  // The inner function only contains the expression (called per-pixel).
  const helperBlock = ctx.helpers.join("\n");
  const factoryBody = `${helperBlock}\nreturn function(x,y){return ${body};}`;

  // Compile via new Function — closures provide pnoise/simplex2
  const factory = new Function("pnoise", "simplex2", factoryBody);
  const fn = factory(pnoise, simplex2) as Field2D;

  // Attach the FieldExpr for GPU compilation
  Object.defineProperty(fn, FIELD_EXPR, { value: expr, enumerable: false });
  return fn;
}
