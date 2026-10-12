// ─── FieldExpr — reified field computation ──────────────────────
export type { FieldExpr } from "./expr";
export { FIELD_EXPR, createField, getFieldExpr, evalExpr } from "./expr";

// ─── Algebraic builders ──────────────────────────────────────────
export {
  X, Y, c, u,
  perlin, simplex,
  add, sub, mul, div, fmin, fmax, fpow, fatan2,
  mix, clamp, smoothstep,
  abs, neg, floor, round,
  apply, fbmExpr, warpExpr,
} from "./expr";

// ─── CPU noise ───────────────────────────────────────────────────
export { P, pnoise, simplex2 } from "./noise";

// ─── GLSL field compiler ─────────────────────────────────────────
export type { CompiledField } from "./glsl";
export { compileField } from "./glsl";
