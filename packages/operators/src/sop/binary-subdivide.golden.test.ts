import { opGolden, w } from "../../test/goldens";
import { binarySubdivide } from "./binary-subdivide";

const extent = [w("$env.width", "cells.width"), w("$env.height", "cells.height")];

opGolden(binarySubdivide, {
  default: { nodes: { cells: { type: "binary-subdivide" } }, wires: extent },
  // Deep enough that minSize, not maxDepth, stops the splitting
  "maxDepth 8, minSize 20, splitJitter 0.3": {
    nodes: {
      cells: { type: "binary-subdivide", params: { maxDepth: 8, minSize: 20, splitJitter: 0.3 } },
    },
    wires: extent,
  },
  "landscape, splitJitter 0": {
    nodes: { cells: { type: "binary-subdivide", params: { splitJitter: 0 } } },
    wires: extent,
    width: 320,
    height: 200,
  },
});
