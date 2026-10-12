import type { Operator, Field2D } from "@node-td/kernel";
import { createField, X, Y, c, u, mul, add, simplex as sn } from "@node-td/kernel/field";

type Inputs = Record<string, never>;
type Outputs = { field: Field2D };

export const simplexNoise: Operator<Inputs, Outputs> = {
  id: "simplex-noise",
  category: "field",
  label: "Simplex Noise",
  inputs: [],
  outputs: [{ name: "field", type: "field" }],
  params: [
    { key: "noiseScale", label: "Noise Scale", min: 0.005, max: 0.1, step: 0.001, default: 0.03 },
  ],
  evaluate(_inputs, params) {
    const scale = params.noiseScale ?? 0.03;

    // (simplex2(x*scale, y*scale) + 1) * 0.5
    const s = u("noiseScale", scale);
    const expr = mul(add(sn(mul(X, s), mul(Y, s)), c(1)), c(0.5));

    return { field: createField(expr) };
  },
};
