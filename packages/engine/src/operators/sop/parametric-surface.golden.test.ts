import { opGolden, w } from "../../../test/support/op-golden";
import { parametricSurface } from "./parametric-surface";

const extent = [w("$env.width", "mesh.width"), w("$env.height", "mesh.height")];

opGolden(parametricSurface, {
  "flat, 60 × 60": { nodes: { mesh: { type: "parametric-surface" } }, wires: extent },
  "displaced, 16 × 12, amplitude 40": {
    nodes: {
      noise: { type: "simplex-noise" },
      mesh: { type: "parametric-surface", params: { uSegments: 16, vSegments: 12, amplitude: 40 } },
    },
    wires: [w("noise.field", "mesh.field"), ...extent],
  },
  "landscape, 8 × 4": {
    nodes: { mesh: { type: "parametric-surface", params: { uSegments: 8, vSegments: 4 } } },
    wires: extent,
    width: 640,
    height: 400,
  },
});
