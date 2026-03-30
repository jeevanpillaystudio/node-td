import type { Graph } from "@node-td/engine";

/**
 * Phase 2 Debug 1: Independent flow noise vs curl.
 *
 * Renders ONLY the 2D flow-traced strokes (no 3D projection, no cull).
 * Uses the new independent simplex noise at scale 0.003 for flow direction.
 * Compare with debugFlowCurlGraph to see the difference.
 */
export const debugFlowNoiseGraph: Graph = {
  id: "debug-flow-noise",
  name: "Debug: Flow (Independent Noise)",
  nodes: {
    flow:    { type: "simplex-noise", params: { noiseScale: 0.003 } },
    grid:    { type: "grid-sampler", params: { resolution: 18 } },
    seeds:   { type: "poisson-disc", params: { minRadius: 14 } },
    trace:   { type: "flow-tracer", params: { numSteps: 40, stepLength: 3.5 } },
    stroke:  { type: "continuous-stroke" },
    palette: { type: "procedural-palette", params: { count: 3, saturation: 0.55, lightness: 0.6, hueOffset: 200 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 1.0, strokeAlpha: 0.65, bgR: 12, bgG: 14, bgB: 18 } },
  },
  wires: [
    { from: "flow",  output: "field",  to: "grid", input: "field" },
    { from: "$env",  output: "height", to: "grid", input: "width" },
    { from: "$env",  output: "height", to: "grid", input: "height" },

    { from: "$env", output: "height", to: "seeds", input: "width" },
    { from: "$env", output: "height", to: "seeds", input: "height" },

    { from: "grid",  output: "buffer",   to: "trace", input: "buffer" },
    { from: "seeds", output: "geometry", to: "trace", input: "geometry" },
    { from: "$env",  output: "height",   to: "trace", input: "width" },
    { from: "$env",  output: "height",   to: "trace", input: "height" },

    { from: "trace", output: "geometry", to: "stroke", input: "geometry" },

    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    { from: "stroke", output: "geometry", to: "render", input: "geometry" },
    { from: "camera", output: "camera",   to: "render", input: "camera" },
    { from: "palette", output: "palette",  to: "render", input: "palette" },
  ],
};

/**
 * Phase 2 Debug 2: Curl-based flow (the OLD approach) for comparison.
 *
 * Same structure as debugFlowNoiseGraph but uses curl of a terrain field
 * for flow direction. Strokes should follow terrain contours.
 */
export const debugFlowCurlGraph: Graph = {
  id: "debug-flow-curl",
  name: "Debug: Flow (Curl of Terrain)",
  nodes: {
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },
    curl:    { type: "curl-noise", params: { epsilon: 1.5, scale: 1.0 } },
    grid:    { type: "grid-sampler", params: { resolution: 18 } },
    seeds:   { type: "poisson-disc", params: { minRadius: 14 } },
    trace:   { type: "flow-tracer", params: { numSteps: 40, stepLength: 3.5 } },
    stroke:  { type: "continuous-stroke" },
    palette: { type: "procedural-palette", params: { count: 3, saturation: 0.55, lightness: 0.6, hueOffset: 200 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 1.0, strokeAlpha: 0.65, bgR: 12, bgG: 14, bgB: 18 } },
  },
  wires: [
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },
    { from: "ridge",   output: "field", to: "curl",    input: "field" },

    { from: "curl",  output: "field",  to: "grid", input: "field" },
    { from: "$env",  output: "height", to: "grid", input: "width" },
    { from: "$env",  output: "height", to: "grid", input: "height" },

    { from: "$env", output: "height", to: "seeds", input: "width" },
    { from: "$env", output: "height", to: "seeds", input: "height" },

    { from: "grid",  output: "buffer",   to: "trace", input: "buffer" },
    { from: "seeds", output: "geometry", to: "trace", input: "geometry" },
    { from: "$env",  output: "height",   to: "trace", input: "width" },
    { from: "$env",  output: "height",   to: "trace", input: "height" },

    { from: "trace", output: "geometry", to: "stroke", input: "geometry" },

    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    { from: "stroke", output: "geometry", to: "render", input: "geometry" },
    { from: "camera", output: "camera",   to: "render", input: "camera" },
    { from: "palette", output: "palette",  to: "render", input: "palette" },
  ],
};

/**
 * Phase 2 Debug 3: Contour rings ONLY (no strokes).
 *
 * Renders just the contour rings projected through the 3D camera.
 * Verifies the contour-ring operator and its 3D projection.
 */
export const debugContourGraph: Graph = {
  id: "debug-contour",
  name: "Debug: Contour Rings Only",
  nodes: {
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },

    contour: { type: "contour-ring", params: { levels: 5, samples: 150, amplitude: 80, baseY: 0 } },
    cam3d:   { type: "camera-3d", params: {
      projection: 0,
      eyeX: 1.0, eyeY: 1.0, eyeZ: 1.0,
      targetX: 0, targetY: 0, targetZ: 0,
      orthoSize: 1.61,
    }},
    proj:    { type: "project-3d" },

    palette: { type: "procedural-palette", params: { count: 3, saturation: 0.4, lightness: 0.7, hueOffset: 120 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 0.8, strokeAlpha: 0.5, bgR: 12, bgG: 14, bgB: 18 } },
  },
  wires: [
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },

    { from: "ridge", output: "field",  to: "contour", input: "field" },
    { from: "$env",  output: "height", to: "contour", input: "width" },
    { from: "$env",  output: "height", to: "contour", input: "height" },

    { from: "$env", output: "width",  to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    { from: "contour", output: "geometry", to: "proj", input: "geometry" },
    { from: "cam3d",   output: "camera3d", to: "proj", input: "camera3d" },

    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    { from: "proj",    output: "geometry", to: "render", input: "geometry" },
    { from: "camera",  output: "camera",   to: "render", input: "camera" },
    { from: "palette", output: "palette",  to: "render", input: "palette" },
  ],
};

/**
 * Phase 2 Debug 4: Base outline ONLY (wireframe, no fill).
 *
 * Renders just the base outline polygon projected through the 3D camera.
 * Verifies the base-outline operator and that the polygon closes correctly.
 */
export const debugBaseOutlineGraph: Graph = {
  id: "debug-base-outline",
  name: "Debug: Base Outline Only",
  nodes: {
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },

    base:    { type: "base-outline", params: { samples: 150, amplitude: 80, baseY: 0 } },
    cam3d:   { type: "camera-3d", params: {
      projection: 0,
      eyeX: 1.0, eyeY: 1.0, eyeZ: 1.0,
      targetX: 0, targetY: 0, targetZ: 0,
      orthoSize: 1.61,
    }},
    proj:    { type: "project-3d" },

    palette: { type: "procedural-palette", params: { count: 1, saturation: 0, lightness: 0.5, hueOffset: 0 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 1.2, strokeAlpha: 0.8, bgR: 12, bgG: 14, bgB: 18 } },
  },
  wires: [
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },

    { from: "ridge", output: "field",  to: "base", input: "field" },
    { from: "$env",  output: "height", to: "base", input: "width" },
    { from: "$env",  output: "height", to: "base", input: "height" },

    { from: "$env", output: "width",  to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    { from: "base",  output: "geometry", to: "proj", input: "geometry" },
    { from: "cam3d", output: "camera3d", to: "proj", input: "camera3d" },

    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    { from: "proj",    output: "geometry", to: "render", input: "geometry" },
    { from: "camera",  output: "camera",   to: "render", input: "camera" },
    { from: "palette", output: "palette",  to: "render", input: "palette" },
  ],
};

/**
 * Phase 2 Debug 5: Contour + Base combined (wireframe overlay).
 *
 * Renders both base outline and contour rings together to verify
 * they align correctly and form the complete terrain base structure.
 */
export const debugBaseContourGraph: Graph = {
  id: "debug-base-contour",
  name: "Debug: Base + Contour Combined",
  nodes: {
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },

    base:    { type: "base-outline", params: { samples: 150, amplitude: 80, baseY: 0 } },
    contour: { type: "contour-ring", params: { levels: 5, samples: 150, amplitude: 80, baseY: 0 } },

    cam3d:   { type: "camera-3d", params: {
      projection: 0,
      eyeX: 1.0, eyeY: 1.0, eyeZ: 1.0,
      targetX: 0, targetY: 0, targetZ: 0,
      orthoSize: 1.61,
    }},

    // Project base + contour separately, then render each
    "proj-base":    { type: "project-3d" },
    "proj-contour": { type: "project-3d" },

    camera:  { type: "camera-2d" },
    palette: { type: "procedural-palette", params: { count: 3, saturation: 0.4, lightness: 0.65, hueOffset: 180 } },

    // Base: thicker, brighter
    "render-base": { type: "stroke-renderer", params: {
      lineWidth: 1.2, strokeAlpha: 0.8,
      bgR: 12, bgG: 14, bgB: 18,
    }},
    // Contour: thinner, dimmer, transparent bg
    "render-cont": { type: "stroke-renderer", params: {
      lineWidth: 0.5, strokeAlpha: 0.4,
      bgR: 0, bgG: 0, bgB: 0, bgAlpha: 0,
    }},

    comp: { type: "composite", params: { mode: 0 } },
  },
  wires: [
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },

    // Base outline
    { from: "ridge", output: "field",  to: "base", input: "field" },
    { from: "$env",  output: "height", to: "base", input: "width" },
    { from: "$env",  output: "height", to: "base", input: "height" },

    // Contour rings
    { from: "ridge", output: "field",  to: "contour", input: "field" },
    { from: "$env",  output: "height", to: "contour", input: "width" },
    { from: "$env",  output: "height", to: "contour", input: "height" },

    // Camera 3D
    { from: "$env", output: "width",  to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    // Project both
    { from: "base",    output: "geometry", to: "proj-base",    input: "geometry" },
    { from: "cam3d",   output: "camera3d", to: "proj-base",    input: "camera3d" },
    { from: "contour", output: "geometry", to: "proj-contour", input: "geometry" },
    { from: "cam3d",   output: "camera3d", to: "proj-contour", input: "camera3d" },

    // Camera 2D
    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    // Render base (bottom layer)
    { from: "proj-base", output: "geometry", to: "render-base", input: "geometry" },
    { from: "camera",    output: "camera",   to: "render-base", input: "camera" },
    { from: "palette",   output: "palette",  to: "render-base", input: "palette" },

    // Render contour (overlay layer)
    { from: "proj-contour", output: "geometry", to: "render-cont", input: "geometry" },
    { from: "camera",       output: "camera",   to: "render-cont", input: "camera" },
    { from: "palette",      output: "palette",  to: "render-cont", input: "palette" },

    // Composite: base + contour
    { from: "render-base", output: "buffer", to: "comp", input: "layers" },
    { from: "render-cont", output: "buffer", to: "comp", input: "layers" },
  ],
};

/**
 * Phase 2 Debug 6: Full pipeline with independent flow noise (no composite).
 *
 * The complete 3D terrain with all Phase 1 + Phase 2 features except
 * the composite layer — renders strokes only. Tests that the flow noise
 * change doesn't break the existing cull/shade/project pipeline.
 */
export const debugFullFlowGraph: Graph = {
  id: "debug-full-flow",
  name: "Debug: Full 3D + Indep. Flow",
  nodes: {
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },

    // Independent flow noise (Phase 2 change)
    flow:    { type: "simplex-noise", params: { noiseScale: 0.003 } },
    grid:    { type: "grid-sampler", params: { resolution: 18 } },
    seeds:   { type: "poisson-disc", params: { minRadius: 14 } },
    trace:   { type: "flow-tracer", params: { numSteps: 40, stepLength: 3.5 } },
    stroke:  { type: "continuous-stroke" },

    lift:    { type: "surface-lift", params: { amplitude: 80, baseY: 0 } },
    normals: { type: "geometric-normal", params: { epsilon: 0.00001, amplitude: 80 } },
    colmesh: { type: "parametric-surface", params: { uSegments: 42, vSegments: 42, amplitude: 0 } },
    liftmesh:{ type: "surface-lift", params: { amplitude: 80, baseY: 0 } },
    cull:    { type: "visibility-cull" },
    cam3d:   { type: "camera-3d", params: {
      projection: 0,
      eyeX: 1.0, eyeY: 1.0, eyeZ: 1.0,
      targetX: 0, targetY: 0, targetZ: 0,
      orthoSize: 1.61,
    }},
    proj:    { type: "project-3d" },

    shade:   { type: "diffuse-shade", params: {
      lightX: 0, lightY: -0.707, lightZ: -0.707,
      steps: 4, ambient: 0.1,
    }},

    palette: { type: "procedural-palette", params: { count: 5, saturation: 0.55, lightness: 0.6, hueOffset: 200 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 1.0, strokeAlpha: 0.65, bgR: 12, bgG: 14, bgB: 18 } },
  },
  wires: [
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },

    // Independent flow noise → grid (NOT curl)
    { from: "flow",  output: "field",  to: "grid", input: "field" },
    { from: "$env",  output: "height", to: "grid", input: "width" },
    { from: "$env",  output: "height", to: "grid", input: "height" },

    { from: "$env", output: "height", to: "seeds", input: "width" },
    { from: "$env", output: "height", to: "seeds", input: "height" },

    { from: "grid",  output: "buffer",   to: "trace", input: "buffer" },
    { from: "seeds", output: "geometry", to: "trace", input: "geometry" },
    { from: "$env",  output: "height",   to: "trace", input: "width" },
    { from: "$env",  output: "height",   to: "trace", input: "height" },

    { from: "trace", output: "geometry", to: "stroke", input: "geometry" },

    { from: "ridge",  output: "field",    to: "lift", input: "field" },
    { from: "stroke", output: "geometry", to: "lift", input: "geometry" },

    { from: "lift",  output: "geometry", to: "normals", input: "geometry" },
    { from: "ridge", output: "field",    to: "normals", input: "field" },

    { from: "$env",     output: "height",   to: "colmesh",  input: "width" },
    { from: "$env",     output: "height",   to: "colmesh",  input: "height" },
    { from: "colmesh",  output: "geometry", to: "liftmesh", input: "geometry" },
    { from: "ridge",    output: "field",    to: "liftmesh", input: "field" },

    { from: "normals",  output: "geometry", to: "cull", input: "geometry" },
    { from: "liftmesh", output: "geometry", to: "cull", input: "mesh" },
    { from: "cam3d",    output: "camera3d", to: "cull", input: "camera3d" },

    { from: "$env", output: "width",  to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    { from: "cull", output: "geometry", to: "proj", input: "geometry" },
    { from: "cam3d", output: "camera3d", to: "proj", input: "camera3d" },

    { from: "cull",    output: "geometry", to: "shade", input: "geometry" },
    { from: "palette", output: "palette",  to: "shade", input: "palette" },

    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    { from: "proj",   output: "geometry", to: "render", input: "geometry" },
    { from: "camera", output: "camera",   to: "render", input: "camera" },
    { from: "shade",  output: "palette",  to: "render", input: "palette" },
  ],
};
