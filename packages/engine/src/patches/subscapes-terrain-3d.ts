import type { Graph } from "../kernel/graph";

/**
 * Subscapes Terrain 3D patch — demonstrates the full 3D projection pipeline.
 *
 * Signal flow:
 *   simplex-noise → fbm (6 octaves) → field-remap (ridge) ─┬─→ curl-noise → grid-sampler
 *                                                            │       ↓
 *                                                            │   poisson-disc → flow-tracer (2D paths)
 *                                                            │       ↓
 *                                                            └─→ surface-lift (2D → 3D terrain)
 *                                                                    ↓
 *                                                    camera-3d → project-3d (3D → 2D screen)
 *                                                                    ↓
 *                                                              stroke-renderer + palette
 *
 * The ridge field branches at a fan-out: one copy drives curl flow for
 * stroke direction, the other provides height values for the terrain surface.
 * The isometric camera projects the 3D terrain back to 2D for rendering.
 *
 * Terminal output: "render" node, port "buffer" (Buffer2D, RGBA).
 */
export const subscapesTerrain3dGraph: Graph = {
  id: "subscapes-terrain-3d",
  name: "Subscapes Terrain 3D",
  nodes: {
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },

    // Branch A: curl flow field → 2D flow tracing
    curl:    { type: "curl-noise", params: { epsilon: 1.5, scale: 1.0 } },
    grid:    { type: "grid-sampler", params: { resolution: 18 } },
    seeds:   { type: "poisson-disc", params: { minRadius: 14 } },
    trace:   { type: "flow-tracer", params: { numSteps: 40, stepLength: 3.5 } },
    stroke:  { type: "continuous-stroke" },

    // Branch B: 3D projection
    lift:    { type: "surface-lift", params: { amplitude: 80, baseY: 0 } },
    cam3d:   { type: "camera-3d", params: {
      projection: 0, // orthographic (isometric)
      eyeX: 200, eyeY: 300, eyeZ: -200,
      targetX: 0, targetY: 0, targetZ: 0,
      orthoSize: 350,
    }},
    proj:    { type: "project-3d" },

    // Terminal render
    palette: { type: "procedural-palette", params: { count: 5, saturation: 0.55, lightness: 0.6, hueOffset: 200 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 1.0, strokeAlpha: 0.65, bgR: 12, bgG: 14, bgB: 18 } },
  },
  wires: [
    // Field algebra chain: noise → fbm → ridge
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },

    // Fan-out: ridge → curl (for flow direction)
    { from: "ridge", output: "field", to: "curl", input: "field" },

    // Curl → grid → flow tracing (all 2D, SQUARE coordinate space)
    // Wire $env.height to both width and height so the terrain base is square
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

    // Fan-out: ridge → surface-lift (for height)
    { from: "ridge",  output: "field",    to: "lift", input: "field" },
    // Stroke geometry → surface-lift (2D paths lifted to 3D)
    { from: "stroke", output: "geometry", to: "lift", input: "geometry" },

    // Camera 3D (viewport for projection, sceneSize for centering on square terrain)
    { from: "$env", output: "width",  to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    // Project 3D → 2D
    { from: "lift",  output: "geometry", to: "proj", input: "geometry" },
    { from: "cam3d", output: "camera3d", to: "proj", input: "camera3d" },

    // 2D camera (for stroke-renderer viewport)
    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    // Render (projected 2D geometry + 2D camera + palette)
    { from: "proj",    output: "geometry", to: "render", input: "geometry" },
    { from: "camera",  output: "camera",   to: "render", input: "camera" },
    { from: "palette", output: "palette",  to: "render", input: "palette" },
  ],
};
