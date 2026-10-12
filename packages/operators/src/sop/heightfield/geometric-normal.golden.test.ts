import { opGolden, w } from "../../../test/goldens";
import { geometricNormal } from "./geometric-normal";

// The grid includes the x = 0 and z = 0 edges, where the one-sided differences flip
const upstream = {
  noise: { type: "simplex-noise" },
  mesh: { type: "parametric-surface", params: { uSegments: 8, vSegments: 8 } },
  lift: { type: "surface-lift", params: { amplitude: 120, baseY: 6 } },
};
const wires = [
  w("$env.width", "mesh.width"),
  w("$env.height", "mesh.height"),
  w("mesh.geometry", "lift.geometry"),
  w("noise.field", "lift.field"),
  w("lift.geometry", "normals.geometry"),
  w("noise.field", "normals.field"),
];

opGolden(geometricNormal, {
  "grid mesh, epsilon 1, amplitude 120": {
    nodes: {
      ...upstream,
      normals: { type: "geometric-normal", params: { epsilon: 1, amplitude: 120 } },
    },
    wires,
  },
  "grid mesh, default epsilon": {
    nodes: { ...upstream, normals: { type: "geometric-normal" } },
    wires,
  },
  "grid mesh, epsilon 4, amplitude 60": {
    nodes: {
      ...upstream,
      normals: { type: "geometric-normal", params: { epsilon: 4, amplitude: 60 } },
    },
    wires,
  },
});
