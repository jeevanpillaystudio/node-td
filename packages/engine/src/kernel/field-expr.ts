import { pnoise, simplex2 } from "./noise";
import type { Field2D } from "./types";

// ─── FieldExpr — Reified field computation as data ──────────────
//
// The free algebra over 2D scalar fields. Every TOP field operator
// produces a FieldExpr tree instead of an opaque closure.
//
// Two interpreters exist:
//   1. evalExpr()     — CPU evaluation (backward compat)
//   2. compileField() — GLSL codegen (GPU path, in field-compiler.ts)
//
// A third (serialization to JSON) comes free from the data representation.

// ─── AST ─────────────────────────────────────────────────────────

export type FieldExpr =
  // ── Coordinates ──
  | { readonly tag: "x" }
  | { readonly tag: "y" }

  // ── Literal ──
  | { readonly tag: "const"; readonly value: number }

  // ── Uniform — runtime-variable scalar (compiled to GLSL uniform) ──
  | { readonly tag: "uniform"; readonly name: string; readonly value: number }

  // ── Noise intrinsics ──
  | { readonly tag: "perlin"; readonly px: FieldExpr; readonly py: FieldExpr }
  | { readonly tag: "simplex"; readonly px: FieldExpr; readonly py: FieldExpr }

  // ── Binary arithmetic ──
  | { readonly tag: "add"; readonly a: FieldExpr; readonly b: FieldExpr }
  | { readonly tag: "sub"; readonly a: FieldExpr; readonly b: FieldExpr }
  | { readonly tag: "mul"; readonly a: FieldExpr; readonly b: FieldExpr }
  | { readonly tag: "div"; readonly a: FieldExpr; readonly b: FieldExpr }
  | { readonly tag: "min"; readonly a: FieldExpr; readonly b: FieldExpr }
  | { readonly tag: "max"; readonly a: FieldExpr; readonly b: FieldExpr }
  | { readonly tag: "pow"; readonly base: FieldExpr; readonly exp: FieldExpr }
  | { readonly tag: "atan2"; readonly y: FieldExpr; readonly x: FieldExpr }

  // ── Ternary ──
  | { readonly tag: "mix"; readonly a: FieldExpr; readonly b: FieldExpr; readonly t: FieldExpr }
  | { readonly tag: "clamp"; readonly a: FieldExpr; readonly lo: FieldExpr; readonly hi: FieldExpr }
  | { readonly tag: "smoothstep"; readonly edge0: FieldExpr; readonly edge1: FieldExpr; readonly x: FieldExpr }

  // ── Unary ──
  | { readonly tag: "abs"; readonly a: FieldExpr }
  | { readonly tag: "neg"; readonly a: FieldExpr }
  | { readonly tag: "floor"; readonly a: FieldExpr }
  | { readonly tag: "round"; readonly a: FieldExpr }

  // ── Coordinate transforms (call sub-field at different coords) ──
  | { readonly tag: "apply"; readonly fn: FieldExpr; readonly ax: FieldExpr; readonly ay: FieldExpr }
  | {
      readonly tag: "fbm";
      readonly source: FieldExpr;
      readonly octaves: FieldExpr;
      readonly lacunarity: FieldExpr;
      readonly gain: FieldExpr;
      readonly amplitude: FieldExpr;
    }
  | {
      readonly tag: "warp";
      readonly source: FieldExpr;
      readonly warp: FieldExpr;
      readonly amount: FieldExpr;
      readonly offsetX: FieldExpr;
      readonly offsetY: FieldExpr;
    };

// ─── Symbol-based tagging ────────────────────────────────────────
//
// Field2D stays `(x, y) => number`. We attach the FieldExpr as a
// hidden property via a well-known symbol. Consumers that don't know
// about FieldExpr call field(x, y) normally. GPU-aware consumers
// call getFieldExpr(field) to extract the AST.

export const FIELD_EXPR = Symbol.for("generative.field-expr");

/** Create a Field2D that carries its FieldExpr for GPU compilation. */
export function createField(expr: FieldExpr): Field2D {
  const fn = (x: number, y: number) => evalExpr(expr, x, y);
  Object.defineProperty(fn, FIELD_EXPR, { value: expr, enumerable: false });
  return fn;
}

/** Extract the FieldExpr from a Field2D, or undefined if it's an opaque closure. */
export function getFieldExpr(field: Field2D): FieldExpr | undefined {
  return (field as unknown as Record<symbol, FieldExpr | undefined>)[FIELD_EXPR];
}

// ─── CPU Interpreter ─────────────────────────────────────────────

/** Evaluate a FieldExpr at (x, y) on the CPU. */
export function evalExpr(expr: FieldExpr, x: number, y: number): number {
  switch (expr.tag) {
    // Coordinates
    case "x": return x;
    case "y": return y;

    // Literal / Uniform
    case "const": return expr.value;
    case "uniform": return expr.value;

    // Noise
    case "perlin": return pnoise(evalExpr(expr.px, x, y), evalExpr(expr.py, x, y));
    case "simplex": return simplex2(evalExpr(expr.px, x, y), evalExpr(expr.py, x, y));

    // Binary
    case "add": return evalExpr(expr.a, x, y) + evalExpr(expr.b, x, y);
    case "sub": return evalExpr(expr.a, x, y) - evalExpr(expr.b, x, y);
    case "mul": return evalExpr(expr.a, x, y) * evalExpr(expr.b, x, y);
    case "div": {
      const d = evalExpr(expr.b, x, y);
      return d === 0 ? 0 : evalExpr(expr.a, x, y) / d;
    }
    case "min": return Math.min(evalExpr(expr.a, x, y), evalExpr(expr.b, x, y));
    case "max": return Math.max(evalExpr(expr.a, x, y), evalExpr(expr.b, x, y));
    case "pow": return Math.pow(Math.max(0, evalExpr(expr.base, x, y)), evalExpr(expr.exp, x, y));
    case "atan2": return Math.atan2(evalExpr(expr.y, x, y), evalExpr(expr.x, x, y));

    // Ternary
    case "mix": {
      const va = evalExpr(expr.a, x, y);
      const vb = evalExpr(expr.b, x, y);
      const t = evalExpr(expr.t, x, y);
      return va + (vb - va) * t;
    }
    case "clamp": return Math.max(evalExpr(expr.lo, x, y), Math.min(evalExpr(expr.hi, x, y), evalExpr(expr.a, x, y)));
    case "smoothstep": {
      const lo = evalExpr(expr.edge0, x, y);
      const hi = evalExpr(expr.edge1, x, y);
      const v = evalExpr(expr.x, x, y);
      const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
      return t * t * (3 - 2 * t);
    }

    // Unary
    case "abs": return Math.abs(evalExpr(expr.a, x, y));
    case "neg": return -evalExpr(expr.a, x, y);
    case "floor": return Math.floor(evalExpr(expr.a, x, y));
    case "round": return Math.round(evalExpr(expr.a, x, y));

    // Coordinate transforms
    case "apply":
      return evalExpr(expr.fn, evalExpr(expr.ax, x, y), evalExpr(expr.ay, x, y));

    case "fbm": {
      const octaves = Math.round(evalExpr(expr.octaves, x, y));
      const lacunarity = evalExpr(expr.lacunarity, x, y);
      const gain = evalExpr(expr.gain, x, y);
      const amplitude = evalExpr(expr.amplitude, x, y);
      let sum = 0;
      let freq = 1;
      let amp = 1;
      let maxAmp = 0;
      for (let i = 0; i < octaves; i++) {
        sum += evalExpr(expr.source, x * freq, y * freq) * amp;
        maxAmp += amp;
        freq *= lacunarity;
        amp *= gain;
      }
      return (sum / maxAmp) * amplitude;
    }

    case "warp": {
      const amount = evalExpr(expr.amount, x, y);
      const offsetX = evalExpr(expr.offsetX, x, y);
      const offsetY = evalExpr(expr.offsetY, x, y);
      const wx = (evalExpr(expr.warp, x, y) - 0.5) * 2 * amount;
      const wy = (evalExpr(expr.warp, x + offsetX, y + offsetY) - 0.5) * 2 * amount;
      return evalExpr(expr.source, x + wx, y + wy);
    }
  }
}

// ─── Algebraic Builders ──────────────────────────────────────────
//
// Terse constructors for building FieldExpr trees in operator code.
// Named to read like math: add(mul(X, c(0.5)), Y)

export const X: FieldExpr = { tag: "x" };
export const Y: FieldExpr = { tag: "y" };

export function c(value: number): FieldExpr { return { tag: "const", value }; }
export function u(name: string, value: number): FieldExpr { return { tag: "uniform", name, value }; }

// Noise
export function perlin(px: FieldExpr, py: FieldExpr): FieldExpr { return { tag: "perlin", px, py }; }
export function simplex(px: FieldExpr, py: FieldExpr): FieldExpr { return { tag: "simplex", px, py }; }

// Binary
export function add(a: FieldExpr, b: FieldExpr): FieldExpr { return { tag: "add", a, b }; }
export function sub(a: FieldExpr, b: FieldExpr): FieldExpr { return { tag: "sub", a, b }; }
export function mul(a: FieldExpr, b: FieldExpr): FieldExpr { return { tag: "mul", a, b }; }
export function div(a: FieldExpr, b: FieldExpr): FieldExpr { return { tag: "div", a, b }; }
export function fmin(a: FieldExpr, b: FieldExpr): FieldExpr { return { tag: "min", a, b }; }
export function fmax(a: FieldExpr, b: FieldExpr): FieldExpr { return { tag: "max", a, b }; }
export function fpow(base: FieldExpr, exp: FieldExpr): FieldExpr { return { tag: "pow", base, exp }; }
export function fatan2(y: FieldExpr, x: FieldExpr): FieldExpr { return { tag: "atan2", y, x }; }

// Ternary
export function mix(a: FieldExpr, b: FieldExpr, t: FieldExpr): FieldExpr { return { tag: "mix", a, b, t }; }
export function clamp(a: FieldExpr, lo: FieldExpr, hi: FieldExpr): FieldExpr { return { tag: "clamp", a, lo, hi }; }
export function smoothstep(edge0: FieldExpr, edge1: FieldExpr, x: FieldExpr): FieldExpr { return { tag: "smoothstep", edge0, edge1, x }; }

// Unary
export function abs(a: FieldExpr): FieldExpr { return { tag: "abs", a }; }
export function neg(a: FieldExpr): FieldExpr { return { tag: "neg", a }; }
export function floor(a: FieldExpr): FieldExpr { return { tag: "floor", a }; }
export function round(a: FieldExpr): FieldExpr { return { tag: "round", a }; }

// Coordinate transforms
export function apply(fn: FieldExpr, ax: FieldExpr, ay: FieldExpr): FieldExpr { return { tag: "apply", fn, ax, ay }; }

export function fbmExpr(
  source: FieldExpr,
  octaves: FieldExpr,
  lacunarity: FieldExpr,
  gain: FieldExpr,
  amplitude: FieldExpr,
): FieldExpr {
  return { tag: "fbm", source, octaves, lacunarity, gain, amplitude };
}

export function warpExpr(
  source: FieldExpr,
  warp: FieldExpr,
  amount: FieldExpr,
  offsetX: FieldExpr,
  offsetY: FieldExpr,
): FieldExpr {
  return { tag: "warp", source, warp, amount, offsetX, offsetY };
}
