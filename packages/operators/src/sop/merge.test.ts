import { describe, expect, it } from "bun:test";
import { type Geometry, type NodeEnv, pathsGeometry, pointsGeometry } from "@node-td/kernel";
import { merge } from "./merge";

const env = { width: 0, height: 0, dpr: 1, seed: 0, rng: { random: () => 0 } } satisfies NodeEnv;
const run = (...geometry: Geometry<2>[]) => merge.evaluate({ geometry }, {}, env).geometry;

/** One line strip with no stripOffsets: an implicit single strip. */
const polyline = (...xs: number[]): Geometry<2> => {
  const { stripOffsets: _offsets, ...line } = pathsGeometry([xs.map((x) => [x, 0])]);
  return line;
};

describe("merge", () => {
  it("keeps an implicit strip a strip of its own, wherever it comes", () => {
    const explicit = pathsGeometry([[[0, 0], [1, 0]], [[2, 0], [3, 0], [4, 0]]]);
    expect([...run(explicit, polyline(5, 6)).stripOffsets!]).toEqual([0, 2, 5]);
    expect([...run(polyline(5, 6), explicit).stripOffsets!]).toEqual([0, 2, 4]);
  });

  it("makes a lone implicit strip explicit", () => {
    const merged = run(polyline(0, 1, 2));
    expect(merged.vertexCount).toBe(3);
    expect([...merged.stripOffsets!]).toEqual([0]);
  });

  it("gives two implicit strips two strips", () => {
    const merged = run(polyline(0, 1, 2), polyline(3, 4));
    expect(merged.topology).toBe("line-strip");
    expect([...merged.stripOffsets!]).toEqual([0, 3]);
  });

  it("rejects inputs of another topology or dimension", () => {
    const points = pointsGeometry([[0, 0], [1, 1]]);
    expect(() => run(polyline(0, 1), points)).toThrow(/input 1 is points in 2D, but the first is line-strip in 2D/);
    const lifted = { ...polyline(0, 1), positions: new Float32Array(6), dim: 3 } as unknown as Geometry<2>;
    expect(() => run(polyline(0, 1), lifted)).toThrow(/input 1 is line-strip in 3D/);
  });

  it("skips empty inputs, whatever their kind", () => {
    const empty = pointsGeometry([]);
    const merged = run(empty, polyline(0, 1), empty, polyline(2, 3));
    expect(merged.vertexCount).toBe(4);
    expect([...merged.stripOffsets!]).toEqual([0, 2]);
  });

  it("draws an input without indices in vertex order next to indexed ones", () => {
    const tri = (x: number): Geometry<2> => ({
      positions: new Float32Array([x, 0, x + 1, 0, x, 1]),
      vertexCount: 3,
      dim: 2,
      topology: "triangles",
    });
    const indexed = { ...tri(0), indices: new Uint32Array([2, 1, 0]) };
    expect([...run(indexed, tri(5)).indices!]).toEqual([2, 1, 0, 3, 4, 5]);
    expect(run(tri(0), tri(5)).indices).toBeUndefined();
  });
});
