// ─── Data model ──────────────────────────────────────────────────
export type {
  OperatorCategory,
  PortType,
  PortDef,
  ParamDef,
  NumericParamDef,
  EnumParamDef,
  Field2D,
  CanvasHandle,
  Buffer2D,
  Geometry,
  Palette,
  Camera2D,
  Camera3D,
  GraphEnv,
  Operator,
  NodeInstance,
} from "./types";
export { isEnumParam } from "./types";

// ─── Geometry helpers ────────────────────────────────────────────
export { pointsGeometry, pathsGeometry, geometryToPaths, vertexAt } from "./types";

// ─── Graph ───────────────────────────────────────────────────────
export type { Wire, Graph } from "./graph";
export { validateGraph, GraphValidationError, collectParams, topoSort } from "./graph";

// ─── Environment source ($env) ───────────────────────────────────
export type { EnvOutput } from "./env";
export { ENV_SOURCE, ENV_OUTPUTS, isEnvSource, envOutputType } from "./env";

// ─── Cook engine ─────────────────────────────────────────────────
export type { CookStats } from "./cook";
export { CookEngine } from "./cook";

// ─── Registry ────────────────────────────────────────────────────
export { OperatorRegistry } from "./registry";

// ─── Seeded PRNG ─────────────────────────────────────────────────
export { SeededRNG } from "./rng";
