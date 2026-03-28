import type { Graph } from "../kernel/graph";

/**
 * Subscapes Terrain 3D patch — demonstrates the full 3D projection pipeline
 * with occlusion culling and diffuse lighting.
 *
 * Signal flow:
 *   simplex-noise → fbm (6 octaves) → field-remap (ridge) ─┬─→ curl-noise → grid-sampler
 *                                                            │       ↓
 *                                                            │   poisson-disc → flow-tracer (2D paths)
 *                                                            │       ↓
 *                                                            │   continuous-stroke
 *                                                            │       ↓
 *                                                            ├─→ surface-lift (2D → 3D terrain)
 *                                                            │       ↓
 *                                                            ├─→ geometric-normal (per-vertex normals)
 *                                                            │       ↓
 *                                                            ├─→ parametric-surface (collision mesh)
 *                                                            │       ↓
 *                                                            │   visibility-cull (strokes vs mesh + camera)
 *                                                            │       ↓
 *                                                            │   camera-3d → project-3d (3D → 2D screen)
 *                                                            │       ↓
 *                                                            └─→ diffuse-shade (normals → per-vertex palette)
 *                                                                    ↓
 *                                                              stroke-renderer + shaded palette
 *
 * Key additions over the original ad-hoc graph:
 *
 * 1. **parametric-surface** generates a triangle mesh used as the collision
 *    substrate for visibility-cull. This mesh is the "invisible" surface
 *    that strokes are tested against for occlusion.
 *
 * 2. **geometric-normal** computes per-vertex surface normals from the
 *    height field. These normals feed both the visibility culler (back-face
 *    test) and the diffuse shader (Lambert N·L).
 *
 * 3. **visibility-cull** removes stroke segments that are back-facing or
 *    occluded by closer triangles via raycasting — the brute-force approach
 *    from the original Subscapes algorithm.
 *
 * 4. **diffuse-shade** applies Lambert shading with quantized intensity
 *    steps (the "limited pen widths" illustrative aesthetic) and maps
 *    the intensity through the palette for per-vertex coloring.
 *
 * Terminal output: "render" node, port "buffer" (Buffer2D, RGBA).
 */
export const subscapesTerrain3dGraph: Graph = {
  id: "subscapes-terrain-3d",
  name: "Subscapes Terrain 3D",
  nodes: {
    // ── Field algebra chain ─────────────────────────────────────
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },

    // ── Branch A: curl flow field → 2D flow tracing ────────────
    curl:    { type: "curl-noise", params: { epsilon: 1.5, scale: 1.0 } },
    grid:    { type: "grid-sampler", params: { resolution: 18 } },
    seeds:   { type: "poisson-disc", params: { minRadius: 14 } },
    trace:   { type: "flow-tracer", params: { numSteps: 40, stepLength: 3.5 } },
    stroke:  { type: "continuous-stroke" },

    // ── Branch B: 3D projection + occlusion ────────────────────
    lift:    { type: "surface-lift", params: { amplitude: 80, baseY: 0 } },
    normals: { type: "geometric-normal", params: { epsilon: 0.00001, amplitude: 80 } },
    colmesh: { type: "parametric-surface", params: { uSegments: 42, vSegments: 42, amplitude: 0 } },
    liftmesh:{ type: "surface-lift", params: { amplitude: 80, baseY: 0 } },
    cull:    { type: "visibility-cull" },
    cam3d:   { type: "camera-3d", params: {
      projection: 0, // orthographic (isometric)
      eyeX: 200, eyeY: 300, eyeZ: -200,
      targetX: 0, targetY: 0, targetZ: 0,
      orthoSize: 350,
    }},
    proj:    { type: "project-3d" },

    // ── Shading ────────────────────────────────────────────────
    shade:   { type: "diffuse-shade", params: {
      lightX: 0, lightY: -0.707, lightZ: -0.707,
      steps: 4, ambient: 0.1,
    }},

    // ── Terminal render ────────────────────────────────────────
    palette: { type: "procedural-palette", params: { count: 5, saturation: 0.55, lightness: 0.6, hueOffset: 200 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 1.0, strokeAlpha: 0.65, bgR: 12, bgG: 14, bgB: 18 } },
  },
  wires: [
    // ── Field algebra: noise → fbm → ridge ────────────────────
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },

    // ── Fan-out: ridge → curl (for flow direction) ────────────
    { from: "ridge", output: "field", to: "curl", input: "field" },

    // ── Curl → grid → flow tracing (all 2D, SQUARE coord space)
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

    // ── Fan-out: ridge → surface-lift (for stroke height) ─────
    { from: "ridge",  output: "field",    to: "lift", input: "field" },
    { from: "stroke", output: "geometry", to: "lift", input: "geometry" },

    // ── Geometric normals from height field on lifted strokes ──
    { from: "lift",  output: "geometry", to: "normals", input: "geometry" },
    { from: "ridge", output: "field",    to: "normals", input: "field" },

    // ── Collision mesh: parametric-surface → surface-lift ──────
    // Generate a flat 2D triangle grid, then lift it to 3D using
    // the same height field as the strokes.
    { from: "$env",  output: "height", to: "colmesh", input: "width" },
    { from: "$env",  output: "height", to: "colmesh", input: "height" },
    { from: "colmesh",  output: "geometry", to: "liftmesh", input: "geometry" },
    { from: "ridge",    output: "field",    to: "liftmesh", input: "field" },

    // ── Visibility cull: normals'd strokes vs collision mesh ───
    { from: "normals",  output: "geometry", to: "cull", input: "geometry" },
    { from: "liftmesh", output: "geometry", to: "cull", input: "mesh" },
    { from: "cam3d",    output: "camera3d", to: "cull", input: "camera3d" },

    // ── Camera 3D (viewport + sceneSize for centering) ───���─────
    { from: "$env", output: "width",  to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    // ── Project 3D → 2D screen-space ──────────────────────────
    { from: "cull", output: "geometry", to: "proj", input: "geometry" },
    { from: "cam3d", output: "camera3d", to: "proj", input: "camera3d" },

    // ── Diffuse shading: normals → per-vertex palette ─────────
    { from: "cull",    output: "geometry", to: "shade", input: "geometry" },
    { from: "palette", output: "palette",  to: "shade", input: "palette" },

    // ── 2D camera (for stroke-renderer viewport) ──────────────
    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    // ── Render (projected 2D geometry + 2D camera + shaded palette)
    { from: "proj",   output: "geometry", to: "render", input: "geometry" },
    { from: "camera", output: "camera",   to: "render", input: "camera" },
    { from: "shade",  output: "palette",  to: "render", input: "palette" },
  ],
};
