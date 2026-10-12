import { opGolden, w } from "../../test/goldens";
import { dashStroke } from "./dash-stroke";

const traceNodes = {
  noise: { type: "simplex-noise" },
  grid: { type: "grid-sampler" },
  seeds: { type: "circle-pack" },
  trace: { type: "flow-tracer" },
};
const traceWires = [
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

opGolden(dashStroke, {
  strips: {
    nodes: { ...traceNodes, dash: { type: "dash-stroke" } },
    wires: [...traceWires, w("trace.geometry", "dash.geometry")],
  },
  // Strips coloured by diffuse-shade (lifted, shaded, laid back flat): each
  // dash keeps its vertices' colours and normals
  "coloured strips": {
    nodes: {
      ...traceNodes,
      lift: { type: "surface-lift" },
      normals: { type: "geometric-normal", params: { epsilon: 1 } },
      shade: { type: "diffuse-shade" },
      flat: { type: "fixture-ground-plane" },
      dash: { type: "dash-stroke" },
    },
    wires: [
      ...traceWires,
      w("trace.geometry", "lift.geometry"),
      w("noise.field", "lift.field"),
      w("lift.geometry", "normals.geometry"),
      w("noise.field", "normals.field"),
      w("normals.geometry", "shade.geometry"),
      w("shade.geometry", "flat.geometry"),
      w("flat.geometry", "dash.geometry"),
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
