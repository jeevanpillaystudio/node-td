import { describe, expect, it } from "bun:test";
import type { Geometry, NodeEnv } from "@node-td/kernel";
import { transform2d } from "./transform-2d";

const env = { width: 0, height: 0, dpr: 1, seed: 0, rng: { random: () => 0 } } satisfies NodeEnv;

describe("transform-2d", () => {
  // The port is geo2, but a geometry is only data: a 3D one keeps its z
  it("moves x and y and keeps the z of a 3D geometry", () => {
    const lifted = {
      positions: new Float32Array([1, 2, 3, 4, 5, 6]),
      vertexCount: 2,
      dim: 3,
      topology: "points",
    } as unknown as Geometry<2>;
    const params = { translateX: 10, translateY: 20, rotation: 0, scaleX: 2, scaleY: 3 };
    const { positions } = transform2d.evaluate({ geometry: lifted }, params, env).geometry;
    expect([...positions]).toEqual([12, 26, 3, 18, 35, 6]);
  });
});
