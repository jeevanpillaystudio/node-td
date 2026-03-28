import type { Graph } from "../kernel/graph";

/**
 * Subscapes Terrain patch — demonstrates the full field algebra pipeline.
 *
 * Signal flow:
 *   simplex-noise → fbm (6 octaves) → field-remap (ridge)
 *     → curl-noise (contour-following flow) → grid-sampler
 *       → poisson-disc (seeds) + flow-tracer → continuous-stroke
 *         → stroke-renderer + camera-2d + procedural-palette
 *
 * The curl of the ridged terrain produces a divergence-free flow field
 * that follows contour lines — strokes orbit ridges and valleys,
 * creating the topographic aesthetic of Matt DesLauriers' subscapes.
 *
 * Terminal output: "render" node, port "buffer" (Buffer2D, RGBA).
 */
export const subscapesTerrainGraph: Graph = {
  id: "subscapes-terrain",
  name: "Subscapes Terrain",
  nodes: {
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },
    curl:    { type: "curl-noise", params: { epsilon: 1.5, scale: 1.0 } },
    grid:    { type: "grid-sampler", params: { resolution: 18 } },
    seeds:   { type: "poisson-disc", params: { minRadius: 8 } },
    trace:   { type: "flow-tracer", params: { numSteps: 60, stepLength: 2.5 } },
    stroke:  { type: "continuous-stroke" },
    palette: { type: "procedural-palette", params: { count: 5, saturation: 0.6, lightness: 0.55, hueOffset: 45 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 1.2, strokeAlpha: 0.7, bgR: 15, bgG: 15, bgB: 20 } },
  },
  wires: [
    // Field algebra chain: noise → fbm → ridge → curl
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },
    { from: "ridge",   output: "field", to: "curl",    input: "field" },

    // Discretize curl flow field
    { from: "curl",  output: "field",  to: "grid", input: "field" },
    { from: "$env",  output: "width",  to: "grid", input: "width" },
    { from: "$env",  output: "height", to: "grid", input: "height" },

    // Seed positions
    { from: "$env", output: "width",  to: "seeds", input: "width" },
    { from: "$env", output: "height", to: "seeds", input: "height" },

    // Flow tracing
    { from: "grid",  output: "buffer",   to: "trace", input: "buffer" },
    { from: "seeds", output: "geometry", to: "trace", input: "geometry" },
    { from: "$env",  output: "width",    to: "trace", input: "width" },
    { from: "$env",  output: "height",   to: "trace", input: "height" },

    // Stroke pass-through
    { from: "trace", output: "geometry", to: "stroke", input: "geometry" },

    // Camera
    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    // Render
    { from: "stroke",  output: "geometry", to: "render", input: "geometry" },
    { from: "camera",  output: "camera",   to: "render", input: "camera" },
    { from: "palette", output: "palette",  to: "render", input: "palette" },
  ],
};
