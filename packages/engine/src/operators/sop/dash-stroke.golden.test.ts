import { opGolden, w } from "../../../test/goldens";
import { dashStroke } from "./dash-stroke";

opGolden(dashStroke, {
  strips: {
    nodes: {
      noise: { type: "simplex-noise" },
      grid: { type: "grid-sampler" },
      seeds: { type: "circle-pack" },
      trace: { type: "flow-tracer" },
      dash: { type: "dash-stroke" },
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
      w("trace.geometry", "dash.geometry"),
    ],
  },
  // Every point is a one-vertex path, too short to dash
  points: {
    nodes: { seeds: { type: "circle-pack" }, dash: { type: "dash-stroke" } },
    wires: [
      w("$env.width", "seeds.width"),
      w("$env.height", "seeds.height"),
      w("seeds.geometry", "dash.geometry"),
    ],
  },
});
