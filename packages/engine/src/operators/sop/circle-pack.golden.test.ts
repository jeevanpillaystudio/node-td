import { opGolden, w } from "../../../test/support/op-golden";
import { circlePack } from "./circle-pack";

const extent = [w("$env.width", "seeds.width"), w("$env.height", "seeds.height")];

opGolden(circlePack, {
  default: { nodes: { seeds: { type: "circle-pack" } }, wires: extent },
  "minRadius 20, margin 0": {
    nodes: { seeds: { type: "circle-pack", params: { minRadius: 20, margin: 0 } } },
    wires: extent,
  },
  landscape: { nodes: { seeds: { type: "circle-pack" } }, wires: extent, width: 640, height: 400 },
});
