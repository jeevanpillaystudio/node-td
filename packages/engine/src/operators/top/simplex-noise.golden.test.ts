import { opGolden } from "../../../test/goldens";
import { simplexNoise } from "./simplex-noise";

opGolden(simplexNoise, {
  default: { nodes: { noise: { type: "simplex-noise" } }, wires: [] },
  "noiseScale 0.012": {
    nodes: { noise: { type: "simplex-noise", params: { noiseScale: 0.012 } } },
    wires: [],
  },
});
