import { opGolden, w } from "../../../test/support/op-golden";
import { baseOutline } from "./base-outline";

const noise = { type: "simplex-noise" };
const wires = [
  w("noise.field", "base.field"),
  w("$env.width", "base.width"),
  w("$env.height", "base.height"),
];

opGolden(baseOutline, {
  default: { nodes: { noise, base: { type: "base-outline" } }, wires },
  "samples 150, amplitude 120, baseY 6": {
    nodes: {
      noise,
      base: { type: "base-outline", params: { samples: 150, amplitude: 120, baseY: 6 } },
    },
    wires,
  },
  "landscape, samples 10": {
    nodes: { noise, base: { type: "base-outline", params: { samples: 10 } } },
    wires,
    width: 640,
    height: 400,
  },
});
