import type { FieldExpr } from "./expr";

// ─── GLSL Field Compiler ─────────────────────────────────────────
//
// Compiles a FieldExpr AST to a GLSL ES 3.00 fragment shader that evaluates
// the field at every pixel. Output is a single float written to
// gl_FragColor.r (grayscale).
//
// Architecture:
//   1. Analysis pass — find sub-expressions used as functions
//      (children of fbm/warp/apply that are called at varying coords)
//   2. Codegen pass — emit GLSL functions for those sub-exprs,
//      then inline everything else into main()
//   3. Library injection — include Perlin/Simplex noise when needed
//   4. Uniform collection — param-driven values become GLSL uniforms
//      so the shader can be reused across parameter changes

// ─── Compiled output ─────────────────────────────────────────────

export interface CompiledField {
  /** GLSL fragment shader source (version 300 es) */
  fragmentSource: string;
  /** GLSL vertex shader source (fullscreen quad) */
  vertexSource: string;
  /** Uniform values to set before drawing (name → value) */
  uniforms: ReadonlyArray<{ readonly glslName: string; readonly value: number }>;
}

// ─── Noise library (GLSL) ────────────────────────────────────────

const GLSL_HASH = `
// Hash for gradient noise (replaces lookup table)
vec2 hashGrad(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
`;

const GLSL_PERLIN = `
float perlinNoise(float px, float py) {
  vec2 p = vec2(px, py);
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Quintic fade (matches CPU)
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n00 = dot(hashGrad(i), f);
  float n10 = dot(hashGrad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float n01 = dot(hashGrad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float n11 = dot(hashGrad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}
`;

const GLSL_SIMPLEX = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float simplexNoise(float px, float py) {
  vec2 v = vec2(px, py);
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

const GLSL_VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// ─── Analysis ────────────────────────────────────────────────────

interface CompileCtx {
  needsPerlin: boolean;
  needsSimplex: boolean;
  /** Sub-expressions that need their own GLSL function (called at varying coords) */
  functions: Map<FieldExpr, string>;
  nextFnId: number;
  /** Uniform nodes → GLSL variable names */
  uniforms: Map<FieldExpr, string>;
  nextUniformId: number;
}

/**
 * Identify sub-expressions that must be emitted as GLSL functions
 * because they're evaluated at varying coordinates (inside fbm/warp/apply).
 * Also collects uniform nodes for declaration.
 */
function analyze(expr: FieldExpr, ctx: CompileCtx): void {
  switch (expr.tag) {
    case "perlin":
      ctx.needsPerlin = true;
      analyze(expr.px, ctx);
      analyze(expr.py, ctx);
      break;
    case "simplex":
      ctx.needsSimplex = true;
      analyze(expr.px, ctx);
      analyze(expr.py, ctx);
      break;
    case "fbm":
      // source is called at (x*freq, y*freq) — needs its own function
      registerFn(expr.source, ctx);
      // fbm itself needs a function (loop can't be inlined)
      registerFn(expr, ctx);
      // Analyze param expressions (may contain uniforms)
      analyze(expr.octaves, ctx);
      analyze(expr.lacunarity, ctx);
      analyze(expr.gain, ctx);
      analyze(expr.amplitude, ctx);
      break;
    case "warp":
      // source and warp are called at offset coords — need functions
      registerFn(expr.source, ctx);
      registerFn(expr.warp, ctx);
      // warp itself also gets a function for cleanliness
      registerFn(expr, ctx);
      // Analyze param expressions
      analyze(expr.amount, ctx);
      analyze(expr.offsetX, ctx);
      analyze(expr.offsetY, ctx);
      break;
    case "apply":
      // fn is called at computed coords — needs function
      registerFn(expr.fn, ctx);
      analyze(expr.ax, ctx);
      analyze(expr.ay, ctx);
      break;
    // Binary (a, b)
    case "add": case "sub": case "mul": case "div":
    case "min": case "max":
      analyze(expr.a, ctx);
      analyze(expr.b, ctx);
      break;
    case "pow":
      analyze(expr.base, ctx);
      analyze(expr.exp, ctx);
      break;
    case "atan2":
      analyze(expr.y, ctx);
      analyze(expr.x, ctx);
      break;
    // Ternary
    case "mix":
      analyze(expr.a, ctx);
      analyze(expr.b, ctx);
      analyze(expr.t, ctx);
      break;
    case "clamp":
      analyze(expr.a, ctx);
      analyze(expr.lo, ctx);
      analyze(expr.hi, ctx);
      break;
    case "smoothstep":
      analyze(expr.edge0, ctx);
      analyze(expr.edge1, ctx);
      analyze(expr.x, ctx);
      break;
    // Unary
    case "abs": case "neg": case "floor": case "round":
      analyze(expr.a, ctx);
      break;
    // Leaves
    case "x": case "y": case "const":
      break;
    // Uniform — collect for declaration
    case "uniform":
      if (!ctx.uniforms.has(expr)) {
        ctx.uniforms.set(expr, `u_${ctx.nextUniformId++}`);
      }
      break;
  }
}

function registerFn(expr: FieldExpr, ctx: CompileCtx): void {
  if (ctx.functions.has(expr)) return;
  // Register BEFORE analyzing to prevent infinite recursion
  // (fbm/warp analyze cases call registerFn on themselves)
  const name = `field_fn_${ctx.nextFnId++}`;
  ctx.functions.set(expr, name);
  analyze(expr, ctx);
}

// ─── Code generation ─────────────────────────────────────────────

/** Format a number as a GLSL float literal */
function glFloat(n: number): string {
  const s = n.toString();
  return s.includes(".") ? s : s + ".0";
}

/**
 * Generate a GLSL expression string for a FieldExpr.
 * Sub-expressions registered as functions are emitted as function calls.
 */
function genExpr(expr: FieldExpr, ctx: CompileCtx): string {
  // Check if this expression was registered as a function
  const fnName = ctx.functions.get(expr);
  if (fnName) return `${fnName}(x, y)`;

  switch (expr.tag) {
    case "x": return "x";
    case "y": return "y";
    case "const": return glFloat(expr.value);
    case "uniform": {
      const uName = ctx.uniforms.get(expr);
      if (!uName) throw new Error("uniform not registered during analysis");
      return uName;
    }

    case "perlin": return `perlinNoise(${genExpr(expr.px, ctx)}, ${genExpr(expr.py, ctx)})`;
    case "simplex": return `simplexNoise(${genExpr(expr.px, ctx)}, ${genExpr(expr.py, ctx)})`;

    case "add": return `(${genExpr(expr.a, ctx)} + ${genExpr(expr.b, ctx)})`;
    case "sub": return `(${genExpr(expr.a, ctx)} - ${genExpr(expr.b, ctx)})`;
    case "mul": return `(${genExpr(expr.a, ctx)} * ${genExpr(expr.b, ctx)})`;
    case "div": {
      const d = genExpr(expr.b, ctx);
      const n = genExpr(expr.a, ctx);
      return `(${d} == 0.0 ? 0.0 : ${n} / ${d})`;
    }
    case "min": return `min(${genExpr(expr.a, ctx)}, ${genExpr(expr.b, ctx)})`;
    case "max": return `max(${genExpr(expr.a, ctx)}, ${genExpr(expr.b, ctx)})`;
    case "pow": return `pow(max(0.0, ${genExpr(expr.base, ctx)}), ${genExpr(expr.exp, ctx)})`;
    case "atan2": return `atan(${genExpr(expr.y, ctx)}, ${genExpr(expr.x, ctx)})`;

    case "mix": return `mix(${genExpr(expr.a, ctx)}, ${genExpr(expr.b, ctx)}, ${genExpr(expr.t, ctx)})`;
    case "clamp": return `clamp(${genExpr(expr.a, ctx)}, ${genExpr(expr.lo, ctx)}, ${genExpr(expr.hi, ctx)})`;
    case "smoothstep": return `smoothstep(${genExpr(expr.edge0, ctx)}, ${genExpr(expr.edge1, ctx)}, ${genExpr(expr.x, ctx)})`;

    case "abs": return `abs(${genExpr(expr.a, ctx)})`;
    case "neg": return `(-${genExpr(expr.a, ctx)})`;
    case "floor": return `floor(${genExpr(expr.a, ctx)})`;
    case "round": return `(floor(${genExpr(expr.a, ctx)} + 0.5))`;

    case "apply": {
      const fnN = ctx.functions.get(expr.fn);
      if (!fnN) throw new Error("apply target not registered as function");
      return `${fnN}(${genExpr(expr.ax, ctx)}, ${genExpr(expr.ay, ctx)})`;
    }

    // fbm and warp are always registered as functions during analyze
    case "fbm":
    case "warp": {
      const fn = ctx.functions.get(expr);
      if (!fn) throw new Error(`${expr.tag} not registered as function`);
      return `${fn}(x, y)`;
    }
  }

}


/** Generate GLSL function definitions for all registered sub-expressions. */
function genFunctions(ctx: CompileCtx): string {
  const lines: string[] = [];

  for (const [expr, name] of ctx.functions) {
    if (expr.tag === "fbm") {
      // FBM wrapper function with loop — params may be uniforms or consts
      const srcFn = ctx.functions.get(expr.source);
      if (!srcFn) continue;
      const octExpr = genExpr(expr.octaves, ctx);
      const lacExpr = genExpr(expr.lacunarity, ctx);
      const gainExpr = genExpr(expr.gain, ctx);
      const ampExpr = genExpr(expr.amplitude, ctx);
      lines.push(`float ${name}(float x, float y) {`);
      lines.push(`  float sum = 0.0;`);
      lines.push(`  float freq = 1.0;`);
      lines.push(`  float amp = 1.0;`);
      lines.push(`  float maxAmp = 0.0;`);
      lines.push(`  for (int i = 0; i < int(${octExpr}); i++) {`);
      lines.push(`    sum += ${srcFn}(x * freq, y * freq) * amp;`);
      lines.push(`    maxAmp += amp;`);
      lines.push(`    freq *= ${lacExpr};`);
      lines.push(`    amp *= ${gainExpr};`);
      lines.push(`  }`);
      lines.push(`  return (sum / maxAmp) * ${ampExpr};`);
      lines.push(`}`);
      lines.push(``);
    } else if (expr.tag === "warp") {
      // Warp wrapper function — params may be uniforms or consts
      const srcFn = ctx.functions.get(expr.source);
      const warpFn = ctx.functions.get(expr.warp);
      if (!srcFn || !warpFn) continue;
      const amtExpr = genExpr(expr.amount, ctx);
      const oxExpr = genExpr(expr.offsetX, ctx);
      const oyExpr = genExpr(expr.offsetY, ctx);
      lines.push(`float ${name}(float x, float y) {`);
      lines.push(`  float wx = (${warpFn}(x, y) - 0.5) * 2.0 * ${amtExpr};`);
      lines.push(`  float wy = (${warpFn}(x + ${oxExpr}, y + ${oyExpr}) - 0.5) * 2.0 * ${amtExpr};`);
      lines.push(`  return ${srcFn}(x + wx, y + wy);`);
      lines.push(`}`);
      lines.push(``);
    } else {
      // Regular function — compile the body
      const body = genExprAsBody(expr, ctx, name);
      lines.push(`float ${name}(float x, float y) {`);
      lines.push(`  return ${body};`);
      lines.push(`}`);
      lines.push(``);
    }
  }

  return lines.join("\n");
}

/**
 * Generate expression for a function body.
 * Unlike genExpr, this does NOT look up the current expression in ctx.functions
 * (to avoid infinite recursion when compiling the function's own body).
 */
function genExprAsBody(expr: FieldExpr, ctx: CompileCtx, selfName: string): string {
  // Temporarily remove self from functions map to avoid self-reference
  const saved = ctx.functions.get(expr);
  ctx.functions.delete(expr);
  const result = genExpr(expr, ctx);
  if (saved) ctx.functions.set(expr, saved);
  else if (selfName) ctx.functions.set(expr, selfName);
  return result;
}

// ─── Public API ──────────────────────────────────────────────────

/** Compile a FieldExpr to GLSL ES 3.00 shaders. */
export function compileField(expr: FieldExpr): CompiledField {
  const ctx: CompileCtx = {
    needsPerlin: false,
    needsSimplex: false,
    functions: new Map(),
    nextFnId: 0,
    uniforms: new Map(),
    nextUniformId: 0,
  };

  // Analysis — collect function boundaries, library needs, and uniforms
  analyze(expr, ctx);

  // Build fragment shader
  const parts: string[] = [];
  parts.push(`#version 300 es`);
  parts.push(`precision highp float;`);
  parts.push(`uniform vec2 uResolution;`);

  // Uniform declarations
  for (const [, glslName] of ctx.uniforms) {
    parts.push(`uniform float ${glslName};`);
  }

  parts.push(`out vec4 fragColor;`);
  parts.push(``);

  // Library functions
  if (ctx.needsPerlin || ctx.needsSimplex) {
    parts.push(GLSL_HASH);
  }
  if (ctx.needsPerlin) {
    parts.push(GLSL_PERLIN);
  }
  if (ctx.needsSimplex) {
    parts.push(GLSL_SIMPLEX);
  }

  // Generated field functions
  const fnCode = genFunctions(ctx);
  if (fnCode) parts.push(fnCode);

  // Main
  parts.push(`void main() {`);
  parts.push(`  float x = gl_FragCoord.x;`);
  parts.push(`  float y = uResolution.y - gl_FragCoord.y;`); // Flip Y to match Canvas2D
  parts.push(`  float value = ${genExpr(expr, ctx)};`);
  parts.push(`  fragColor = vec4(value, value, value, 1.0);`);
  parts.push(`}`);

  // Collect uniform values for the renderer
  const uniforms: Array<{ glslName: string; value: number }> = [];
  for (const [uExpr, glslName] of ctx.uniforms) {
    if (uExpr.tag === "uniform") {
      uniforms.push({ glslName, value: uExpr.value });
    }
  }

  return {
    fragmentSource: parts.join("\n"),
    vertexSource: GLSL_VERTEX,
    uniforms,
  };
}
