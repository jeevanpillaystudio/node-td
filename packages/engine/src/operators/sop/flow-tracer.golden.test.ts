import { opGolden, w } from "../../../test/goldens";
import { flowTracer } from "./flow-tracer";

const upstream = {
  noise: { type: "simplex-noise" },
  grid: { type: "grid-sampler" },
  seeds: { type: "circle-pack" },
};
const wires = [
  w("noise.field", "grid.field"),
  w("$env.width", "grid.width"),
  w("$env.height", "grid.height"),
  w("$env.width", "seeds.width"),
  w("$env.height", "seeds.height"),
  w("grid.buffer", "trace.buffer"),
  w("seeds.geometry", "trace.geometry"),
  w("$env.width", "trace.width"),
  w("$env.height", "trace.height"),
];

opGolden(flowTracer, {
  default: { nodes: { ...upstream, trace: { type: "flow-tracer" } }, wires },
  "numSteps 50, stepLength 8, exitMargin 10": {
    nodes: {
      ...upstream,
      trace: { type: "flow-tracer", params: { numSteps: 50, stepLength: 8, exitMargin: 10 } },
    },
    wires,
  },
  landscape: {
    nodes: { ...upstream, trace: { type: "flow-tracer" } },
    wires,
    width: 640,
    height: 400,
  },
});
