import { opGolden, w } from "../../../test/goldens";
import { poissonDisc } from "./poisson-disc";

const extent = [w("$env.width", "seeds.width"), w("$env.height", "seeds.height")];
const partitions = {
  type: "binary-subdivide",
  params: { maxDepth: 5, minSize: 20, splitJitter: 0.15 },
};
const partitioned = [
  w("$env.width", "partitions.width"),
  w("$env.height", "partitions.height"),
  ...extent,
  w("partitions.geometry", "seeds.partitions"),
];

opGolden(poissonDisc, {
  default: { nodes: { seeds: { type: "poisson-disc" } }, wires: extent },
  "minRadius 20, margin 0": {
    nodes: { seeds: { type: "poisson-disc", params: { minRadius: 20, margin: 0 } } },
    wires: extent,
  },
  "partitions, minRadius 10": {
    nodes: { partitions, seeds: { type: "poisson-disc", params: { minRadius: 10 } } },
    wires: partitioned,
  },
  "partitions, minRadius 10, densityScale 3": {
    nodes: {
      partitions,
      seeds: { type: "poisson-disc", params: { minRadius: 10, densityScale: 3 } },
    },
    wires: partitioned,
  },
});
