import { opGolden, w } from "../../../test/support/op-golden";
import { gridSampler } from "./grid-sampler";

const noise = { type: "simplex-noise" };
const extent = [w("$env.width", "grid.width"), w("$env.height", "grid.height")];

opGolden(gridSampler, {
  // 13 × 13 cells: below the 500-cell threshold, so no GPU probe
  "resolution 20": {
    nodes: { noise, grid: { type: "grid-sampler" } },
    wires: [w("noise.field", "grid.field"), ...extent],
  },
  // 52 × 52 cells: probes for WebGL, finds none, samples on the CPU
  "resolution 5": {
    nodes: { noise, grid: { type: "grid-sampler", params: { resolution: 5 } } },
    wires: [w("noise.field", "grid.field"), ...extent],
  },
  "resolution 5, opaque field": {
    nodes: {
      noise,
      opaque: { type: "fixture-opaque-field" },
      grid: { type: "grid-sampler", params: { resolution: 5 } },
    },
    wires: [w("noise.field", "opaque.field"), w("opaque.field", "grid.field"), ...extent],
  },
  "landscape, resolution 18": {
    nodes: { noise, grid: { type: "grid-sampler", params: { resolution: 18 } } },
    wires: [w("noise.field", "grid.field"), ...extent],
    width: 640,
    height: 400,
  },
});
