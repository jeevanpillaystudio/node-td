import type { Graph } from "../kernel/graph";

/**
 * Debug patch 1: Base pipeline WITHOUT visibility-cull or diffuse-shade.
 * If this renders correctly, the base 3D pipeline is fine
 * and the bug is in the new operators.
 */
export const debugBaseGraph: Graph = {
  id: "debug-base",
  name: "Debug: Base 3D (no cull)",
  nodes: {
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },

    curl:    { type: "curl-noise", params: { epsilon: 1.5, scale: 1.0 } },
    grid:    { type: "grid-sampler", params: { resolution: 18 } },
    seeds:   { type: "poisson-disc", params: { minRadius: 14 } },
    trace:   { type: "flow-tracer", params: { numSteps: 40, stepLength: 3.5 } },
    stroke:  { type: "continuous-stroke" },

    lift:    { type: "surface-lift", params: { amplitude: 80, baseY: 0 } },
    cam3d:   { type: "camera-3d", params: {
      projection: 0,
      eyeX: 200, eyeY: 300, eyeZ: -200,
      targetX: 0, targetY: 0, targetZ: 0,
      orthoSize: 350,
    }},
    proj:    { type: "project-3d" },

    palette: { type: "procedural-palette", params: { count: 5, saturation: 0.55, lightness: 0.6, hueOffset: 200 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 1.0, strokeAlpha: 0.65, bgR: 12, bgG: 14, bgB: 18 } },
  },
  wires: [
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },
    { from: "ridge", output: "field", to: "curl", input: "field" },

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

    { from: "ridge",  output: "field",    to: "lift", input: "field" },
    { from: "stroke", output: "geometry", to: "lift", input: "geometry" },

    // Skip visibility-cull — go straight to projection
    { from: "lift", output: "geometry", to: "proj", input: "geometry" },
    { from: "cam3d", output: "camera3d", to: "proj", input: "camera3d" },

    { from: "$env", output: "width",  to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    { from: "proj",    output: "geometry", to: "render", input: "geometry" },
    { from: "camera",  output: "camera",   to: "render", input: "camera" },
    { from: "palette", output: "palette",  to: "render", input: "palette" },
  ],
};

/**
 * Debug patch 2: Base pipeline + visibility-cull ONLY (no diffuse-shade).
 * Tests whether the culler is the source of the "only outer lines" problem.
 */
export const debugCullGraph: Graph = {
  id: "debug-cull",
  name: "Debug: With Cull",
  nodes: {
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },

    curl:    { type: "curl-noise", params: { epsilon: 1.5, scale: 1.0 } },
    grid:    { type: "grid-sampler", params: { resolution: 18 } },
    seeds:   { type: "poisson-disc", params: { minRadius: 14 } },
    trace:   { type: "flow-tracer", params: { numSteps: 40, stepLength: 3.5 } },
    stroke:  { type: "continuous-stroke" },

    lift:    { type: "surface-lift", params: { amplitude: 80, baseY: 0 } },
    normals: { type: "geometric-normal", params: { epsilon: 0.00001, amplitude: 80 } },

    // Collision mesh
    colmesh: { type: "parametric-surface", params: { uSegments: 42, vSegments: 42, amplitude: 0 } },
    liftmesh:{ type: "surface-lift", params: { amplitude: 80, baseY: 0 } },

    cull:    { type: "visibility-cull" },
    cam3d:   { type: "camera-3d", params: {
      projection: 0,
      eyeX: 200, eyeY: 300, eyeZ: -200,
      targetX: 0, targetY: 0, targetZ: 0,
      orthoSize: 350,
    }},
    proj:    { type: "project-3d" },

    palette: { type: "procedural-palette", params: { count: 5, saturation: 0.55, lightness: 0.6, hueOffset: 200 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 1.0, strokeAlpha: 0.65, bgR: 12, bgG: 14, bgB: 18 } },
  },
  wires: [
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },
    { from: "ridge", output: "field", to: "curl", input: "field" },

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

    // Lift strokes + compute normals
    { from: "ridge",  output: "field",    to: "lift", input: "field" },
    { from: "stroke", output: "geometry", to: "lift", input: "geometry" },
    { from: "lift",  output: "geometry", to: "normals", input: "geometry" },
    { from: "ridge", output: "field",    to: "normals", input: "field" },

    // Collision mesh
    { from: "$env",     output: "height",   to: "colmesh",  input: "width" },
    { from: "$env",     output: "height",   to: "colmesh",  input: "height" },
    { from: "colmesh",  output: "geometry", to: "liftmesh", input: "geometry" },
    { from: "ridge",    output: "field",    to: "liftmesh", input: "field" },

    // Visibility cull
    { from: "normals",  output: "geometry", to: "cull", input: "geometry" },
    { from: "liftmesh", output: "geometry", to: "cull", input: "mesh" },
    { from: "cam3d",    output: "camera3d", to: "cull", input: "camera3d" },

    // Camera + projection
    { from: "$env", output: "width",  to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    { from: "cull", output: "geometry", to: "proj", input: "geometry" },
    { from: "cam3d", output: "camera3d", to: "proj", input: "camera3d" },

    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    { from: "proj",    output: "geometry", to: "render", input: "geometry" },
    { from: "camera",  output: "camera",   to: "render", input: "camera" },
    { from: "palette", output: "palette",  to: "render", input: "palette" },
  ],
};

/**
 * Debug patch 3: Renders the collision mesh as wireframe to verify
 * it covers the same area as the strokes.
 */
export const debugMeshGraph: Graph = {
  id: "debug-mesh",
  name: "Debug: Collision Mesh",
  nodes: {
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },

    colmesh: { type: "parametric-surface", params: { uSegments: 20, vSegments: 20, amplitude: 0 } },
    liftmesh:{ type: "surface-lift", params: { amplitude: 80, baseY: 0 } },

    cam3d:   { type: "camera-3d", params: {
      projection: 0,
      eyeX: 200, eyeY: 300, eyeZ: -200,
      targetX: 0, targetY: 0, targetZ: 0,
      orthoSize: 350,
    }},
    proj:    { type: "project-3d" },

    palette: { type: "procedural-palette", params: { count: 1, saturation: 0, lightness: 0.3, hueOffset: 0 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 0.5, strokeAlpha: 0.4, bgR: 12, bgG: 14, bgB: 18 } },
  },
  wires: [
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },

    { from: "$env",     output: "height",   to: "colmesh",  input: "width" },
    { from: "$env",     output: "height",   to: "colmesh",  input: "height" },
    { from: "colmesh",  output: "geometry", to: "liftmesh", input: "geometry" },
    { from: "ridge",    output: "field",    to: "liftmesh", input: "field" },

    { from: "$env", output: "width",  to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    { from: "liftmesh", output: "geometry", to: "proj", input: "geometry" },
    { from: "cam3d",    output: "camera3d", to: "proj", input: "camera3d" },

    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    { from: "proj",    output: "geometry", to: "render", input: "geometry" },
    { from: "camera",  output: "camera",   to: "render", input: "camera" },
    { from: "palette", output: "palette",  to: "render", input: "palette" },
  ],
};
