import { opGolden, w } from "../../../../test/support/op-golden";
import { curlNoise } from "./curl-noise";

const noise = { type: "simplex-noise" };

opGolden(curlNoise, {
  default: {
    nodes: { noise, curl: { type: "curl-noise" } },
    wires: [w("noise.field", "curl.field")],
  },
  "epsilon 2, scale 0.5": {
    nodes: { noise, curl: { type: "curl-noise", params: { epsilon: 2, scale: 0.5 } } },
    wires: [w("noise.field", "curl.field")],
  },
  "opaque input": {
    nodes: { noise, opaque: { type: "fixture-opaque-field" }, curl: { type: "curl-noise" } },
    wires: [w("noise.field", "opaque.field"), w("opaque.field", "curl.field")],
  },
});
