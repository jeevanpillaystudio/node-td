import { opGolden, w } from "../../test/goldens";
import { fbm } from "./fbm";

const noise = { type: "simplex-noise" };

opGolden(fbm, {
  // FieldExpr path
  "domainRotation 0": {
    nodes: { noise, fbm: { type: "fbm" } },
    wires: [w("noise.field", "fbm.field")],
  },
  // Closure path: rotation is not expressible as a FieldExpr
  "domainRotation 0.646": {
    nodes: { noise, fbm: { type: "fbm", params: { domainRotation: 0.646 } } },
    wires: [w("noise.field", "fbm.field")],
  },
  "octaves 3, lacunarity 2.5, gain 0.6, amplitude 2": {
    nodes: {
      noise,
      fbm: { type: "fbm", params: { octaves: 3, lacunarity: 2.5, gain: 0.6, amplitude: 2 } },
    },
    wires: [w("noise.field", "fbm.field")],
  },
  "opaque input": {
    nodes: { noise, opaque: { type: "fixture-opaque-field" }, fbm: { type: "fbm" } },
    wires: [w("noise.field", "opaque.field"), w("opaque.field", "fbm.field")],
  },
});
