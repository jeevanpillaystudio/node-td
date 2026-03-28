import type { GenNode, Path, Point } from "../types";

/**
 * Bridson's algorithm for Poisson-disc sampling.
 * Produces more uniform coverage than rejection sampling
 * in O(n) time relative to output size.
 */
function poissonDisc(
  w: number,
  h: number,
  minRadius: number,
  k: number = 30,
): Point[] {
  const r = minRadius;
  const cellSize = r / Math.SQRT2;
  const gridW = Math.ceil(w / cellSize);
  const gridH = Math.ceil(h / cellSize);
  const grid: (Point | null)[] = new Array(gridW * gridH).fill(null);
  const points: Point[] = [];
  const active: number[] = [];

  function gridIndex(x: number, y: number): number {
    return Math.floor(x / cellSize) + Math.floor(y / cellSize) * gridW;
  }

  function tooClose(px: number, py: number): boolean {
    const col = Math.floor(px / cellSize);
    const row = Math.floor(py / cellSize);
    const r2 = r * r;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const c = col + dx;
        const rr = row + dy;
        if (c < 0 || c >= gridW || rr < 0 || rr >= gridH) continue;
        const neighbour = grid[c + rr * gridW];
        if (!neighbour) continue;
        const ddx = px - neighbour[0];
        const ddy = py - neighbour[1];
        if (ddx * ddx + ddy * ddy < r2) return true;
      }
    }
    return false;
  }

  const x0 = Math.random() * w;
  const y0 = Math.random() * h;
  const p0: Point = [x0, y0];
  points.push(p0);
  grid[gridIndex(x0, y0)] = p0;
  active.push(0);

  while (active.length > 0) {
    const idx = Math.floor(Math.random() * active.length);
    const base = points[active[idx]!]!;
    let found = false;

    for (let attempt = 0; attempt < k; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = r + Math.random() * r;
      const nx = base[0] + Math.cos(angle) * dist;
      const ny = base[1] + Math.sin(angle) * dist;

      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (tooClose(nx, ny)) continue;

      const np: Point = [nx, ny];
      points.push(np);
      grid[gridIndex(nx, ny)] = np;
      active.push(points.length - 1);
      found = true;
      break;
    }

    if (!found) {
      active.splice(idx, 1);
    }
  }

  return points;
}

export const poissonDiscSeeds: GenNode<
  { width: number; height: number },
  Path[]
> = {
  id: "poisson-disc-seeds",
  family: "geometry",
  inputs: [
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  output: { name: "geometry", type: "geometry" },
  params: [
    { key: "minRadius", label: "Min Seed Radius", min: 10, max: 150, step: 5, default: 40 },
  ],
  evaluate({ width, height }, params) {
    const minRadius = params.minRadius ?? 40;
    return poissonDisc(width, height, minRadius).map((p): Path => [p]);
  },
};
