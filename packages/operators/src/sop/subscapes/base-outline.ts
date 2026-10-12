import { defineOperator, pathsGeometry3 } from "@node-td/kernel";

/**
 * Base Outline -- generates the visible base polygon of a terrain tile.
 *
 * Samples the height field along the two visible boundary edges (back and
 * right for a standard isometric camera), then adds base-level corner
 * points to form a closed polygon.
 *
 * When filled with the background color, this polygon occludes any strokes
 * that peek below the terrain surface, creating the iconic tile/block base.
 *
 * Polygon order (closed loop):
 *   1. Front-right at terrain surface
 *   2. Front-right at baseY
 *   3. Back-right at baseY
 *   4. Back-left at baseY
 *   5. Back edge samples (left -> right) at clamped terrain height
 *   6. Right edge samples (back -> front) at clamped terrain height
 *
 * Mirrors the `bt` polygon in the Subscapes algorithm (algorithm.js:388-407).
 */
export const baseOutline = defineOperator({
  id: "base-outline",
  category: "sop",
  label: "Base Outline",
  inputs: [
    { name: "field", type: "field" },
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "geometry", type: "geo3" }],
  params: [
    { key: "samples", label: "Samples / Edge", min: 10, max: 300, step: 1, default: 150 },
    { key: "amplitude", label: "Height", min: 0, max: 500, step: 1, default: 80 },
    { key: "baseY", label: "Base Y", min: -500, max: 500, step: 1, default: 0 },
  ],

  evaluate({ field, width: w, height: h }, params) {
    const samples = Math.round(params.samples);
    const amp = params.amplitude;
    const baseY = params.baseY;

    // -- Sample the two visible edges ------------------------------------
    // Back edge: x from 0 -> w, z = h
    const edgePts: [number, number, number][] = [];

    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const x = t * w;
      const z = h;
      const y = baseY + Math.max(0, field(x, z) * amp);
      edgePts.push([x, y, z]);
    }

    // Right edge: x = w, z from h -> 0 (skip first to avoid duplicate corner)
    for (let i = 1; i < samples; i++) {
      const t = i / (samples - 1);
      const x = w;
      const z = h * (1 - t);
      const y = baseY + Math.max(0, field(x, z) * amp);
      edgePts.push([x, y, z]);
    }

    // -- Build closed polygon -------------------------------------------
    // Front-right terrain corner (last edge sample)
    const frTerrain = edgePts[edgePts.length - 1]!;

    const polygon: [number, number, number][] = [
      frTerrain, // front-right at terrain surface
      [w, baseY, 0], // front-right at base
      [w, baseY, h], // back-right at base
      [0, baseY, h], // back-left at base
      ...edgePts, // terrain surface boundary samples
    ];

    return { geometry: pathsGeometry3([polygon]) };
  },
});
