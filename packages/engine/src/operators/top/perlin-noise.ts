import type { Operator, Field2D } from "../../kernel/types";
import { P } from "../../noise-utils";
import { createField, X, Y, c, u, mul, add, perlin as pn } from "../../kernel/field-expr";

type Inputs = Record<string, never>;
type Outputs = { field: Field2D };

const FADE = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

function lerp(a: number, b: number, t: number) {
  return a + t * (b - a);
}

function grad(hash: number, x: number, y: number) {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function pnoise(x: number, y: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = FADE(xf);
  const v = FADE(yf);
  const aa = P[(P[xi]! + yi) & 255]!;
  const ab = P[(P[xi]! + yi + 1) & 255]!;
  const ba = P[(P[(xi + 1) & 255]! + yi) & 255]!;
  const bb = P[(P[(xi + 1) & 255]! + yi + 1) & 255]!;
  return lerp(
    lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
    lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
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

    // (pnoise(x*s, y*s)*0.7 + pnoise(x*s2, y*s2)*0.3 + 1) * 0.5
    const s = u("noiseScale", scale);
    const s2 = u("noiseScale2", scale2);
    const n1 = mul(pn(mul(X, s), mul(Y, s)), c(0.7));
    const n2 = mul(pn(mul(X, s2), mul(Y, s2)), c(0.3));
    const expr = mul(add(add(n1, n2), c(1)), c(0.5));

    return { field: createField(expr) };
  },
};
