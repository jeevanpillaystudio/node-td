import { defineOperator, type Geometry } from "@node-td/kernel";

/**
 * Merge — concatenates multiple Geometry inputs into a single Geometry.
 *
 * Accepts a variadic `geometry` input. All geometries must share the same
 * dimension and topology (uses the first input's values). Positions are
 * concatenated and stripOffsets/indices are rebased. Normals, colours and
 * each attribute are carried when any input has them, zero-filled for the
 * inputs that do not.
 */
export const merge = defineOperator({
  id: "merge",
  category: "sop",
  label: "Merge",
  inputs: [{ name: "geometry", type: "geo2", variadic: true }],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [],

  evaluate({ geometry: geos }) {
    if (geos.length === 0) {
      return {
        geometry: {
          positions: new Float32Array(0),
          vertexCount: 0,
          dim: 2,
          topology: "points",
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

    const normals = concatChannel(geos, (g) => g.normals, 3, totalVerts);
    const colors = concatChannel(geos, (g) => g.colors, 3, totalVerts);
    let attributes: Record<string, Float32Array> | undefined;
    const names = new Set(geos.flatMap((g) => Object.keys(g.attributes ?? {})));
    for (const name of [...names].sort()) {
      attributes ??= {};
      attributes[name] = concatChannel(geos, (g) => g.attributes?.[name], 1, totalVerts)!;
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
        ...(colors && { colors }),
        ...(attributes && { attributes }),
      },
    };
  },
});

/**
 * One per-vertex channel of `width` floats, laid end to end across the
 * inputs, or undefined when no input has it. An input without it is
 * zero-filled.
 */
function concatChannel(
  geos: Geometry<2>[],
  channel: (g: Geometry<2>) => Float32Array | undefined,
  width: number,
  totalVerts: number,
): Float32Array | undefined {
  if (!geos.some((g) => channel(g))) return undefined;
  const out = new Float32Array(totalVerts * width);
  let vertOffset = 0;
  for (const g of geos) {
    const src = channel(g);
    if (src) out.set(src.subarray(0, g.vertexCount * width), vertOffset * width);
    vertOffset += g.vertexCount;
  }
  return out;
}
