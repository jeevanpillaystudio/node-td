import { opGolden, w } from "../../test/goldens";
import { curlAngle } from "./curl-angle";

const noise = { type: "simplex-noise" };

opGolden(curlAngle, {
  default: {
    nodes: { noise, curl: { type: "curl-angle" } },
    wires: [w("noise.field", "curl.field")],
  },
  "epsilon 2, scale 0.5": {
    nodes: { noise, curl: { type: "curl-angle", params: { epsilon: 2, scale: 0.5 } } },
    wires: [w("noise.field", "curl.field")],
  },
  "opaque input": {
    nodes: { noise, opaque: { type: "fixture-opaque-field" }, curl: { type: "curl-angle" } },
    wires: [w("noise.field", "opaque.field"), w("opaque.field", "curl.field")],
  },
});
