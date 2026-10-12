import { opGolden, w } from "../../../test/goldens";
import { surfaceLift } from "./surface-lift";

const noise = { type: "simplex-noise" };
const mesh = { type: "parametric-surface", params: { uSegments: 8, vSegments: 8 } };
const meshWires = [
  w("$env.width", "mesh.width"),
  w("$env.height", "mesh.height"),
  w("mesh.geometry", "lift.geometry"),
  w("noise.field", "lift.field"),
];

opGolden(surfaceLift, {
  "grid mesh": { nodes: { noise, mesh, lift: { type: "surface-lift" } }, wires: meshWires },
  "grid mesh, amplitude 120, baseY 6": {
    nodes: { noise, mesh, lift: { type: "surface-lift", params: { amplitude: 120, baseY: 6 } } },
    wires: meshWires,
  },
  strips: {
    nodes: {
      noise,
      grid: { type: "grid-sampler" },
      seeds: { type: "circle-pack" },
      trace: { type: "flow-tracer" },
      lift: { type: "surface-lift" },
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
      w("trace.geometry", "lift.geometry"),
      w("noise.field", "lift.field"),
    ],
  },
});
