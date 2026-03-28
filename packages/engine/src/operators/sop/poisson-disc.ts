import type { Operator, Geometry } from "../../kernel/types";
import { pointsGeometry } from "../../kernel/types";

type Inputs = { width: number; height: number };
type Outputs = { geometry: Geometry<2> };

/**
 * Bridson's algorithm for Poisson-disc sampling.
 * Produces more uniform coverage than rejection sampling in O(n) time.
 */
function poissonDiscSample(
  w: number,
  h: number,
  minRadius: number,
  k: number = 30,
): [number, number][] {
  const r = minRadius;
  const cellSize = r / Math.SQRT2;
  const gridW = Math.ceil(w / cellSize);
  const gridH = Math.ceil(h / cellSize);
  const grid: ([number, number] | null)[] = new Array<null>(gridW * gridH).fill(null);
  const points: [number, number][] = [];
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
  const p0: [number, number] = [x0, y0];
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

      const np: [number, number] = [nx, ny];
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

export const poissonDisc: Operator<Inputs, Outputs> = {
  id: "poisson-disc",
  category: "sop",
  label: "Poisson Disc Seeds",
  inputs: [
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [
    { key: "minRadius", label: "Min Seed Radius", min: 10, max: 150, step: 5, default: 40 },
    { key: "margin", label: "Edge Margin", min: 0, max: 300, step: 10, default: 100 },
  ],
  evaluate({ width, height }, params) {
    const minRadius = params.minRadius ?? 40;
    const margin = params.margin ?? 100;
    // Sample in an extended area so seeds reach all canvas edges
    const raw = poissonDiscSample(width + 2 * margin, height + 2 * margin, minRadius);
    const shifted = raw.map(([x, y]): [number, number] => [x - margin, y - margin]);
    return { geometry: pointsGeometry(shifted) };
  },
};
