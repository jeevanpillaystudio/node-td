import { describe, expect, test } from "bun:test";
import {
  filterVertices,
  forEachStrip,
  pathsGeometry,
  pathsGeometry3,
  withPositions,
} from "./geometry";
import type { Geometry } from "./types";

const f32 = (...v: number[]) => new Float32Array(v);

/** Two 3D strips of three vertices, each vertex carrying its index in every channel. */
function strips(): Geometry<3> {
  const geo = pathsGeometry3([
    [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ],
    [
      [3, 3, 3],
      [4, 4, 4],
      [5, 5, 5],
    ],
  ]);
  geo.normals = f32(...[0, 1, 2, 3, 4, 5].flatMap((i) => [i, i, i]));
  geo.colors = f32(...[0, 1, 2, 3, 4, 5].flatMap((i) => [i / 10, i / 10, i / 10]));
  geo.attributes = { id: f32(0, 1, 2, 3, 4, 5) };
  return geo;
}

describe("pathsGeometry3", () => {
  test("lays the polylines end to end as line strips", () => {
    const geo = pathsGeometry3([
      [[1, 2, 3]],
      [
        [4, 5, 6],
        [7, 8, 9],
      ],
    ]);
    expect(geo.dim).toBe(3);
    expect(geo.topology).toBe("line-strip");
    expect(geo.vertexCount).toBe(3);
    expect([...geo.positions]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...geo.stripOffsets!]).toEqual([0, 1]);
  });
});

describe("withPositions", () => {
  test("replaces the positions and carries everything else", () => {
    const src = strips();
    const flat = new Float32Array(src.vertexCount * 2);
    const out = withPositions(src, flat, 2);
    expect(out.dim).toBe(2);
    expect(out.positions).toBe(flat);
    expect(out.vertexCount).toBe(src.vertexCount);
    expect(out.topology).toBe("line-strip");
    expect(out.stripOffsets).toBe(src.stripOffsets);
    expect(out.normals).toBe(src.normals);
    expect(out.colors).toBe(src.colors);
    expect(out.attributes).toBe(src.attributes);
  });

  test("adds no key the source does not have", () => {
    const src = pathsGeometry([
      [
        [0, 0],
        [1, 1],
      ],
    ]);
    const out = withPositions(src, f32(0, 0, 0, 1, 1, 1), 3);
    expect(Object.keys(out).sort()).toEqual([
      "dim",
      "positions",
      "stripOffsets",
      "topology",
      "vertexCount",
    ]);
  });
});

describe("forEachStrip", () => {
  const visit = (geo: Geometry<2 | 3>) => {
    const seen: [number, number, number][] = [];
    forEachStrip(geo, (start, end, strip) => seen.push([start, end, strip]));
    return seen;
  };

  test("visits each strip with its first vertex and one past its last", () => {
    expect(visit(strips())).toEqual([
      [0, 3, 0],
      [3, 6, 1],
    ]);
  });

  test("treats a geometry without stripOffsets as one strip, and an empty one as none", () => {
    const one: Geometry<2> = {
      positions: f32(0, 0, 1, 1),
      vertexCount: 2,
      dim: 2,
      topology: "line-strip",
    };
    expect(visit(one)).toEqual([[0, 2, 0]]);
    expect(visit({ ...one, positions: f32(), vertexCount: 0 })).toEqual([]);
  });
});

describe("filterVertices", () => {
  test("splits a strip at a dropped vertex and drops a piece too short to draw", () => {
    // Drop vertex 1: strip 0 leaves [0] and [2], both single vertices; strip 1 is whole.
    const out = filterVertices(strips(), (i) => i !== 1);
    expect(out.vertexCount).toBe(3);
    expect([...out.stripOffsets!]).toEqual([0]);
    expect([...out.positions]).toEqual([3, 3, 3, 4, 4, 4, 5, 5, 5]);
  });

  test("carries normals, colours and attributes with their vertices", () => {
    // Drop vertex 4: strip 1 leaves [3] (dropped) and [5] (dropped); strip 0 is whole.
    const out = filterVertices(strips(), (i) => i !== 4);
    expect([...out.attributes!.id!]).toEqual([0, 1, 2]);
    expect([...out.normals!]).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect([...out.colors!]).toEqual([...f32(0, 0, 0, 0.1, 0.1, 0.1, 0.2, 0.2, 0.2)]);
  });

  test("keeps the two-vertex pieces either side of a dropped vertex as separate strips", () => {
    const geo = pathsGeometry([
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
      ],
    ]);
    const out = filterVertices(geo, (i) => i !== 2);
    expect([...out.stripOffsets!]).toEqual([0, 2]);
    expect([...out.positions]).toEqual([0, 0, 1, 0, 3, 0, 4, 0]);
  });

  test("calls keep once per vertex, in vertex order", () => {
    const calls: number[] = [];
    filterVertices(strips(), (i) => {
      calls.push(i);
      return true;
    });
    expect(calls).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("drops a triangle that loses a corner and renumbers the rest", () => {
    const quad: Geometry<2> = {
      positions: f32(0, 0, 1, 0, 1, 1, 0, 1),
      vertexCount: 4,
      dim: 2,
      topology: "triangles",
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    };
    const out = filterVertices(quad, (i) => i !== 1);
    expect(out.vertexCount).toBe(3);
    expect([...out.positions]).toEqual([0, 0, 1, 1, 0, 1]);
    expect([...out.indices!]).toEqual([0, 1, 2]);
  });

  test("keeps points one by one", () => {
    const pts: Geometry<2> = {
      positions: f32(0, 0, 1, 1, 2, 2),
      vertexCount: 3,
      dim: 2,
      topology: "points",
      attributes: { id: f32(0, 1, 2) },
    };
    const out = filterVertices(pts, (i) => i !== 0);
    expect(out.stripOffsets).toBeUndefined();
    expect([...out.positions]).toEqual([1, 1, 2, 2]);
    expect([...out.attributes!.id!]).toEqual([1, 2]);
  });
});
