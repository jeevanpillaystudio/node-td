import { opGolden, w } from "../../../../test/support/op-golden";
import { fieldGradient } from "./field-gradient";

const noise = { type: "simplex-noise" };

opGolden(fieldGradient, {
  "epsilon 1": {
    nodes: { noise, grad: { type: "field-gradient" } },
    wires: [w("noise.field", "grad.field")],
  },
  "epsilon 0.25": {
    nodes: { noise, grad: { type: "field-gradient", params: { epsilon: 0.25 } } },
    wires: [w("noise.field", "grad.field")],
  },
  "opaque input": {
    nodes: { noise, opaque: { type: "fixture-opaque-field" }, grad: { type: "field-gradient" } },
    wires: [w("noise.field", "opaque.field"), w("opaque.field", "grad.field")],
  },
});
