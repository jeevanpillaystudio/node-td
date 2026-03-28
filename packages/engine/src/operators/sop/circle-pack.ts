import type { Operator, Geometry } from "../../kernel/types";
import { pointsGeometry } from "../../kernel/types";

type Inputs = { width: number; height: number };
type Outputs = { geometry: Geometry<2> };

function packSeeds(
  w: number,
  h: number,
  minRadius: number,
  maxAttempts: number,
): [number, number][] {
  const seeds: [number, number][] = [];
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

export const circlePack: Operator<Inputs, Outputs> = {
  id: "circle-pack",
  category: "sop",
  label: "Circle Pack Seeds",
  inputs: [
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [
    { key: "minRadius", label: "Min Seed Radius", min: 10, max: 150, step: 5, default: 50 },
    { key: "margin", label: "Edge Margin", min: 0, max: 300, step: 10, default: 100 },
  ],
  evaluate({ width, height }, params) {
    const minRadius = params.minRadius ?? 50;
    const margin = params.margin ?? 100;
    const raw = packSeeds(width + 2 * margin, height + 2 * margin, minRadius, 3000);
    const shifted = raw.map(([x, y]): [number, number] => [x - margin, y - margin]);
    return { geometry: pointsGeometry(shifted) };
  },
};
