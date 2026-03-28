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
  Signal,
  Camera2D,
  GraphEnv,
  Operator,
  NodeInstance,
} from "./kernel/types";

export {
  isEnumParam,
  pointsGeometry,
  pathsGeometry,
  geometryToPaths,
  vertexAt,
} from "./kernel/types";

// ─── Graph engine ────────────────────────────────────────────────
export type { Wire, Graph } from "./kernel/graph";
export {
  validateGraph,
  evaluateGraph,
  collectParams,
  topoSort,
  terminalOutputs,
  findTerminalOutput,
} from "./kernel/graph";

// ─── Registry ────────────────────────────────────────────────────
export { OperatorRegistry } from "./kernel/registry";

// ─── All built-in operators ──────────────────────────────────────
import { perlinNoise } from "./operators/top/perlin-noise";
import { simplexNoise } from "./operators/top/simplex-noise";
import { gridSampler } from "./operators/top/grid-sampler";
import { fbm } from "./operators/top/field/fbm";
import { domainWarp } from "./operators/top/field/domain-warp";
import { fieldMath } from "./operators/top/field/field-math";
import { fieldRemap } from "./operators/top/field/field-remap";
import { fieldGradient } from "./operators/top/field/field-gradient";
import { curlNoise } from "./operators/top/field/curl-noise";
import { circlePack } from "./operators/sop/circle-pack";
import { poissonDisc } from "./operators/sop/poisson-disc";
import { flowTracer } from "./operators/sop/flow-tracer";
import { dashStroke } from "./operators/sop/dash-stroke";
import { continuousStroke } from "./operators/sop/continuous-stroke";
import { parametricSurface } from "./operators/sop/parametric-surface";
import { quadtreeSubdivide } from "./operators/sop/quadtree-subdivide";
import { proceduralPalette } from "./operators/mat/procedural-palette";
import { transform2d } from "./operators/sop/transform-2d";
import { merge } from "./operators/sop/merge";
import { camera2d } from "./operators/rop/camera-2d";
import { strokeRenderer } from "./operators/rop/stroke-renderer";
import { pointRenderer } from "./operators/rop/point-renderer";
import { composite } from "./operators/rop/composite";
import { OperatorRegistry } from "./kernel/registry";

import type { Operator } from "./kernel/types";

/** All built-in operators */
export const allOperators: Operator[] = [
  // TOP — sources
  perlinNoise,
  simplexNoise,
  gridSampler,
  // TOP — field algebra
  fbm,
  domainWarp,
  fieldMath,
  fieldRemap,
  fieldGradient,
  curlNoise,
  // SOP
  circlePack,
  poissonDisc,
  flowTracer,
  dashStroke,
  continuousStroke,
  parametricSurface,
  quadtreeSubdivide,
  transform2d,
  merge,
  // MAT
  proceduralPalette,
  // ROP
  camera2d,
  strokeRenderer,
  pointRenderer,
  composite,
];

/** Create a registry pre-loaded with all built-in operators */
export function createDefaultRegistry(): OperatorRegistry {
  const registry = new OperatorRegistry();
  for (const op of allOperators) registry.register(op);
  return registry;
}
