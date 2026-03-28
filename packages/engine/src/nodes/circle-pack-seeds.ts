import type { GenNode, Path, Point } from "../types";

function packSeeds(
  w: number,
  h: number,
  minRadius: number,
  maxAttempts: number,
): Point[] {
  const seeds: Point[] = [];
  const r2 = minRadius * minRadius;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    let ok = true;
    for (const [sx, sy] of seeds) {
      const dx = x - sx;
      const dy = y - sy;
      if (dx * dx + dy * dy < r2) {
        ok = false;
        break;
      }
    }
    if (ok) seeds.push([x, y]);
  }
  return seeds;
}

export const circlePackSeeds: GenNode<
  { width: number; height: number },
  Path[]
> = {
  id: "circle-pack-seeds",
  family: "geometry",
  inputs: [
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  output: { name: "geometry", type: "geometry" },
  params: [
    { key: "minRadius", label: "Min Seed Radius", min: 10, max: 150, step: 5, default: 50 },
  ],
  evaluate({ width, height }, params) {
    const minRadius = params.minRadius ?? 50;
    return packSeeds(width, height, minRadius, 3000).map((p): Path => [p]);
  },
};
