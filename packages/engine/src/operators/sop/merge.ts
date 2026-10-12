import type { Operator, Geometry } from "@node-td/kernel";

type Inputs = { geometry: Geometry<2 | 3>[] };
type Outputs = { geometry: Geometry<2 | 3> };

/**
 * Merge — concatenates multiple Geometry inputs into a single Geometry.
 *
 * Accepts a variadic `geometry` input. All geometries must share the same
 * dimension and topology (uses the first input's values). Positions are
 * concatenated, stripOffsets/indices are rebased, normals are concatenated
 * when present on any input (zero-filled for inputs without normals).
 */
export const merge: Operator<Inputs, Outputs> = {
  id: "merge",
  category: "sop",
  label: "Merge",
  inputs: [{ name: "geometry", type: "geometry", variadic: true }],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [],

  evaluate({ geometry: geos }) {
    if (!geos || geos.length === 0) {
      return {
        geometry: {
          positions: new Float32Array(0),
          vertexCount: 0,
          dim: 2 as const,
          topology: "points" as const,
        },
      };
    }

    if (geos.length === 1) {
      return { geometry: geos[0]! };
    }

    const topology = geos[0]!.topology;
    const dim = geos[0]!.dim;

    // Calculate totals
    let totalVerts = 0;
    let totalIndices = 0;
    let totalStrips = 0;
    let hasNormals = false;

    for (const g of geos) {
      totalVerts += g.vertexCount;
      if (g.indices) totalIndices += g.indices.length;
      if (g.stripOffsets) totalStrips += g.stripOffsets.length;
      if ((g as Geometry<3>).normals) hasNormals = true;
    }

    const positions = new Float32Array(totalVerts * dim);
    const indices = totalIndices > 0 ? new Uint32Array(totalIndices) : undefined;
    const stripOffsets = totalStrips > 0 ? new Uint32Array(totalStrips) : undefined;
    // Normals only apply to 3D geometry; zero-fill for inputs without normals
    const normals = hasNormals && dim === 3 ? new Float32Array(totalVerts * 3) : undefined;

    let vertOffset = 0;
    let idxOffset = 0;
    let stripIdx = 0;

    for (const g of geos) {
      // Copy positions
      const srcLen = g.vertexCount * dim;
      for (let i = 0; i < srcLen; i++) {
        positions[vertOffset * dim + i] = g.positions[i] as number;
      }

      // Copy normals (zero-filled if this input has none)
      if (normals) {
        const srcNormals = (g as Geometry<3>).normals;
        if (srcNormals) {
          for (let i = 0; i < g.vertexCount * 3; i++) {
            normals[vertOffset * 3 + i] = srcNormals[i] as number;
          }
        }
        // else: normals remain zero-filled for this chunk
      }

      // Rebase indices
      if (indices && g.indices) {
        for (let i = 0; i < g.indices.length; i++) {
          indices[idxOffset + i] = (g.indices[i] as number) + vertOffset;
        }
        idxOffset += g.indices.length;
      }

      // Rebase strip offsets
      if (stripOffsets && g.stripOffsets) {
        for (let i = 0; i < g.stripOffsets.length; i++) {
          stripOffsets[stripIdx + i] = (g.stripOffsets[i] as number) + vertOffset;
        }
        stripIdx += g.stripOffsets.length;
      }

      vertOffset += g.vertexCount;
    }

    return {
      geometry: {
        positions,
        vertexCount: totalVerts,
        dim,
        topology,
        ...(indices && { indices }),
        ...(stripOffsets && { stripOffsets }),
        ...(normals && { normals }),
      },
    };
  },
};
