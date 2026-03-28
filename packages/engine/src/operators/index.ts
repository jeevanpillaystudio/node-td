// TOP — Texture Operators
export { perlinNoise, pnoise } from "./top/perlin-noise";
export { simplexNoise, simplex2 } from "./top/simplex-noise";
export { gridSampler } from "./top/grid-sampler";
export { fieldRender } from "./top/field-render";

// TOP — Field Algebra
export { fbm } from "./top/field/fbm";
export { domainWarp } from "./top/field/domain-warp";
export { fieldMath } from "./top/field/field-math";
export { fieldRemap } from "./top/field/field-remap";
export { fieldGradient } from "./top/field/field-gradient";
export { curlNoise } from "./top/field/curl-noise";

// SOP — Surface Operators
export { circlePack } from "./sop/circle-pack";
export { poissonDisc } from "./sop/poisson-disc";
export { flowTracer } from "./sop/flow-tracer";
export { dashStroke } from "./sop/dash-stroke";
export { continuousStroke } from "./sop/continuous-stroke";
export { parametricSurface } from "./sop/parametric-surface";
export { quadtreeSubdivide } from "./sop/quadtree-subdivide";

// MAT — Material Operators
export { proceduralPalette } from "./mat/procedural-palette";
export { oklabPalette } from "./mat/oklab-palette";
export { contrastFilter } from "./mat/contrast-filter";

// SOP — transforms & 3D pipeline
export { transform2d } from "./sop/transform-2d";
export { merge } from "./sop/merge";
export { surfaceLift } from "./sop/surface-lift";
export { project3d } from "./sop/project-3d";
export { geometricNormal } from "./sop/geometric-normal";
export { visibilityCull } from "./sop/visibility-cull";
export { baseOutline } from "./sop/base-outline";
export { contourRing } from "./sop/contour-ring";

// SOP — implicit surface / raymarching
export { surfaceRaymarch } from "./sop/surface-raymarch";
export { pointOrient } from "./sop/point-orient";

// MAT — shading
export { diffuseShade } from "./mat/diffuse-shade";

// ROP
export { camera2d } from "./rop/camera-2d";
export { camera3d } from "./rop/camera-3d";
export { strokeRenderer } from "./rop/stroke-renderer";
export { pointRenderer } from "./rop/point-renderer";
export { composite } from "./rop/composite";
