import { type OpFixture, opGolden, w } from "../../../../test/support/op-golden";
import { fieldRemap } from "./field-remap";

const noise = { type: "simplex-noise" };

const MODES: [string, Record<string, number>][] = [
  ["Clamp, lo 0.3, hi 0.7", { mode: 0, lo: 0.3, hi: 0.7 }],
  ["Quantize, steps 4", { mode: 1, steps: 4 }],
  ["Ridge", { mode: 2 }],
  ["Smoothstep, lo 0.3, hi 0.7", { mode: 3, lo: 0.3, hi: 0.7 }],
  ["Power 2", { mode: 4, power: 2 }],
  ["Invert", { mode: 5 }],
  ["Abs", { mode: 6 }],
];

const fixtures: Record<string, OpFixture> = {};
for (const [name, params] of MODES) {
  // FieldExpr path
  fixtures[name] = {
    nodes: { noise, remap: { type: "field-remap", params } },
    wires: [w("noise.field", "remap.field")],
  };
  // Closure path
  fixtures[`${name}, opaque input`] = {
    nodes: {
      noise,
      opaque: { type: "fixture-opaque-field" },
      remap: { type: "field-remap", params },
    },
    wires: [w("noise.field", "opaque.field"), w("opaque.field", "remap.field")],
  };
}

// Noise is in [0, 1], where Abs is the identity; a gradient is signed
fixtures["Abs, signed input"] = {
  nodes: {
    noise,
    grad: { type: "field-gradient" },
    remap: { type: "field-remap", params: { mode: 6 } },
  },
  wires: [w("noise.field", "grad.field"), w("grad.dx", "remap.field")],
};

opGolden(fieldRemap, fixtures);
