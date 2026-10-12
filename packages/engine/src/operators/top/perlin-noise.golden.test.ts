import { opGolden } from "../../../test/support/op-golden";
import { perlinNoise } from "./perlin-noise";

opGolden(perlinNoise, {
  default: { nodes: { noise: { type: "perlin-noise" } }, wires: [] },
  "noiseScale 0.01": {
    nodes: { noise: { type: "perlin-noise", params: { noiseScale: 0.01 } } },
    wires: [],
  },
});
