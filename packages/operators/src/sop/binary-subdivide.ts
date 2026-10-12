import { defineOperator } from "@node-td/kernel";
import { type Cell, cellsGeometry } from "./cells";

/**
 * Binary Subdivide — recursive 2-way spatial partitioning.
 *
 * Unlike standard quadtree (4-way center splits), this operator splits
 * each rectangle into exactly 2 children along an alternating axis,
 * with randomized split position. This produces the organic patchwork
 * quilt pattern seen in Subscapes and similar generative works.
 *
 * Algorithm:
 *   1. Start with the full rectangle [0, w] × [0, h]
 *   2. For each cell, split along the longer axis (or alternate)
 *   3. Split position = 0.5 + random(-splitJitter, +splitJitter)
 *   4. Recurse until depth >= maxDepth or cell < minSize
 *
 * Output: Geometry<2> with "triangles" topology (2 tris per cell quad).
 * Per-vertex attributes:
 *   - cellId:  unique index identifying each cell
 *   - depth:   subdivision depth (0 = root, maxDepth = leaf)
 *
 * General-purpose: works for any spatial partitioning use case —
 * density control, color zoning, LOD, tile-based rendering.
 */
export const binarySubdivide = defineOperator({
  id: "binary-subdivide",
  category: "sop",
  label: "Binary Subdivide",
  inputs: [
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [
    { key: "maxDepth", label: "Max Depth", min: 1, max: 10, step: 1, default: 5 },
    { key: "minSize", label: "Min Cell Size", min: 2, max: 200, step: 1, default: 10 },
    { key: "splitJitter", label: "Split Jitter", min: 0, max: 0.4, step: 0.01, default: 0.15 },
  ],
  evaluate({ width, height }, params, env) {
    const maxDepth = Math.round(params.maxDepth);
    const minSize = params.minSize;
    const splitJitter = params.splitJitter;
    const rand = () => env.rng.random();

    const leaves: Cell[] = [];

    function subdivide(x: number, y: number, w: number, h: number, depth: number): void {
      if (depth >= maxDepth || Math.min(w, h) <= minSize) {
        leaves.push({ x, y, w, h, depth });
        return;
      }

      // Split along the longer axis (with tie-breaking by random)
      const splitHorizontal = w > h ? false : h > w ? true : rand() < 0.5;

      // Random split position around center
      const jitter = (rand() * 2 - 1) * splitJitter;
      const splitT = 0.5 + jitter;

      if (splitHorizontal) {
        // Split top/bottom
        const splitY = h * splitT;
        if (splitY < minSize || h - splitY < minSize) {
          leaves.push({ x, y, w, h, depth });
          return;
        }
        subdivide(x, y, w, splitY, depth + 1);
        subdivide(x, y + splitY, w, h - splitY, depth + 1);
      } else {
        // Split left/right
        const splitX = w * splitT;
        if (splitX < minSize || w - splitX < minSize) {
          leaves.push({ x, y, w, h, depth });
          return;
        }
        subdivide(x, y, splitX, h, depth + 1);
        subdivide(x + splitX, y, w - splitX, h, depth + 1);
      }
    }

    subdivide(0, 0, width, height, 0);

    return { geometry: cellsGeometry(leaves, maxDepth) };
  },
});
