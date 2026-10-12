import { describe, expect, it } from "bun:test";
import type { Field2D, Geometry, NodeEnv } from "@node-td/kernel";
import { fbm } from "../../field/fbm";
import { simplexNoise } from "../../field/simplex-noise";
import { geometricNormal } from "./geometric-normal";

const env = {
  width: 256,
  height: 256,
  dpr: 1,
  seed: 0,
  rng: { random: () => 0 },
} satisfies NodeEnv;

/** A grid of vertices on the ground plane, with the x = 0 and z = 0 edges. */
function grid(n: number, spacing: number): Geometry<3> {
  const positions = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3;
      positions[k] = i * spacing;
      positions[k + 2] = j * spacing;
    }
  }
  return { positions, vertexCount: n * n, dim: 3, topology: "points" };
}

function normalsOf(field: Field2D, epsilon: number, amplitude: number, geo = grid(5, 10)) {
  const out = geometricNormal.evaluate({ geometry: geo, field }, { epsilon, amplitude }, env);
  return { geo, normals: out.geometry.normals! };
}

describe("geometric-normal", () => {
  // h = 0.5x: the normal is (-0.5, 1, 0) normalised everywhere, the
  // x = 0 and z = 0 edges, where the differences are forward, included
  it("on the plane h = 0.5x the normal is (-0.447, 0.894, 0) at every vertex", () => {
    const { normals, geo } = normalsOf((x) => 0.5 * x, 1, 1);
    for (let i = 0; i < geo.vertexCount; i++) {
      expect(normals[i * 3]).toBeCloseTo(-0.447, 3);
      expect(normals[i * 3 + 1]).toBeCloseTo(0.894, 3);
      expect(normals[i * 3 + 2]).toBeCloseTo(0, 6);
    }
  });

  it("on the plane h = 0.5z the normal is (0, 0.894, -0.447) at every vertex", () => {
    const { normals, geo } = normalsOf((_x, z) => 0.5 * z, 1, 1);
    for (let i = 0; i < geo.vertexCount; i++) {
      expect(normals[i * 3]).toBeCloseTo(0, 6);
      expect(normals[i * 3 + 1]).toBeCloseTo(0.894, 3);
      expect(normals[i * 3 + 2]).toBeCloseTo(-0.447, 3);
    }
  });

  // The normal before the fix was (∂h/∂x, 1, ∂h/∂z) inside the grid. With
  // the light mirrored in x and z, as Subscapes' was, N·L there is the
  // same to the last bit, so the interior shading does not change.
  it("inside the grid, N·L with the mirrored light equals the pre-fix N·L", () => {
    const noise = simplexNoise.evaluate({}, { noiseScale: 0.018 }, env).field;
    const field = fbm.evaluate(
      { field: noise },
      { octaves: 3, lacunarity: 2, gain: 0.5, amplitude: 1, domainRotation: 0 },
      env,
    ).field;
    const eps = 1;
    const amp = 120;
    const { normals, geo } = normalsOf(field, eps, amp, grid(12, 7.5));

    const unit = (x: number, y: number, z: number) => {
      const len = Math.sqrt(x * x + y * y + z * z);
      return [x / len, y / len, z / len] as const;
    };
    const [olx, oly, olz] = unit(-0.5, -0.707, -0.5);
    const [nlx, nly, nlz] = unit(0.5, -0.707, 0.5);

    let interior = 0;
    for (let i = 0; i < geo.vertexCount; i++) {
      const px = geo.positions[i * 3]!;
      const pz = geo.positions[i * 3 + 2]!;
      if (px < eps || pz < eps) continue;
      interior++;

      // The pre-fix normal: the cross product of backward-difference tangents
      const hC = field(px, pz) * amp;
      const ty = hC - field(px - eps, pz) * amp;
      const uy = hC - field(px, pz - eps) * amp;
      let [ox, oy, oz] = [uy * 0 - -eps * ty, -eps * -eps - 0 * 0, 0 * ty - uy * -eps];
      const inv = 1 / Math.sqrt(ox * ox + oy * oy + oz * oz);
      [ox, oy, oz] = [Math.fround(ox * inv), Math.fround(oy * inv), Math.fround(oz * inv)];

      const before = ox * olx + oy * oly + oz * olz;
      const after = normals[i * 3]! * nlx + normals[i * 3 + 1]! * nly + normals[i * 3 + 2]! * nlz;
      expect(after).toBe(before);
    }
    expect(interior).toBe(11 * 11);
  });

  it("points up at the grid's edges", () => {
    const noise = simplexNoise.evaluate({}, { noiseScale: 0.05 }, env).field;
    const { normals, geo } = normalsOf(noise, 1, 120);
    for (let i = 0; i < geo.vertexCount; i++) expect(normals[i * 3 + 1]).toBeGreaterThan(0);
  });
});
