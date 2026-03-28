import type { Operator, Field2D, Geometry } from "../../kernel/types";

type Inputs = { field: Field2D; width: number; height: number };
type Outputs = { geometry: Geometry<3> };

/**
 * Contour Ring -- generates elevation contour lines along the terrain boundary.
 *
 * Creates line-strips at progressively lower heights between the terrain
 * surface and the base level. Uses exponential ease-out for natural spacing:
 * more rings crowd near the base, fewer near the top.
 *
 * Also generates two vertical edge lines at the back-left and front-right
 * corners where the terrain surface meets the base level.
 *
 * Mirrors the `gt` contour ring generation in the Subscapes algorithm
 * (algorithm.js:408-437). The original uses `e = 1 - pow(1 - t, 4)` easing
 * and `Oe` levels (typically 2, 5, 10, or 15).
 */
export const contourRing: Operator<Inputs, Outputs> = {
  id: "contour-ring",
  category: "sop",
  label: "Contour Ring",
  inputs: [
    { name: "field", type: "field" },
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [
    { key: "levels", label: "Levels", min: 2, max: 20, step: 1, default: 5 },
    { key: "samples", label: "Samples / Edge", min: 10, max: 300, step: 1, default: 150 },
    { key: "amplitude", label: "Height", min: 0, max: 500, step: 1, default: 80 },
    { key: "baseY", label: "Base Y", min: -500, max: 500, step: 1, default: 0 },
  ],

  evaluate({ field, width: w, height: h }, params) {
    const levels = Math.round(params.levels ?? 5);
    const samples = Math.round(params.samples ?? 150);
    const amp = params.amplitude ?? 80;
    const baseY = params.baseY ?? 0;

    // -- Sample terrain height along the two visible edges ---------------
    const edgeCoords: [number, number][] = []; // [x, z]
    const edgeHeights: number[] = [];          // clamped terrain height above baseY

    // Back edge: x from 0 -> w, z = h
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const x = t * w;
      edgeCoords.push([x, h]);
      edgeHeights.push(Math.max(0, field(x, h) * amp));
    }

    // Right edge: x = w, z from h -> 0 (skip first to avoid duplicate corner)
    for (let i = 1; i < samples; i++) {
      const t = i / (samples - 1);
      const z = h * (1 - t);
      edgeCoords.push([w, z]);
      edgeHeights.push(Math.max(0, field(w, z) * amp));
    }

    const totalEdgePts = edgeCoords.length;
    const paths: [number, number, number][][] = [];

    // -- Contour rings at each elevation level ---------------------------
    for (let lvl = 0; lvl < levels; lvl++) {
      const t = levels <= 1 ? 1 : lvl / (levels - 1);
      // Exponential ease-out: 1 - (1-t)^4
      const eased = 1 - Math.pow(1 - t, 4);

      const ring: [number, number, number][] = [];
      for (let i = 0; i < totalEdgePts; i++) {
        const [x, z] = edgeCoords[i]!;
        const terrainH = edgeHeights[i]!;
        // Last level snaps exactly to baseY; others lerp from terrain to base
        const y = lvl === levels - 1
          ? baseY
          : baseY + terrainH * (1 - eased);
        ring.push([x, y, z]);
      }
      paths.push(ring);
    }

    // -- Vertical edge lines at the two visible corners ------------------
    // Back-left corner: (0, h)
    const blH = edgeHeights[0]!;
    paths.push([
      [0, baseY + blH, h],
      [0, baseY, h],
    ]);

    // Front-right corner: (w, 0)
    const frH = edgeHeights[totalEdgePts - 1]!;
    paths.push([
      [w, baseY + frH, 0],
      [w, baseY, 0],
    ]);

    // -- Pack into multi-strip Geometry<3> --------------------------------
    let totalVerts = 0;
    for (const p of paths) totalVerts += p.length;

    const positions = new Float32Array(totalVerts * 3);
    const stripOffsets = new Uint32Array(paths.length);
    let vi = 0;

    for (let s = 0; s < paths.length; s++) {
      stripOffsets[s] = vi;
      for (const [x, y, z] of paths[s]!) {
        positions[vi * 3] = x;
        positions[vi * 3 + 1] = y;
        positions[vi * 3 + 2] = z;
        vi++;
      }
    }

    return {
      geometry: {
        positions,
        vertexCount: totalVerts,
        dim: 3 as const,
        topology: "line-strip" as const,
        stripOffsets,
      },
    };
  },
};
