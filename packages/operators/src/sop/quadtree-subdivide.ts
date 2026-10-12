import { defineOperator } from "@node-td/kernel";
import { type Cell, cellsGeometry } from "./cells";

/**
 * Recursive quadtree subdivision of a rectangular area.
 *
 * The area is tiled with square roots the size of its shorter side; the
 * last row or column of roots runs past the area and is clipped to it, and
 * a quad wholly outside it is dropped.
 *
 * Without a field: subdivides uniformly to maxDepth.
 * With a field: field(cx, cy) at each quad's center determines whether
 * to subdivide further — values above `threshold` trigger subdivision.
 * Produces quilt-like patterns with varying density.
 *
 * Output: triangles, two per leaf, with cellId and depth attributes, as
 * binary-subdivide makes them.
 */
export const quadtreeSubdivide = defineOperator({
  id: "quadtree-subdivide",
  category: "sop",
  label: "Quadtree Subdivide",
  inputs: [
    { name: "field", type: "field", optional: true },
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [
    { key: "maxDepth", label: "Max Depth", min: 1, max: 8, step: 1, default: 5 },
    { key: "threshold", label: "Split Threshold", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "minSize", label: "Min Cell Size", min: 4, max: 100, step: 1, default: 8 },
  ],
  evaluate({ field, width, height }, params) {
    const maxDepth = Math.round(params.maxDepth);
    const threshold = params.threshold;
    const minSize = params.minSize;

    const leaves: Cell[] = [];

    // A leaf, clipped to the area
    const leaf = (x: number, y: number, size: number, depth: number): void => {
      leaves.push({ x, y, w: Math.min(size, width - x), h: Math.min(size, height - y), depth });
    };

    function subdivide(x: number, y: number, size: number, depth: number): void {
      // Wholly outside the area
      if (x >= width || y >= height) return;

      // Stop conditions
      if (depth >= maxDepth || size <= minSize) {
        leaf(x, y, size, depth);
        return;
      }

      // Decide whether to split
      const cx = x + size * 0.5;
      const cy = y + size * 0.5;
      const shouldSplit = field ? field(cx, cy) > threshold : true;

      if (!shouldSplit) {
        leaf(x, y, size, depth);
        return;
      }

      const half = size * 0.5;
      subdivide(x, y, half, depth + 1);
      subdivide(x + half, y, half, depth + 1);
      subdivide(x, y + half, half, depth + 1);
      subdivide(x + half, y + half, half, depth + 1);
    }

    // Square roots the size of the shorter side, tiling the area
    const rootSize = Math.min(width, height);
    if (rootSize > 0) {
      const cols = Math.ceil(width / rootSize);
      const rows = Math.ceil(height / rootSize);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          subdivide(c * rootSize, r * rootSize, rootSize, 0);
        }
      }
    }

    return { geometry: cellsGeometry(leaves, maxDepth) };
  },
});
