import { opGolden, w } from "../../../test/goldens";
import { continuousStroke } from "./continuous-stroke";

opGolden(continuousStroke, {
  strips: {
    nodes: {
      noise: { type: "simplex-noise" },
      grid: { type: "grid-sampler" },
      seeds: { type: "circle-pack" },
      trace: { type: "flow-tracer" },
      stroke: { type: "continuous-stroke" },
    },
    wires: [
      w("noise.field", "grid.field"),
      w("$env.width", "grid.width"),
      w("$env.height", "grid.height"),
      w("$env.width", "seeds.width"),
      w("$env.height", "seeds.height"),
      w("grid.buffer", "trace.buffer"),
      w("seeds.geometry", "trace.geometry"),
      w("$env.width", "trace.width"),
      w("$env.height", "trace.height"),
      w("trace.geometry", "stroke.geometry"),
    ],
  },
});
