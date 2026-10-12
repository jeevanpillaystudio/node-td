import { defineOperator, filterVertices, forEachStrip } from "@node-td/kernel";

/**
 * Splits line-strip geometry into randomized dash segments. A dash keeps
 * its vertices' colours, normals and attributes.
 */
export const dashStroke = defineOperator({
  id: "dash-stroke",
  category: "sop",
  label: "Dash Stroke",
  inputs: [{ name: "geometry", type: "geo2" }],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [],
  evaluate({ geometry }, _params, env) {
    const rand = () => env.rng.random();

    // Points are strips of one vertex each, which hold no dash
    const strips =
      geometry.topology === "points"
        ? { ...geometry, stripOffsets: Uint32Array.from({ length: geometry.vertexCount }, (_, i) => i) }
        : geometry;

    // Each dash keeps `seg` vertices and the `gap` after it is dropped, so
    // dashes are the runs of kept vertices; filterVertices drops a run too
    // short to draw.
    const keep = new Uint8Array(geometry.vertexCount);
    forEachStrip(strips, (start, end) => {
      let i = start;
      while (i + 1 < end) {
        const seg = 2 + Math.floor(rand() * 6);
        const gap = 1 + Math.floor(rand() * 5);
        keep.fill(1, i, Math.min(i + seg, end));
        i += seg + gap;
      }
    });

    const { indices: _indices, ...lines } = strips;
    return { geometry: filterVertices({ ...lines, topology: "line-strip" }, (i) => keep[i] === 1) };
  },
});
