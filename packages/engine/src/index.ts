// ─── Core types ──────────────────────────────────────────────────
export type {
  OperatorCategory,
  PortType,
  PortDef,
  ParamDef,
  NumericParamDef,
  EnumParamDef,
  Field2D,
  Buffer2D,
  Geometry,
  Palette,
  Camera2D,
  Camera3D,
  GraphEnv,
  Operator,
  NodeInstance,
} from "@node-td/kernel";

export {
  isEnumParam,
  pointsGeometry,
  pathsGeometry,
  geometryToPaths,
  vertexAt,
} from "@node-td/kernel";

// ─── FieldExpr — reified field computation ──────────────────────
export type { FieldExpr } from "@node-td/kernel/field";
export {
  FIELD_EXPR,
  createField,
  getFieldExpr,
  evalExpr,
  // Algebraic builders
  X, Y, c, u,
  perlin, simplex,
  add, sub, mul, div, fmin, fmax, fpow, fatan2,
  mix, clamp, smoothstep,
  abs, neg, floor, round,
  apply, fbmExpr, warpExpr,
} from "@node-td/kernel/field";

// ─── GLSL field compiler ─────────────────────────────────────────
export type { CompiledField } from "@node-td/kernel/field";
export { compileField } from "@node-td/kernel/field";

// ─── Graph engine ────────────────────────────────────────────────
export type { Wire, Graph } from "@node-td/kernel";
export { validateGraph, collectParams, topoSort } from "@node-td/kernel";

// ─── Cook engine ─────────────────────────────────────────────────
export type { CookStats } from "@node-td/kernel";
export { CookEngine } from "@node-td/kernel";

// ─── Registry ────────────────────────────────────────────────────
export { OperatorRegistry } from "@node-td/kernel";

// ─── Seeded PRNG ─────────────────────────────────────────────────
export { SeededRNG } from "@node-td/kernel";

// ─── All built-in operators ──────────────────────────────────────
export { allOperators, createDefaultRegistry } from "@node-td/operators";
