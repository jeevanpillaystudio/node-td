import type { Graph } from "@node-td/kernel";

/**
 * Meridian patch — inspired by Matt Desl's "Meridian" (fxhash).
 *
 * Data flow:
 *
 *   simplex-noise → fbm(6oct, rotated 37°) → field-remap(ridge) ──┐
 *                                                                    │
 *   simplex-noise (independent) ──────────────────────────────────┐ │
 *                                                                  │ │
 *   ┌── SCREEN SEEDS ───────────────────────────────────────────┐ │ │
 *   │   poisson-disc (screen-space 2D)                          │ │ │
 *   │       ↓                                                    │ │ │
 *   ├── RAYMARCH ────────────────────────────────────────────────┤ │ │
 *   │   surface-raymarch(seeds, cam3d, heightField)              │ │ │
 *   │     → hit geometry with: depth, ao, worldX/Z, normals     │ │ │
 *   │       ↓                                                    │ │ │
 *   ├── ORIENT ──────────────────────────────────────────────────┤ │ │
 *   │   point-orient(hitGeo, angleNoise)                         │ │ │
 *   │     → adds angle + length attributes per vertex           │ │ │
 *   │       ↓                                                    │ │ │
 *   └── RENDER ──────────────────────────────────────────────────┘ │ │
 *       oklab-palette → stroke-renderer(oriented-dash mode 2)      │ │
 *                                                                    │ │
 *   cam3d ← $env(w, h, sceneSize) ─────────────────────────────────┘ │
 *   cam2d ← $env(w, h)                                               │
 *   heightField ─────────────────────────────────────────────────────┘
 *
 * Key differences from subscapes-terrain-3d:
 *   - No explicit mesh: surface-raymarch replaces parametric-surface +
 *     surface-lift + visibility-cull + project-3d (4 nodes → 1)
 *   - Mark-making: oriented single-segment dashes vs polyline strokes
 *   - Shading: depth-indexed palette vs per-strip Lambert
 *   - fBm: 37° domain rotation for isotropic terrain
 *
 * Terminal output: "render" node, port "buffer" (Buffer2D, RGBA).
 */
export const meridianGraph: Graph = {
  id: "meridian",
  name: "Meridian",
  nodes: {
    // ── Field algebra: terrain height ────────────────────────────────
    noise:   { type: "simplex-noise", params: { noiseScale: 0.018 } },
    terrain: { type: "fbm",           params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0, domainRotation: 0.646 } },
    ridge:   { type: "field-remap",   params: { mode: 2, power: 1.5 } },

    // ── Independent noise for stroke angle ───────────────────────────
    noiseAngle: { type: "simplex-noise", params: { noiseScale: 0.03 } },

    // ── 3D camera — params are relative to sceneSize (sceneSize = canvas height)
    // Equivalent to original Meridian absolute: eye=(200,300,-200), orthoHalfH=175
    // eye.x = cx + eyeX*ss = ss/2 + 0.281*ss ≈ 200;  eye.y = 1.172*ss ≈ 300
    // eye.z = cz + eyeZ*ss = ss/2 - 1.281*ss ≈ -200;  orthoHalfH = 1.367*ss/2 ≈ 175
    cam3d: { type: "camera-3d", params: {
      projection: 0,
      eyeX: 0.281, eyeY: 1.172, eyeZ: -1.281,
      targetX: 0, targetY: 0, targetZ: 0,
      orthoSize: 1.367,
    }},

    // ── Screen-space seed points ──────────────────────────────────────
    seeds: { type: "poisson-disc", params: { minRadius: 20, margin: 0 } },

    // ── Sphere-trace each seed onto the terrain surface ───────────────
    raymarch: { type: "surface-raymarch", params: {
      amplitude: 80,
      maxSteps:  150,
      maxDist:   700,
      epsilon:   0.3,
      normalEps: 0.5,
      aoSteps:   4,
      aoRadius:  12,
    }},

    // ── Add noise-driven angle + depth-modulated length ───────────────
    orient: { type: "point-orient", params: {
      baseAngle:   0,
      angleScale:  3.14,
      baseLength:  14,
      lengthScale: 0.3,
      noiseScale:  0.025,
    }},

    // ── Palette ───────────────────────────────────────────────────────
    palette: { type: "oklab-palette", params: {
      count: 5, lightness: 0.65, chroma: 0.15, hueOffset: 200, hueSpread: 360,
    }},

    // ── Camera 2D ─────────────────────────────────────────────────────
    camera: { type: "camera-2d" },

    // ── Render oriented dashes (depth → palette index for color) ──────
    render: { type: "stroke-renderer", params: {
      renderMode:  2,
      lineWidth:   1.0,
      strokeAlpha: 0.65,
      bgR: 12, bgG: 14, bgB: 18,
    }},
  },
  wires: [
    // ── Field algebra: noise → fbm(rotated) → ridge ───────────────────
    { from: "noise",   output: "field", to: "terrain",    input: "field" },
    { from: "terrain", output: "field", to: "ridge",      input: "field" },

    // ── Camera 3D (needs width, height, sceneSize for framing) ────────
    { from: "$env", output: "width",  to: "cam3d", input: "width" },
    { from: "$env", output: "height", to: "cam3d", input: "height" },
    { from: "$env", output: "height", to: "cam3d", input: "sceneSize" },

    // ── Poisson-disc seeds (screen-space) ─────────────────────────────
    { from: "$env", output: "width",  to: "seeds", input: "width" },
    { from: "$env", output: "height", to: "seeds", input: "height" },

    // ── Raymarch: seeds + camera + terrain → hit geometry ─────────────
    { from: "seeds",    output: "geometry", to: "raymarch", input: "seeds" },
    { from: "cam3d",    output: "camera3d", to: "raymarch", input: "camera3d" },
    { from: "ridge",    output: "field",    to: "raymarch", input: "field" },

    // ── Orient: hit geometry + angle noise → oriented geometry ─────────
    { from: "raymarch", output: "geometry", to: "orient", input: "geometry" },
    { from: "noiseAngle", output: "field",  to: "orient", input: "field" },

    // ── Camera 2D ─────────────────────────────────────────────────────
    { from: "$env", output: "width",  to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },

    // ── Render: oriented geometry + depth-indexed palette → buffer ─────
    { from: "orient",  output: "geometry", to: "render", input: "geometry" },
    { from: "palette", output: "palette",  to: "render", input: "palette" },
    { from: "camera",  output: "camera",   to: "render", input: "camera" },
  ],
};
