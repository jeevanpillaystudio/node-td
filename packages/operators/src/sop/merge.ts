import { defineOperator, forEachStrip, type Geometry } from "@node-td/kernel";

/**
 * Merge — concatenates multiple Geometry inputs into a single Geometry.
 *
 * Accepts a variadic `geometry` input. The inputs must share one dimension
 * and topology; an input of another kind is an error. Empty inputs add
 * nothing, whatever their kind. Positions are concatenated:
 *
 *   line-strip — every input's strips stay strips: an input without
 *                stripOffsets is one strip, and the output always has them
 *   triangles  — indices are rebased; an input without indices draws its
 *                vertices in order
 *
 * Normals, colours and each attribute are carried when any input has them,
 * zero-filled for the inputs that do not.
 */
export const merge = defineOperator({
  id: "merge",
  category: "sop",
  label: "Merge",
  inputs: [{ name: "geometry", type: "geo2", variadic: true }],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [],

  evaluate({ geometry: geos }) {
    if (geos.length === 1) {
      const g = geos[0]!;
      // A lone implicit strip is made explicit, as merged strips are
      if (g.topology === "line-strip" && !g.stripOffsets && g.vertexCount > 0) {
        return { geometry: { ...g, stripOffsets: Uint32Array.of(0) } };
      }
      return { geometry: g };
    }

    const parts = geos.filter((g) => g.vertexCount > 0);
    if (parts.length === 0) {
      return {
        geometry: {
          positions: new Float32Array(0),
          vertexCount: 0,
          dim: 2,
          topology: "points",
        },
      };
    }

    const { topology, dim } = parts[0]!;
    for (const [i, g] of geos.entries()) {
      if (g.vertexCount > 0 && (g.dim !== dim || g.topology !== topology)) {
        throw new Error(
          `merge: input ${i} is ${g.topology} in ${g.dim}D, but the first is ${topology} in ${dim}D`,
        );
      }
    }

    let totalVerts = 0;
    for (const g of parts) totalVerts += g.vertexCount;

    const positions = new Float32Array(totalVerts * dim);
    const strips: number[] = [];
    const indexed = parts.some((g) => g.indices);
    const indices: number[] = [];

    let vertOffset = 0;
    for (const g of parts) {
      positions.set(g.positions.subarray(0, g.vertexCount * dim), vertOffset * dim);

      if (topology === "line-strip") {
        forEachStrip(g, (start) => strips.push(start + vertOffset));
      }
      if (indexed) {
        if (g.indices) for (const i of g.indices) indices.push(i + vertOffset);
        else for (let i = 0; i < g.vertexCount; i++) indices.push(i + vertOffset);
      }

      vertOffset += g.vertexCount;
    }

    const normals = concatChannel(parts, (g) => g.normals, 3, totalVerts);
    const colors = concatChannel(parts, (g) => g.colors, 3, totalVerts);
    let attributes: Record<string, Float32Array> | undefined;
    const names = new Set(parts.flatMap((g) => Object.keys(g.attributes ?? {})));
    for (const name of [...names].sort()) {
      attributes ??= {};
      attributes[name] = concatChannel(parts, (g) => g.attributes?.[name], 1, totalVerts)!;
    }

    return {
      geometry: {
        positions,
        vertexCount: totalVerts,
        dim,
        topology,
        ...(indexed && { indices: Uint32Array.from(indices) }),
        ...(topology === "line-strip" && { stripOffsets: Uint32Array.from(strips) }),
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
