import { opGolden, w } from "../../test/goldens";
import { quadtreeSubdivide } from "./quadtree-subdivide";

const extent = [w("$env.width", "quad.width"), w("$env.height", "quad.height")];

opGolden(quadtreeSubdivide, {
  // No field: every cell splits down to maxDepth or minSize
  "no field": { nodes: { quad: { type: "quadtree-subdivide" } }, wires: extent },
  "field, threshold 0.5": {
    nodes: { noise: { type: "simplex-noise" }, quad: { type: "quadtree-subdivide" } },
    wires: [w("noise.field", "quad.field"), ...extent],
  },
  // Roots the height square: two columns, the second clipped to the extent
  "landscape, field, maxDepth 4, minSize 16": {
    nodes: {
      noise: { type: "simplex-noise" },
      quad: { type: "quadtree-subdivide", params: { maxDepth: 4, minSize: 16 } },
    },
    wires: [w("noise.field", "quad.field"), ...extent],
    width: 640,
    height: 400,
  },
});
