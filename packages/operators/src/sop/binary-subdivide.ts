import type { Operator, Geometry } from "@node-td/kernel";

type Inputs = { width: number; height: number };
type Outputs = { geometry: Geometry<2> };

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
}

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
export const binarySubdivide: Operator<Inputs, Outputs> = {
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
    const maxDepth = Math.round(params.maxDepth ?? 5);
    const minSize = params.minSize ?? 10;
    const splitJitter = params.splitJitter ?? 0.15;
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

    // Convert cells to triangulated geometry with per-vertex attributes
    const cellCount = leaves.length;
    const vertexCount = cellCount * 4;
    const positions = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(cellCount * 6);
    const cellIdAttr = new Float32Array(vertexCount);
    const depthAttr = new Float32Array(vertexCount);

    for (let i = 0; i < cellCount; i++) {
      const cell = leaves[i]!;
      const base = i * 4;

      // Vertices: TL, TR, BL, BR
      positions[base * 2] = cell.x;
      positions[base * 2 + 1] = cell.y;
      positions[(base + 1) * 2] = cell.x + cell.w;
      positions[(base + 1) * 2 + 1] = cell.y;
      positions[(base + 2) * 2] = cell.x;
      positions[(base + 2) * 2 + 1] = cell.y + cell.h;
      positions[(base + 3) * 2] = cell.x + cell.w;
      positions[(base + 3) * 2 + 1] = cell.y + cell.h;

      // Two triangles: TL-TR-BL, TR-BR-BL
      const ii = i * 6;
      indices[ii] = base;
      indices[ii + 1] = base + 1;
      indices[ii + 2] = base + 2;
      indices[ii + 3] = base + 1;
      indices[ii + 4] = base + 3;
      indices[ii + 5] = base + 2;

      // Per-vertex attributes (same for all 4 vertices of each cell)
      for (let v = 0; v < 4; v++) {
        cellIdAttr[base + v] = i;
        depthAttr[base + v] = cell.depth / maxDepth; // normalized 0-1
      }
    }

    return {
      geometry: {
        positions,
        vertexCount,
        dim: 2 as const,
        topology: "triangles" as const,
        indices,
        attributes: {
          cellId: cellIdAttr,
          depth: depthAttr,
        },
      },
    };
  },
};
