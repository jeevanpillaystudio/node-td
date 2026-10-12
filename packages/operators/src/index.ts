import type { Operator } from "@node-td/kernel";
import { OperatorRegistry } from "@node-td/kernel";
import { contrastFilter } from "./chop/contrast-filter";
import { oklabPalette } from "./chop/oklab-palette";
import { proceduralPalette } from "./chop/procedural-palette";
import { camera2d } from "./comp/camera-2d";
import { camera3d } from "./comp/camera-3d";
import { curlAngle } from "./field/curl-angle";
import { domainWarp } from "./field/domain-warp";
import { fbm } from "./field/fbm";
import { fieldGradient } from "./field/field-gradient";
import { fieldMath } from "./field/field-math";
import { fieldRemap } from "./field/field-remap";
import { perlinNoise } from "./field/perlin-noise";
import { simplexNoise } from "./field/simplex-noise";
import { binarySubdivide } from "./sop/binary-subdivide";
import { project3d } from "./sop/camera/project-3d";
import { visibilityCull } from "./sop/camera/visibility-cull";
import { circlePack } from "./sop/circle-pack";
import { dashStroke } from "./sop/dash-stroke";
import { diffuseShade } from "./sop/diffuse-shade";
import { flowTracer } from "./sop/flow-tracer";
import { geometricNormal } from "./sop/heightfield/geometric-normal";
import { surfaceLift } from "./sop/heightfield/surface-lift";
import { surfaceRaymarch } from "./sop/heightfield/surface-raymarch";
import { merge } from "./sop/merge";
import { pointOrient } from "./sop/meridian/point-orient";
import { parametricSurface } from "./sop/parametric-surface";
import { poissonDisc } from "./sop/poisson-disc";
import { quadtreeSubdivide } from "./sop/quadtree-subdivide";
import { baseOutline } from "./sop/subscapes/base-outline";
import { contourRing } from "./sop/subscapes/contour-ring";
import { transform2d } from "./sop/transform-2d";
import { composite } from "./top/composite";
import { fieldRender } from "./top/field-render";
import { gridSampler } from "./top/grid-sampler";
import { strokeRenderer } from "./top/stroke-renderer";

/** All built-in operators */
export const allOperators: Operator[] = [
  // FIELD — sources
  perlinNoise,
  simplexNoise,
  // FIELD — algebra
  fbm,
  domainWarp,
  fieldMath,
  fieldRemap,
  fieldGradient,
  curlAngle,
  // TOP
  gridSampler,
  fieldRender,
  strokeRenderer,
  composite,
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
  diffuseShade,
  // CHOP
  proceduralPalette,
  oklabPalette,
  contrastFilter,
  // COMP
  camera2d,
  camera3d,
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
