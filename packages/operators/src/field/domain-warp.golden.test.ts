import { opGolden, w } from "../../test/goldens";
import { domainWarp } from "./domain-warp";

const noise = { type: "simplex-noise" };
const warp = { type: "perlin-noise" };
const wires = [w("noise.field", "dw.field"), w("warp.field", "dw.warp")];

opGolden(domainWarp, {
  default: { nodes: { noise, warp, dw: { type: "domain-warp" } }, wires },
  "amount 120, offset (300, 40)": {
    nodes: {
      noise,
      warp,
      dw: { type: "domain-warp", params: { amount: 120, offsetX: 300, offsetY: 40 } },
    },
    wires,
  },
  "opaque inputs": {
    nodes: {
      noise,
      warp,
      opaqueField: { type: "fixture-opaque-field" },
      opaqueWarp: { type: "fixture-opaque-field" },
      dw: { type: "domain-warp" },
    },
    wires: [
      w("noise.field", "opaqueField.field"),
      w("warp.field", "opaqueWarp.field"),
      w("opaqueField.field", "dw.field"),
      w("opaqueWarp.field", "dw.warp"),
    ],
  },
});
