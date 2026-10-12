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
  EnvValues,
  EnvKey,
  Capabilities,
  NodeRng,
  NodeEnv,
  Operator,
  NodeInstance,
} from "./types";
export { isEnumParam } from "./types";

// ─── Typed operators ─────────────────────────────────────────────
export type {
  PortValues,
  PortValue,
  InputValue,
  InputsOf,
  OutputsOf,
  ParamsOf,
  TypedOperator,
} from "./define";
export { defineOperator } from "./define";

// ─── Geometry helpers ────────────────────────────────────────────
export {
  pointsGeometry,
  pathsGeometry,
  pathsGeometry3,
  geometryToPaths,
  vertexAt,
  withPositions,
  forEachStrip,
  filterVertices,
} from "./geometry";

// ─── Graph ───────────────────────────────────────────────────────
export type { Wire, Graph } from "./graph";
export {
  validateGraph,
  GraphValidationError,
  lintParams,
  lintParamDefs,
  collectParams,
  topoSort,
} from "./graph";

// ─── Environment source ($env) ───────────────────────────────────
export type { EnvOutput } from "./env";
export { ENV_SOURCE, ENV_OUTPUTS, isEnvSource, envOutputType } from "./env";

// ─── Cook engine ─────────────────────────────────────────────────
export type { CookStats, NodeError } from "./cook";
export { CookEngine } from "./cook";

// ─── Registry ────────────────────────────────────────────────────
export { OperatorRegistry } from "./registry";

// ─── Seeded PRNG ─────────────────────────────────────────────────
export type { RngState } from "./rng";
export { SeededRNG } from "./rng";
