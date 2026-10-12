import type { Operator } from "@node-td/kernel";
import { OperatorRegistry } from "@node-td/kernel";
import { proceduralPalette } from "./chop/procedural-palette";
import { oklabPalette } from "./chop/oklab-palette";
import { contrastFilter } from "./chop/contrast-filter";
import { camera2d } from "./comp/camera-2d";
import { camera3d } from "./comp/camera-3d";
import { perlinNoise } from "./field/perlin-noise";
import { simplexNoise } from "./field/simplex-noise";
import { fbm } from "./field/fbm";
import { domainWarp } from "./field/domain-warp";
import { fieldMath } from "./field/field-math";
import { fieldRemap } from "./field/field-remap";
import { fieldGradient } from "./field/field-gradient";
import { curlAngle } from "./field/curl-angle";
import { diffuseShade } from "./mat/diffuse-shade";
import { circlePack } from "./sop/circle-pack";
import { poissonDisc } from "./sop/poisson-disc";
import { flowTracer } from "./sop/flow-tracer";
import { dashStroke } from "./sop/dash-stroke";
import { parametricSurface } from "./sop/parametric-surface";
import { quadtreeSubdivide } from "./sop/quadtree-subdivide";
import { binarySubdivide } from "./sop/binary-subdivide";
import { transform2d } from "./sop/transform-2d";
import { merge } from "./sop/merge";
import { project3d } from "./sop/camera/project-3d";
import { visibilityCull } from "./sop/camera/visibility-cull";
import { surfaceLift } from "./sop/heightfield/surface-lift";
import { geometricNormal } from "./sop/heightfield/geometric-normal";
import { surfaceRaymarch } from "./sop/heightfield/surface-raymarch";
import { pointOrient } from "./sop/meridian/point-orient";
import { baseOutline } from "./sop/subscapes/base-outline";
import { contourRing } from "./sop/subscapes/contour-ring";
import { gridSampler } from "./top/grid-sampler";
import { fieldRender } from "./top/field-render";
import { strokeRenderer } from "./top/stroke-renderer";
import { composite } from "./top/composite";

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
  curlAngle,
  // SOP
  circlePack,
  poissonDisc,
  flowTracer,
  dashStroke,
  parametricSurface,
  quadtreeSubdivide,
  binarySubdivide,
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
  composite,
];

/** Create a registry pre-loaded with all built-in operators */
export function createDefaultRegistry(): OperatorRegistry {
  const registry = new OperatorRegistry();
  for (const op of allOperators) registry.register(op);
  return registry;
}

let shared: OperatorRegistry | undefined;

/**
 * The one shared registry of all built-in operators, made on first use.
 * Hosts read from it; code that registers operators of its own takes a
 * fresh createDefaultRegistry() instead, so the shared one never changes.
 */
export function defaultRegistry(): OperatorRegistry {
  shared ??= createDefaultRegistry();
  return shared;
}
