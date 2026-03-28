// ─── Core types ──────────────────────────────────────────────────
export type {
  OperatorCategory,
  PortType,
  PortDef,
  ParamDef,
  Field2D,
  Buffer2D,
  Geometry,
  Palette,
  Signal,
  Operator,
  NodeInstance,
} from "./core/types";

export {
  pointsGeometry,
  pathsGeometry,
  geometryToPaths,
  vertexAt,
} from "./core/types";

// ─── Graph engine ────────────────────────────────────────────────
export type { Wire, Graph } from "./core/graph";
export {
  validateGraph,
  evaluateGraph,
  collectParams,
  topoSort,
  terminalOutputs,
  findTerminalOutput,
} from "./core/graph";

// ─── Registry ────────────────────────────────────────────────────
export { OperatorRegistry } from "./core/registry";

// ─── All built-in operators ──────────────────────────────────────
import { perlinNoise } from "./operators/top/perlin-noise";
import { simplexNoise } from "./operators/top/simplex-noise";
import { gridSampler } from "./operators/top/grid-sampler";
import { circlePack } from "./operators/sop/circle-pack";
import { poissonDisc } from "./operators/sop/poisson-disc";
import { flowTracer } from "./operators/sop/flow-tracer";
import { dashStroke } from "./operators/sop/dash-stroke";
import { continuousStroke } from "./operators/sop/continuous-stroke";
import { parametricSurface } from "./operators/sop/parametric-surface";
import { quadtreeSubdivide } from "./operators/sop/quadtree-subdivide";
import { proceduralPalette } from "./operators/mat/procedural-palette";
import { OperatorRegistry } from "./core/registry";

import type { Operator } from "./core/types";

/** All built-in operators */
export const allOperators: Operator[] = [
  // TOP
  perlinNoise,
  simplexNoise,
  gridSampler,
  // SOP
  circlePack,
  poissonDisc,
  flowTracer,
  dashStroke,
  continuousStroke,
  parametricSurface,
  quadtreeSubdivide,
  // MAT
  proceduralPalette,
];

/** Create a registry pre-loaded with all built-in operators */
export function createDefaultRegistry(): OperatorRegistry {
  const registry = new OperatorRegistry();
  for (const op of allOperators) registry.register(op);
  return registry;
}
