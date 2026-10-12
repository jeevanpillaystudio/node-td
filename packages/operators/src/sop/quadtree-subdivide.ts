import type { Operator, Field2D, Geometry } from "@node-td/kernel";

type Inputs = { field?: Field2D; width: number; height: number };
type Outputs = { geometry: Geometry<2> };

interface Quad {
  x: number;
  y: number;
  size: number;
}

/**
 * Recursive quadtree subdivision of a rectangular area.
 *
 * Without a field: subdivides uniformly to maxDepth.
 * With a field: field(cx, cy) at each quad's center determines whether
 * to subdivide further — values above `threshold` trigger subdivision.
 * Produces quilt-like patterns with varying density.
 */
export const quadtreeSubdivide: Operator<Inputs, Outputs> = {
  id: "quadtree-subdivide",
  category: "sop",
  label: "Quadtree Subdivide",
  inputs: [
    { name: "field", type: "field", optional: true },
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [
    { key: "maxDepth", label: "Max Depth", min: 1, max: 8, step: 1, default: 5 },
    { key: "threshold", label: "Split Threshold", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "minSize", label: "Min Cell Size", min: 4, max: 100, step: 1, default: 8 },
  ],
  evaluate({ field, width, height }, params) {
    const maxDepth = params.maxDepth ?? 5;
    const threshold = params.threshold ?? 0.5;
    const minSize = params.minSize ?? 8;

    const leaves: Quad[] = [];

    function subdivide(x: number, y: number, size: number, depth: number): void {
      // Stop conditions
      if (depth >= maxDepth || size <= minSize) {
        leaves.push({ x, y, size });
        return;
      }

      // Decide whether to split
      const cx = x + size * 0.5;
      const cy = y + size * 0.5;
      const shouldSplit = field ? field(cx, cy) > threshold : true;

      if (!shouldSplit) {
        leaves.push({ x, y, size });
        return;
      }

      const half = size * 0.5;
      subdivide(x, y, half, depth + 1);
      subdivide(x + half, y, half, depth + 1);
      subdivide(x, y + half, half, depth + 1);
      subdivide(x + half, y + half, half, depth + 1);
    }

    // Start from square cells covering the area
    const cellSize = Math.max(width, height);
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        subdivide(c * cellSize, r * cellSize, cellSize, 0);
      }
    }

    // Convert quads to triangulated geometry
    const vertexCount = leaves.length * 4;
    const positions = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(leaves.length * 6); // 2 triangles per quad

    for (let i = 0; i < leaves.length; i++) {
      const q = leaves[i]!;
      const base = i * 4;

      // Vertices: TL, TR, BL, BR
      positions[base * 2] = q.x;
      positions[base * 2 + 1] = q.y;
      positions[(base + 1) * 2] = q.x + q.size;
      positions[(base + 1) * 2 + 1] = q.y;
      positions[(base + 2) * 2] = q.x;
      positions[(base + 2) * 2 + 1] = q.y + q.size;
      positions[(base + 3) * 2] = q.x + q.size;
      positions[(base + 3) * 2 + 1] = q.y + q.size;

      // Two triangles: TL-TR-BL, TR-BR-BL
      const ii = i * 6;
      indices[ii] = base;
      indices[ii + 1] = base + 1;
      indices[ii + 2] = base + 2;
      indices[ii + 3] = base + 1;
      indices[ii + 4] = base + 3;
      indices[ii + 5] = base + 2;
    }

    return {
      geometry: {
        positions,
        vertexCount,
        dim: 2 as const,
        topology: "triangles" as const,
        indices,
      },
    };
  },
};
