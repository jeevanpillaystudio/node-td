import type { GenNode, Sampler2D } from "../types";
import { P } from "../noise-utils";

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD2: readonly [number, number][] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function simplex2(x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);

  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);

  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = i & 255;
  const jj = j & 255;
  const gi0 = P[(ii + P[jj]!) & 255]! % 8;
  const gi1 = P[(ii + i1 + P[(jj + j1) & 255]!) & 255]! % 8;
  const gi2 = P[(ii + 1 + P[(jj + 1) & 255]!) & 255]! % 8;

  let n0 = 0;
  let n1 = 0;
  let n2 = 0;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    t0 *= t0;
    const g = GRAD2[gi0]!;
    n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    t1 *= t1;
    const g = GRAD2[gi1]!;
    n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    t2 *= t2;
    const g = GRAD2[gi2]!;
    n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
  }

  return 70 * (n0 + n1 + n2);
}

export const simplexNoise: GenNode<Record<string, never>, Sampler2D> = {
  id: "simplex-noise",
  family: "sampler",
  inputs: [],
  output: { name: "sampler", type: "sampler" },
  params: [
    { key: "noiseScale", label: "Noise Scale", min: 0.005, max: 0.1, step: 0.001, default: 0.03 },
  ],
  evaluate(_inputs, params) {
    const scale = params.noiseScale ?? 0.03;
    return (x: number, y: number): number => {
      const n = simplex2(x * scale, y * scale);
      return (n + 1) * 0.5;
    };
  },
};
