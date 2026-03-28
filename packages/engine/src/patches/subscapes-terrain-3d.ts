import type { Graph } from "../kernel/graph";

/**
 * Subscapes Terrain 3D patch -- full recreation of the Subscapes algorithm
 * with occlusion culling, diffuse lighting, base outline, and contour rings.
 *
 * Signal flow:
 *
 *   simplex-noise → fbm (6 octaves) → field-remap (ridge) ──┐
 *                                                             │
 *   ┌── FLOW BRANCH ─────────────────────────────────────────┤
 *   │   flow-noise (independent simplex) → grid-sampler      │
 *   │       ↓                                                 │
 *   │   poisson-disc → flow-tracer → continuous-stroke        │
 *   │       ↓                                                 │
 *   │   surface-lift → geometric-normal ──┐                   │
 *   │                                     │                   │
 *   ├── COLLISION MESH ──────────────────┤                   │
 *   │   parametric-surface → surface-lift → visibility-cull   │
 *   │                                     │   ↑               │
 *   │                               camera-3d ─┘              │
 *   │                                     │                   │
 *   │   visibility-cull → project-3d → stroke-renderer        │
 *   │                  → diffuse-shade → ↑ (palette)          │
 *   │                                                         │
 *   ├── CONTOUR RINGS ───────────────────────────────────────┤
 *   │   contour-ring → project-3d → stroke-renderer (overlay) │
 *   │                                                         │
 *   └── BASE OUTLINE ────────────────────────────────────────┘
 *       base-outline (geometry available, rendering in Phase 3)
 *
 *   composite: [stroke render, contour render]
 *
 * Phase 2 changes from original ad-hoc graph:
 *
 * 1. **Independent flow noise** — The actual Subscapes algorithm uses a
 *    separate simplex noise source (scale 0.05 in normalized UV) for flow
 *    field angles, NOT the curl of the terrain noise. This produces stroke
 *    motion that is organic but independent of terrain contours.
 *
 * 2. **Base outline** — Samples the height field along the visible boundary
 *    edges (back + right for isometric view), adds base-level corners to
 *    form a closed polygon. When filled, this occludes strokes behind the
 *    terrain base. (Fill rendering deferred to Phase 3.)
 *
 * 3. **Contour rings** — Elevation contour lines at progressively lower
 *    heights between terrain surface and base level, with exponential
 *    ease-out spacing. Plus vertical edge lines at the two visible corners.
 *
 * Terminal output: "comp" node, port "buffer" (Buffer2D, RGBA).
 */
export const subscapesTerrain3dGraph: Graph = {
  id: "subscapes-terrain-3d",
  name: "Subscapes Terrain 3D",
  nodes: {
    // ── Field algebra chain ─────────────────────────────────────
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },

    // ── Flow field: INDEPENDENT simplex noise ──────────────────
    // The actual Subscapes uses a separate noise source for flow angles,
    // not the curl of the terrain field. At pixel scale ~500, noiseScale
    // 0.003 gives a similar effective frequency to the original's 0.05
    // in normalized [-1,1] space.
    flow:    { type: "simplex-noise", params: { noiseScale: 0.003 } },
    grid:    { type: "grid-sampler", params: { resolution: 18 } },
    seeds:   { type: "poisson-disc", params: { minRadius: 14 } },
    trace:   { type: "flow-tracer", params: { numSteps: 40, stepLength: 3.5 } },
    stroke:  { type: "continuous-stroke" },

    // ── 3D projection + occlusion ──────────────────────────────
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

    // ── Base outline (geometry only, fill rendering in Phase 3) ─
    base:    { type: "base-outline", params: { samples: 150, amplitude: 80, baseY: 0 } },

    // ── Contour rings ──────────────────────────────────────────
    contour: { type: "contour-ring", params: { levels: 5, samples: 150, amplitude: 80, baseY: 0 } },
    "proj-cont": { type: "project-3d" },
    "render-cont": { type: "stroke-renderer", params: {
      lineWidth: 0.5, strokeAlpha: 0.33,
      bgR: 0, bgG: 0, bgB: 0, bgAlpha: 0, // transparent overlay
    }},

    // ── Terminal render ────────────────────────────────────────
    palette: { type: "procedural-palette", params: { count: 5, saturation: 0.55, lightness: 0.6, hueOffset: 200 } },
    camera:  { type: "camera-2d" },
    render:  { type: "stroke-renderer", params: { lineWidth: 1.0, strokeAlpha: 0.65, bgR: 12, bgG: 14, bgB: 18 } },
    comp:    { type: "composite", params: { mode: 0 } }, // Porter-Duff "over"
  },
  wires: [
    // ── Field algebra: noise → fbm → ridge ────────────────────
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },

    // ── Flow field: independent noise → grid (NOT curl of terrain)
    { from: "flow",  output: "field",  to: "grid", input: "field" },
    { from: "$env",  output: "height", to: "grid", input: "width" },
    { from: "$env",  output: "height", to: "grid", input: "height" },

    // ── Seeds ─────────────────────────────────────────────────
    { from: "$env", output: "height", to: "seeds", input: "width" },
    { from: "$env", output: "height", to: "seeds", input: "height" },

    // ── Flow tracing (2D, SQUARE coordinate space) ────────────
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
    { from: "$env",  output: "height", to: "colmesh", input: "width" },
    { from: "$env",  output: "height", to: "colmesh", input: "height" },
    { from: "colmesh",  output: "geometry", to: "liftmesh", input: "geometry" },
    { from: "ridge",    output: "field",    to: "liftmesh", input: "field" },

    // ── Visibility cull: normals'd strokes vs collision mesh ───
    { from: "normals",  output: "geometry", to: "cull", input: "geometry" },
    { from: "liftmesh", output: "geometry", to: "cull", input: "mesh" },
    { from: "cam3d",    output: "camera3d", to: "cull", input: "camera3d" },

    // ── Camera 3D (viewport + sceneSize for centering) ────────
    { from: "$env", output: "width",  to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    // ── Project 3D → 2D screen-space (main strokes) ──────────
    { from: "cull", output: "geometry", to: "proj", input: "geometry" },
    { from: "cam3d", output: "camera3d", to: "proj", input: "camera3d" },

    // ── Diffuse shading: normals → per-vertex palette ─────────
    { from: "cull",    output: "geometry", to: "shade", input: "geometry" },
    { from: "palette", output: "palette",  to: "shade", input: "palette" },

    // ── 2D camera (shared by all renderers) ───────────────────
    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    // ── Main stroke render ────────────────────────────────────
    { from: "proj",   output: "geometry", to: "render", input: "geometry" },
    { from: "camera", output: "camera",   to: "render", input: "camera" },
    { from: "shade",  output: "palette",  to: "render", input: "palette" },

    // ── Base outline (wired but not rendered yet) ─────────────
    { from: "ridge", output: "field",  to: "base", input: "field" },
    { from: "$env",  output: "height", to: "base", input: "width" },
    { from: "$env",  output: "height", to: "base", input: "height" },

    // ── Contour ring pipeline ─────────────────────────────────
    { from: "ridge", output: "field",  to: "contour", input: "field" },
    { from: "$env",  output: "height", to: "contour", input: "width" },
    { from: "$env",  output: "height", to: "contour", input: "height" },

    // Project contour 3D → 2D (shares camera with main pipeline)
    { from: "contour", output: "geometry",  to: "proj-cont", input: "geometry" },
    { from: "cam3d",   output: "camera3d",  to: "proj-cont", input: "camera3d" },

    // Render contour overlay (transparent background)
    { from: "proj-cont", output: "geometry", to: "render-cont", input: "geometry" },
    { from: "camera",    output: "camera",   to: "render-cont", input: "camera" },
    { from: "palette",   output: "palette",  to: "render-cont", input: "palette" },

    // ── Composite: strokes (bottom) + contours (top) ──────────
    { from: "render",      output: "buffer", to: "comp", input: "layers" },
    { from: "render-cont", output: "buffer", to: "comp", input: "layers" },
  ],
};
