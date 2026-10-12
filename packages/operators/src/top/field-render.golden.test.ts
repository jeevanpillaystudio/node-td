import { opGolden, w } from "../../test/goldens";
import { fieldRender } from "./field-render";

const noise = { type: "simplex-noise" };
const wires = [
  w("noise.field", "render.field"),
  w("$env.width", "render.width"),
  w("$env.height", "render.height"),
];

opGolden(fieldRender, {
  default: { nodes: { noise, render: { type: "field-render" } }, wires, width: 128, height: 128 },
  "scale 0.5": {
    nodes: { noise, render: { type: "field-render", params: { scale: 0.5 } } },
    wires,
    width: 128,
    height: 128,
  },
  "dpr 2": {
    nodes: { noise, render: { type: "field-render" } },
    wires,
    width: 128,
    height: 128,
    dpr: 2,
  },
  "opaque field": {
    nodes: { noise, opaque: { type: "fixture-opaque-field" }, render: { type: "field-render" } },
    wires: [
      w("noise.field", "opaque.field"),
      w("opaque.field", "render.field"),
      w("$env.width", "render.width"),
      w("$env.height", "render.height"),
    ],
    width: 128,
    height: 128,
  },
  landscape: { nodes: { noise, render: { type: "field-render" } }, wires, width: 160, height: 96 },
});
