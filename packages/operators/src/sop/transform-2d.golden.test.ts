import { opGolden, w } from "../../test/goldens";
import { transform2d } from "./transform-2d";

const moved = {
  type: "transform-2d",
  params: { translateX: 30, translateY: -20, rotation: 0.5, scaleX: 1.5, scaleY: 0.75 },
};
const points = {
  nodes: { seeds: { type: "circle-pack" } },
  wires: [
    w("$env.width", "seeds.width"),
    w("$env.height", "seeds.height"),
    w("seeds.geometry", "xf.geometry"),
  ],
};

opGolden(transform2d, {
  identity: { nodes: { ...points.nodes, xf: { type: "transform-2d" } }, wires: points.wires },
  "translate, rotate, scale": { nodes: { ...points.nodes, xf: moved }, wires: points.wires },
  "strips keep their offsets": {
    nodes: {
      noise: { type: "simplex-noise" },
      grid: { type: "grid-sampler" },
      seeds: { type: "circle-pack" },
      trace: { type: "flow-tracer" },
      xf: moved,
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
      w("trace.geometry", "xf.geometry"),
    ],
  },
});
