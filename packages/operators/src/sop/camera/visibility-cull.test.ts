import { describe, expect, it } from "bun:test";
import {
  type Camera3D,
  CookEngine,
  type Geometry,
  type NodeEnv,
  pathsGeometry3,
} from "@node-td/kernel";
import { createDefaultRegistry } from "../../index";
import { visibilityCull } from "./visibility-cull";

const env = { width: 0, height: 0, dpr: 1, seed: 0, rng: { random: () => 0 } } satisfies NodeEnv;
const camera3d: Camera3D = {
  project: ([x, y, z]) => [x, z, -y],
  unproject: () => ({ origin: [0, 0, 0], dir: [0, -1, 0] }),
  viewport: [10, 10],
};
/** Two triangles over the unit square, as parametric-surface indexes them. */
const mesh: Geometry<3> = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1]),
  vertexCount: 4,
  dim: 3,
  topology: "triangles",
  indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
};
const stroke = pathsGeometry3([
  [
    [0.2, 0, 0.2],
    [0.8, 0, 0.8],
  ],
]);
const cull = (geometry: Geometry<3>, m: Geometry<3> = mesh, bypass = 0) =>
  visibilityCull.evaluate({ geometry, mesh: m, camera3d }, { bypass }, env).geometry;

describe("visibility-cull", () => {
  it("reports points as an error instead of passing them through", () => {
    expect(() => cull({ ...stroke, topology: "points" })).toThrow(/geometry is points/);
  });

  it("reports a mesh that is not indexed triangles", () => {
    const { indices: _indices, ...unindexed } = mesh;
    expect(() => cull(stroke, unindexed)).toThrow(/mesh is unindexed triangles/);
    expect(() => cull(stroke, { ...mesh, topology: "points" })).toThrow(/mesh is indexed points/);
  });

  it("culls a line strip without stripOffsets as one strip", () => {
    const { stripOffsets: _offsets, ...implicit } = stroke;
    expect(cull(implicit)).toEqual(cull(stroke));
  });

  it("passes empty geometry, and anything when bypassed", () => {
    const empty: Geometry<3> = {
      positions: new Float32Array(0),
      vertexCount: 0,
      dim: 3,
      topology: "points",
    };
    expect(cull(empty)).toBe(empty);
    const points = { ...stroke, topology: "points" as const };
    expect(cull(points, mesh, 1)).toBe(points);
  });

  // The error reaches the K1 error state: the node fails, the graph cooks on
  it("fails only its own node in a cook", () => {
    const engine = new CookEngine(
      {
        id: "cull-points",
        name: "cull points",
        nodes: {
          seeds: { type: "circle-pack" },
          lift: { type: "surface-lift" },
          noise: { type: "simplex-noise" },
          surface: { type: "parametric-surface" },
          liftmesh: { type: "surface-lift" },
          cam: { type: "camera-3d" },
          cull: { type: "visibility-cull" },
        },
        wires: [
          { from: "$env", output: "width", to: "seeds", input: "width" },
          { from: "$env", output: "height", to: "seeds", input: "height" },
          { from: "seeds", output: "geometry", to: "lift", input: "geometry" },
          { from: "noise", output: "field", to: "lift", input: "field" },
          { from: "$env", output: "width", to: "surface", input: "width" },
          { from: "$env", output: "height", to: "surface", input: "height" },
          { from: "surface", output: "geometry", to: "liftmesh", input: "geometry" },
          { from: "noise", output: "field", to: "liftmesh", input: "field" },
          { from: "$env", output: "width", to: "cam", input: "width" },
          { from: "$env", output: "height", to: "cam", input: "height" },
          { from: "lift", output: "geometry", to: "cull", input: "geometry" },
          { from: "liftmesh", output: "geometry", to: "cull", input: "mesh" },
          { from: "cam", output: "camera3d", to: "cull", input: "camera3d" },
        ],
      },
      createDefaultRegistry(),
    );
    const outputs = engine.cook({ width: 64, height: 64, dpr: 1, seed: 1 });
    expect(outputs.get("lift")).toBeDefined();
    expect(outputs.get("cull")).toBeUndefined();
    const failure = engine.stats.errors.get("cull");
    expect(failure?.kind).toBe("error");
    expect(String(failure?.kind === "error" && failure.error)).toMatch(
      /visibility-cull: geometry is points/,
    );
  });
});
