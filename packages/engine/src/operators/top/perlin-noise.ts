import type { Operator, Field2D } from "../../core/types";
import { P } from "../../noise-utils";

type Inputs = Record<string, never>;
type Outputs = { field: Field2D };

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number) {
  return a + t * (b - a);
}

function grad(h: number, x: number, y: number) {
  const hh = h & 3;
  return (hh & 1 ? -x : x) + (hh & 2 ? -y : y);
}

export function pnoise(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  const a = (P[X]! + Y) & 255;
  const b = (P[X + 1]! + Y) & 255;
  return lerp(
    lerp(grad(P[a]!, xf, yf), grad(P[b]!, xf - 1, yf), u),
    lerp(grad(P[a + 1]!, xf, yf - 1), grad(P[b + 1]!, xf - 1, yf - 1), u),
    v,
  );
}

export const perlinNoise: Operator<Inputs, Outputs> = {
  id: "perlin-noise",
  category: "top",
  label: "Perlin Noise",
  inputs: [],
  outputs: [{ name: "field", type: "field" }],
  params: [
    { key: "noiseScale", label: "Noise Scale", min: 0.005, max: 0.1, step: 0.001, default: 0.035 },
  ],
  evaluate(_inputs, params) {
    const scale = params.noiseScale ?? 0.035;
    const scale2 = scale * 0.5;
    const field: Field2D = (x, y) => {
      const n1 = pnoise(x * scale, y * scale) * 0.7;
      const n2 = pnoise(x * scale2, y * scale2) * 0.3;
      return (n1 + n2 + 1) * 0.5;
    };
    return { field };
  },
};
