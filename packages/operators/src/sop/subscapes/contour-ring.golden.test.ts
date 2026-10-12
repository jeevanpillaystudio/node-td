import { opGolden, w } from "../../../test/goldens";
import { contourRing } from "./contour-ring";

const noise = { type: "simplex-noise" };
const wires = [
  w("noise.field", "contour.field"),
  w("$env.width", "contour.width"),
  w("$env.height", "contour.height"),
];

opGolden(contourRing, {
  default: { nodes: { noise, contour: { type: "contour-ring" } }, wires },
  "levels 5, samples 150, amplitude 120, baseY 6": {
    nodes: {
      noise,
      contour: {
        type: "contour-ring",
        params: { levels: 5, samples: 150, amplitude: 120, baseY: 6 },
      },
    },
    wires,
  },
  "landscape, levels 2, samples 10": {
    nodes: { noise, contour: { type: "contour-ring", params: { levels: 2, samples: 10 } } },
    wires,
    width: 640,
    height: 400,
  },
});
