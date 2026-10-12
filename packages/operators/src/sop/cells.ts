import type { Geometry } from "@node-td/kernel";

/** One leaf of a spatial subdivision: a rectangle at its depth in the tree. */
export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
}

/**
 * The leaves of a subdivision as triangles, two per cell (TL-TR-BL and
 * TR-BR-BL over the vertices TL, TR, BL, BR), with per-vertex attributes:
 *
 *   cellId — the leaf's index
 *   depth  — its depth over maxDepth, 0..1
 *
 * Shared by binary-subdivide and quadtree-subdivide.
 */
export function cellsGeometry(leaves: Cell[], maxDepth: number): Geometry<2> {
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
    positions,
    vertexCount,
    dim: 2,
    topology: "triangles",
    indices,
    attributes: {
      cellId: cellIdAttr,
      depth: depthAttr,
    },
  };
}
