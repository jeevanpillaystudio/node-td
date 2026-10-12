import { opGolden, w } from "../../../test/goldens";
import { merge } from "./merge";

const strips = {
  noise: { type: "simplex-noise" },
  grid: { type: "grid-sampler" },
  seeds: { type: "circle-pack" },
  trace: { type: "flow-tracer" },
};
const stripWires = [
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
const polyline = { type: "fixture-polyline" };
const polylineWires = [w("$env.width", "polyline.width"), w("$env.height", "polyline.height")];
const mesh = (key: string, uSegments: number, vSegments: number) => ({
  node: { type: "parametric-surface", params: { uSegments, vSegments } },
  wires: [w("$env.width", `${key}.width`), w("$env.height", `${key}.height`)],
});
const meshA = mesh("meshA", 4, 4);
const meshB = mesh("meshB", 6, 4);

opGolden(merge, {
  "single input": {
    nodes: { seeds: { type: "circle-pack" }, merge: { type: "merge" } },
    wires: [
      w("$env.width", "seeds.width"),
      w("$env.height", "seeds.height"),
      w("seeds.geometry", "merge.geometry"),
    ],
  },
  "two explicit strip sets": {
    nodes: { ...strips, dash: { type: "dash-stroke" }, merge: { type: "merge" } },
    wires: [
      ...stripWires,
      w("trace.geometry", "dash.geometry"),
      w("trace.geometry", "merge.geometry"),
      w("dash.geometry", "merge.geometry"),
    ],
  },
  "mixed strip offsets, implicit strip first": {
    nodes: { ...strips, polyline, merge: { type: "merge" } },
    wires: [
      ...stripWires,
      ...polylineWires,
      w("polyline.geometry", "merge.geometry"),
      w("trace.geometry", "merge.geometry"),
    ],
  },
  "mixed strip offsets, implicit strip last": {
    nodes: { ...strips, polyline, merge: { type: "merge" } },
    wires: [
      ...stripWires,
      ...polylineWires,
      w("trace.geometry", "merge.geometry"),
      w("polyline.geometry", "merge.geometry"),
    ],
  },
  "mixed topology, points first": {
    nodes: { ...strips, merge: { type: "merge" } },
    wires: [
      ...stripWires,
      w("seeds.geometry", "merge.geometry"),
      w("trace.geometry", "merge.geometry"),
    ],
  },
  "indexed triangles": {
    nodes: { meshA: meshA.node, meshB: meshB.node, merge: { type: "merge" } },
    wires: [
      ...meshA.wires,
      ...meshB.wires,
      w("meshA.geometry", "merge.geometry"),
      w("meshB.geometry", "merge.geometry"),
    ],
  },
  "3D, normals on one input": {
    nodes: {
      noise: { type: "simplex-noise" },
      meshA: meshA.node,
      meshB: meshB.node,
      liftA: { type: "surface-lift" },
      liftB: { type: "surface-lift" },
      normals: { type: "geometric-normal", params: { epsilon: 1 } },
      merge: { type: "merge" },
    },
    wires: [
      ...meshA.wires,
      ...meshB.wires,
      w("meshA.geometry", "liftA.geometry"),
      w("noise.field", "liftA.field"),
      w("meshB.geometry", "liftB.geometry"),
      w("noise.field", "liftB.field"),
      w("liftA.geometry", "normals.geometry"),
      w("noise.field", "normals.field"),
      w("normals.geometry", "merge.geometry"),
      w("liftB.geometry", "merge.geometry"),
    ],
  },
});
