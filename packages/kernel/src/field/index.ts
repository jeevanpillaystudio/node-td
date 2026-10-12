// ─── FieldExpr — reified field computation ──────────────────────
export type { FieldExpr } from "./expr";
// ─── Algebraic builders ──────────────────────────────────────────
export {
  abs,
  add,
  apply,
  c,
  clamp,
  createField,
  div,
  evalExpr,
  FIELD_EXPR,
  fatan2,
  fbmExpr,
  floor,
  fmax,
  fmin,
  fpow,
  getFieldExpr,
  mix,
  mul,
  neg,
  perlin,
  round,
  simplex,
  smoothstep,
  sub,
  u,
  warpExpr,
  X,
  Y,
} from "./expr";
// ─── GLSL field compiler ─────────────────────────────────────────
export type { CompiledField } from "./glsl";
export { compileField } from "./glsl";
// ─── CPU noise ───────────────────────────────────────────────────
export { P, pnoise, simplex2 } from "./noise";
