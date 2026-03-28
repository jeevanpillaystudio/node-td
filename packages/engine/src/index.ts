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
  Camera3D,
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

// ─── FieldExpr — reified field computation ──────────────────────
export type { FieldExpr } from "./kernel/field-expr";
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
} from "./kernel/field-expr";

// ─── GLSL field compiler ─────────────────────────────────────────
export type { CompiledField } from "./kernel/field-compiler";
export { compileField } from "./kernel/field-compiler";

// ─── Graph engine ────────────────────────────────────────────────
export type { Wire, Graph } from "./kernel/graph";
export {
  validateGraph,
  collectParams,
  topoSort,
  terminalOutputs,
  findTerminalOutput,
} from "./kernel/graph";

// ─── Cook engine ─────────────────────────────────────────────────
export type { CookStats } from "./kernel/cook";
export { CookEngine } from "./kernel/cook";

// ─── Registry ────────────────────────────────────────────────────
export { OperatorRegistry } from "./kernel/registry";

// ─── Seeded PRNG ─────────────────────────────────────────────────
export { SeededRNG } from "./kernel/rng";

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
import { oklabPalette } from "./operators/mat/oklab-palette";
import { contrastFilter } from "./operators/mat/contrast-filter";
import { transform2d } from "./operators/sop/transform-2d";
import { merge } from "./operators/sop/merge";
import { surfaceLift } from "./operators/sop/surface-lift";
import { project3d } from "./operators/sop/project-3d";
import { geometricNormal } from "./operators/sop/geometric-normal";
import { visibilityCull } from "./operators/sop/visibility-cull";
import { baseOutline } from "./operators/sop/base-outline";
import { contourRing } from "./operators/sop/contour-ring";
import { surfaceRaymarch } from "./operators/sop/surface-raymarch";
import { pointOrient } from "./operators/sop/point-orient";
import { diffuseShade } from "./operators/mat/diffuse-shade";
import { camera2d } from "./operators/rop/camera-2d";
import { camera3d } from "./operators/rop/camera-3d";
import { strokeRenderer } from "./operators/rop/stroke-renderer";
import { pointRenderer } from "./operators/rop/point-renderer";
import { composite } from "./operators/rop/composite";
import { fieldRender } from "./operators/top/field-render";
import { OperatorRegistry } from "./kernel/registry";

import type { Operator } from "./kernel/types";

/** All built-in operators */
export const allOperators: Operator[] = [
  // TOP — sources
  perlinNoise,
  simplexNoise,
  gridSampler,
  fieldRender,
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
  surfaceLift,
  project3d,
  geometricNormal,
  visibilityCull,
  baseOutline,
  contourRing,
  surfaceRaymarch,
  pointOrient,
  // MAT
  proceduralPalette,
  oklabPalette,
  contrastFilter,
  diffuseShade,
  // ROP
  camera2d,
  camera3d,
  strokeRenderer,
  pointRenderer,
  composite,
];

// ─── Patches ─────────────────────────────────────────────────────
export { meridianGraph } from "./patches/meridian";

/** Create a registry pre-loaded with all built-in operators */
export function createDefaultRegistry(): OperatorRegistry {
  const registry = new OperatorRegistry();
  for (const op of allOperators) registry.register(op);
  return registry;
}
