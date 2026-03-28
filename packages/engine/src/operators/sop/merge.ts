import type { Operator, Geometry } from "../../kernel/types";

type Inputs = { geometry: Geometry<2>[] };
type Outputs = { geometry: Geometry<2> };

/**
 * Merge — concatenates multiple Geometry<2> inputs into a single Geometry.
 *
 * Accepts a variadic `geometry` input. All geometries must share the same
 * topology (or will use the topology of the first input). Positions are
 * concatenated, stripOffsets/indices are rebased.
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
          topology: "points",
        },
      };
    }

    if (geos.length === 1) {
      return { geometry: geos[0]! };
    }

    const topology = geos[0]!.topology;
    const dim = 2 as const;

    // Calculate totals
    let totalVerts = 0;
    let totalIndices = 0;
    let totalStrips = 0;

    for (const g of geos) {
      totalVerts += g.vertexCount;
      if (g.indices) totalIndices += g.indices.length;
      if (g.stripOffsets) totalStrips += g.stripOffsets.length;
    }

    const positions = new Float32Array(totalVerts * dim);
    const indices = totalIndices > 0 ? new Uint32Array(totalIndices) : undefined;
    const stripOffsets = totalStrips > 0 ? new Uint32Array(totalStrips) : undefined;

    let vertOffset = 0;
    let idxOffset = 0;
    let stripIdx = 0;

    for (const g of geos) {
      // Copy positions
      const srcLen = g.vertexCount * dim;
      for (let i = 0; i < srcLen; i++) {
        positions[vertOffset * dim + i] = g.positions[i] as number;
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
      },
    };
  },
};
