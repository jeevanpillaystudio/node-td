import type { Operator, Field2D } from "@node-td/kernel";
import { createField, X, Y, c, u, mul, add, perlin as pn } from "@node-td/kernel/field";

type Inputs = Record<string, never>;
type Outputs = { field: Field2D };

export const perlinNoise: Operator<Inputs, Outputs> = {
  id: "perlin-noise",
  category: "field",
  label: "Perlin Noise",
  inputs: [],
  outputs: [{ name: "field", type: "field" }],
  params: [
    { key: "noiseScale", label: "Noise Scale", min: 0.0001, max: 0.1, step: 0.00005, default: 0.035 },
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
