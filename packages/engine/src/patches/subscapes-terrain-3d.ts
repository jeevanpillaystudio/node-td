import type { Graph } from "../kernel/graph";

/**
 * Subscapes Terrain 3D patch — recreation of the Subscapes algorithm
 * targeting Style 0 ("Dark-on-light") variant.
 *
 * Parameters reverse-engineered from algorithm.js (token #53) and
 * calibrated against the actual Subscapes coordinate conventions:
 *
 *   - Terrain: [-1,1]² XZ domain, noise scale ≈ 0.005/px (≈2-unit traverse)
 *   - Height: pow(fbm, 4.5) — power shaping, not ridge folding
 *   - Flow: independent simplex at scale 0.003 (slow-varying angles)
 *   - Strokes: 4+4 steps × 8px ≈ 64px total per seed
 *   - Projection: exact isometric from direction (1,1,1)/√3
 *   - Render: monochrome dark strokes on light bg, source-over, opacity 1
 *
 * Data flow:
 *
 *   simplex-noise → fbm (6 oct) → field-remap (power 4.5) ─┐
 *                                                            │
 *   ┌── FLOW BRANCH ────────────────────────────────────────┤
 *   │   flow-noise (independent simplex) → grid-sampler     │
 *   │       ↓                                                │
 *   │   poisson-disc → flow-tracer → continuous-stroke       │
 *   │       ↓                                                │
 *   │   surface-lift → geometric-normal ──┐                  │
 *   │                                     │                  │
 *   ├── COLLISION MESH ──────────────────┤                  │
 *   │   parametric-surface → surface-lift → visibility-cull  │
 *   │                                     │   ↑              │
 *   │                               camera-3d ─┘             │
 *   │                                     │                  │
 *   │   visibility-cull → project-3d → stroke-renderer       │
 *   │                  → diffuse-shade → ↑ (per-strip color) │
 *   │                                                        │
 *   ├── BASE OUTLINE ───────────────────────────────────────┤
 *   │   base-outline → project-3d → stroke-renderer (fill)   │
 *   │                                                        │
 *   ├── CONTOUR RINGS ──────────────────────────────────────┤
 *   │   contour-ring → project-3d → stroke-renderer (overlay)│
 *   │                                                        │
 *   └── PALETTE ────────────────────────────────────────────┘
 *       oklab-palette (single dark color for Style 0)
 *
 *   composite: [strokes, base fill, contour lines]
 *
 * Terminal output: "comp" node, port "buffer" (Buffer2D, RGBA).
 */
export const subscapesTerrain3dGraph: Graph = {
  id: "subscapes-terrain-3d",
  name: "Subscapes Terrain 3D",
  nodes: {
    // ── Field algebra chain ─────────────────────────────────────
    // noiseScale 0.005 → terrain traverses ~2 units of simplex space
    // across a 400px canvas, matching actual's [-1,1] × Re=1.0
    noise: { type: "simplex-noise", params: { noiseScale: 0.012 } },
    terrain: {
      type: "fbm",
      params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 },
    },
    // Power mode (4) — actual uses $e ∈ [3, 5], typ. 4.5
    // Lower power shows more terrain height for visual debugging
    ridge: { type: "field-remap", params: { mode: 4, power: 2.0 } },

    // ── Flow field: INDEPENDENT simplex noise ──────────────────
    // grid-sampler now evaluates at pixel positions (not grid indices),
    // so noiseScale must be ~0.1 / canvasSize to match the original's
    // Xe function which spans 0.1 simplex units across UV [0,1].
    // 0.00025 × 400px = 0.1 units — matches actual algorithm.
    flow: { type: "simplex-noise", params: { noiseScale: 0.00025 } },
    grid: { type: "grid-sampler", params: { resolution: 18 } },
    // ── Quadtree partitioning (patchwork quilt) ──────────────────
    // Binary subdivision creates the Subscapes partition cells.
    // depth 5 → up to 32 leaf cells with varying sizes.
    partitions: {
      type: "binary-subdivide",
      params: { maxDepth: 5, minSize: 20, splitJitter: 0.15 },
    },
    // minRadius 5px ≈ actual's 0.01 in UV × 400px + tighter k=10 packing
    // Partition-aware: deeper cells get denser seed coverage
    seeds: {
      type: "poisson-disc",
      params: { minRadius: 5, densityScale: 1.5 },
    },
    // 7 steps × 8px per direction = 112px total stroke (actual: R=5-8, U=0.02)
    trace: {
      type: "flow-tracer",
      params: { numSteps: 7, stepLength: 8, exitMargin: 10 },
    },
    stroke: { type: "continuous-stroke" },

    // ── 3D projection + occlusion ──────────────────────────────
    // amplitude 120 ≈ 30% of scene extent (actual: height 0–0.5 in [-1,1])
    // baseY 6 ≈ actual's ve ≈ 0.05 constant offset
    lift: { type: "surface-lift", params: { amplitude: 120, baseY: 6 } },
    normals: {
      type: "geometric-normal",
      params: { epsilon: 1.0, amplitude: 120 },
    },
    colmesh: {
      type: "parametric-surface",
      params: { uSegments: 42, vSegments: 42, amplitude: 0 },
    },
    liftmesh: { type: "surface-lift", params: { amplitude: 120, baseY: 6 } },
    cull: { type: "visibility-cull" },
    // Isometric camera derived from algorithm.js hardcoded matrix:
    //   eye direction (1,1,1)/√3, orthoSize = 2√3/1.075 ≈ 1.61 (scene-relative)
    //   Eye/target offsets are now relative to sceneSize (1.0 = sceneSize)
    cam3d: {
      type: "camera-3d",
      params: {
        projection: 0, // orthographic (isometric)
        eyeX: 1.0,
        eyeY: 1.0,
        eyeZ: 1.0,
        targetX: 0,
        targetY: 0,
        targetZ: 0,
        orthoSize: 0.93,
      },
    },
    proj: { type: "project-3d" },

    // ── Shading ────────────────────────────────────────────────
    // Style 0: high ambient with subtle diffuse variation.
    // Light from upper-left (isometric-aligned), 4-step quantization
    // creates the "limited pen widths" aesthetic.
    shade: {
      type: "diffuse-shade",
      params: {
        lightX: -0.5,
        lightY: -0.707,
        lightZ: -0.5,
        steps: 4,
        ambient: 0.7,
      },
    },

    // ── Base outline (filled polygon for depth occlusion) ──────
    base: {
      type: "base-outline",
      params: { samples: 150, amplitude: 120, baseY: 6 },
    },
    "proj-base": { type: "project-3d" },
    "render-base": {
      type: "stroke-renderer",
      params: {
        renderMode: 1, // fill mode
        fillR: 249,
        fillG: 249,
        fillB: 249, // match light bg (Style 0)
        strokeAlpha: 1, // opaque fill
        bgR: 249,
        bgG: 249,
        bgB: 249,
        bgAlpha: 1, // opaque white bg (bottom layer)
      },
    },

    // ── Contour rings ──────────────────────────────────────────
    contour: {
      type: "contour-ring",
      params: { levels: 5, samples: 150, amplitude: 120, baseY: 6 },
    },
    "proj-cont": { type: "project-3d" },
    "render-cont": {
      type: "stroke-renderer",
      params: {
        lineWidth: 0.8,
        strokeAlpha: 0.5,
        bgR: 0,
        bgG: 0,
        bgB: 0,
        bgAlpha: 0, // transparent overlay
      },
    },

    // ── Terminal render ────────────────────────────────────────
    // Style 0: single near-black color on light background
    palette: {
      type: "oklab-palette",
      params: {
        count: 1,
        lightness: 0.2,
        chroma: 0,
        hueOffset: 0,
        hueSpread: 0,
      },
    },
    camera: { type: "camera-2d" },
    // lineWidth 1.8 ≈ min(400,400) × 0.0045
    // Transparent bg — base fill provides the white background beneath
    render: {
      type: "stroke-renderer",
      params: {
        lineWidth: 1.8,
        strokeAlpha: 1.0,
        bgR: 0,
        bgG: 0,
        bgB: 0,
        bgAlpha: 0,
      },
    },
    comp: { type: "composite", params: { mode: 0 } }, // Porter-Duff "over"
  },
  wires: [
    // ── Field algebra: noise → fbm → power ────────────────────
    { from: "noise", output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge", input: "field" },

    // ── Flow field: independent noise → grid (NOT curl of terrain)
    { from: "flow", output: "field", to: "grid", input: "field" },
    { from: "$env", output: "height", to: "grid", input: "width" },
    { from: "$env", output: "height", to: "grid", input: "height" },

    // ── Quadtree partitioning ───────────────────────────────────
    { from: "$env", output: "height", to: "partitions", input: "width" },
    { from: "$env", output: "height", to: "partitions", input: "height" },

    // ── Seeds (partition-aware density) ───────────────────────
    { from: "$env", output: "height", to: "seeds", input: "width" },
    { from: "$env", output: "height", to: "seeds", input: "height" },
    {
      from: "partitions",
      output: "geometry",
      to: "seeds",
      input: "partitions",
    },

    // ── Flow tracing (2D, SQUARE coordinate space) ────────────
    { from: "grid", output: "buffer", to: "trace", input: "buffer" },
    { from: "seeds", output: "geometry", to: "trace", input: "geometry" },
    { from: "$env", output: "height", to: "trace", input: "width" },
    { from: "$env", output: "height", to: "trace", input: "height" },

    { from: "trace", output: "geometry", to: "stroke", input: "geometry" },

    // ── Fan-out: power-field → surface-lift (for stroke height)
    { from: "ridge", output: "field", to: "lift", input: "field" },
    { from: "stroke", output: "geometry", to: "lift", input: "geometry" },

    // ── Geometric normals from height field on lifted strokes ──
    { from: "lift", output: "geometry", to: "normals", input: "geometry" },
    { from: "ridge", output: "field", to: "normals", input: "field" },

    // ── Collision mesh: parametric-surface → surface-lift ──────
    { from: "$env", output: "height", to: "colmesh", input: "width" },
    { from: "$env", output: "height", to: "colmesh", input: "height" },
    { from: "colmesh", output: "geometry", to: "liftmesh", input: "geometry" },
    { from: "ridge", output: "field", to: "liftmesh", input: "field" },

    // ── Visibility cull: normals'd strokes vs collision mesh ───
    { from: "normals", output: "geometry", to: "cull", input: "geometry" },
    { from: "liftmesh", output: "geometry", to: "cull", input: "mesh" },
    { from: "cam3d", output: "camera3d", to: "cull", input: "camera3d" },

    // ── Camera 3D (viewport + sceneSize for centering) ────────
    { from: "$env", output: "width", to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    // ── Project 3D → 2D screen-space (main strokes) ──────────
    { from: "cull", output: "geometry", to: "proj", input: "geometry" },
    { from: "cam3d", output: "camera3d", to: "proj", input: "camera3d" },

    // ── Diffuse shading: normals → per-vertex palette ─────────
    { from: "cull", output: "geometry", to: "shade", input: "geometry" },
    { from: "palette", output: "palette", to: "shade", input: "palette" },

    // ── 2D camera (shared by all renderers) ───────────────────
    { from: "$env", output: "width", to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    // ── Main stroke render (per-strip coloring from shade) ────
    { from: "proj", output: "geometry", to: "render", input: "geometry" },
    { from: "camera", output: "camera", to: "render", input: "camera" },
    { from: "shade", output: "palette", to: "render", input: "palette" },

    // ── Base outline: project + fill render ───────────────────
    { from: "ridge", output: "field", to: "base", input: "field" },
    { from: "$env", output: "height", to: "base", input: "width" },
    { from: "$env", output: "height", to: "base", input: "height" },

    { from: "base", output: "geometry", to: "proj-base", input: "geometry" },
    { from: "cam3d", output: "camera3d", to: "proj-base", input: "camera3d" },

    {
      from: "proj-base",
      output: "geometry",
      to: "render-base",
      input: "geometry",
    },
    { from: "camera", output: "camera", to: "render-base", input: "camera" },

    // ── Contour ring pipeline ─────────────────────────────────
    { from: "ridge", output: "field", to: "contour", input: "field" },
    { from: "$env", output: "height", to: "contour", input: "width" },
    { from: "$env", output: "height", to: "contour", input: "height" },

    { from: "contour", output: "geometry", to: "proj-cont", input: "geometry" },
    { from: "cam3d", output: "camera3d", to: "proj-cont", input: "camera3d" },

    {
      from: "proj-cont",
      output: "geometry",
      to: "render-cont",
      input: "geometry",
    },
    { from: "camera", output: "camera", to: "render-cont", input: "camera" },
    { from: "palette", output: "palette", to: "render-cont", input: "palette" },

    // ── Composite: base fill (bottom) → strokes → contours (top)
    // Wire order determines layer order in variadic input
    { from: "render-base", output: "buffer", to: "comp", input: "layers" },
    { from: "render", output: "buffer", to: "comp", input: "layers" },
    { from: "render-cont", output: "buffer", to: "comp", input: "layers" },
  ],
};
