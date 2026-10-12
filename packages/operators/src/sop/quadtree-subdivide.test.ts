import { describe, expect, it } from "bun:test";
import type { NodeEnv } from "@node-td/kernel";
import { quadtreeSubdivide } from "./quadtree-subdivide";

const env = { width: 0, height: 0, dpr: 1, seed: 0, rng: { random: () => 0 } } satisfies NodeEnv;
const run = (width: number, height: number, params: { maxDepth: number; minSize?: number }) =>
  quadtreeSubdivide.evaluate(
    { width, height },
    { threshold: 0.5, minSize: 1, ...params },
    env,
  ).geometry;

/** Each leaf's rectangle, [x, y, w, h], from its TL and BR vertices. */
function cells(geo: ReturnType<typeof run>): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < geo.vertexCount; i += 4) {
    const [x, y] = [geo.positions[i * 2]!, geo.positions[i * 2 + 1]!];
    const [x1, y1] = [geo.positions[(i + 3) * 2]!, geo.positions[(i + 3) * 2 + 1]!];
    out.push([x, y, x1 - x, y1 - y]);
  }
  return out;
}

describe("quadtree-subdivide", () => {
  it("tiles a landscape area with square roots of its height, clipped to it", () => {
    // 250 × 100: three roots of 100, the last clipped to 50 wide
    expect(cells(run(250, 100, { maxDepth: 1, minSize: 100 }))).toEqual([
      [0, 0, 100, 100],
      [100, 0, 100, 100],
      [200, 0, 50, 100],
    ]);
  });

  it("drops quads wholly outside the area and clips the rest", () => {
    // 150 × 100, one level: the last root's right-hand children fall outside
    const leaves = cells(run(150, 100, { maxDepth: 1 }));
    expect(leaves).toEqual([
      [0, 0, 50, 50],
      [50, 0, 50, 50],
      [0, 50, 50, 50],
      [50, 50, 50, 50],
      [100, 0, 50, 50],
      [100, 50, 50, 50],
    ]);
    for (const [x, y, w, h] of leaves) {
      expect(x! + w!).toBeLessThanOrEqual(150);
      expect(y! + h!).toBeLessThanOrEqual(100);
    }
  });

  it("rounds maxDepth: 1.4 is one level, not two", () => {
    expect(run(64, 64, { maxDepth: 1.4 }).vertexCount).toBe(4 * 4);
  });

  it("tags each leaf with its cellId and depth, as binary-subdivide does", () => {
    const geo = run(64, 64, { maxDepth: 2 });
    const { cellId, depth } = geo.attributes!;
    expect(cellId!.length).toBe(geo.vertexCount);
    expect([...cellId!.subarray(0, 8)]).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(new Set(depth)).toEqual(new Set([1]));
  });
});
