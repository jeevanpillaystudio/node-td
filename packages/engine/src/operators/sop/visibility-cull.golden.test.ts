import { opGolden, w } from "../../../test/goldens";
import { visibilityCull } from "./visibility-cull";

// Subscapes' cull: traced strokes lifted onto the terrain, culled against
// the lifted grid mesh as seen by the isometric camera
const upstream = {
  noise: { type: "simplex-noise" },
  grid: { type: "grid-sampler" },
  seeds: { type: "circle-pack" },
  trace: { type: "flow-tracer" },
  lift: { type: "surface-lift", params: { amplitude: 120, baseY: 6 } },
  normals: { type: "geometric-normal", params: { epsilon: 1, amplitude: 120 } },
  mesh: { type: "parametric-surface", params: { uSegments: 8, vSegments: 8 } },
  liftmesh: { type: "surface-lift", params: { amplitude: 120, baseY: 6 } },
};
const isometric = { type: "camera-3d", params: { eyeX: 1, eyeY: 1, eyeZ: 1, orthoSize: 0.93 } };
const upstreamWires = [
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
  w("lift.geometry", "normals.geometry"),
  w("noise.field", "normals.field"),
  w("$env.width", "mesh.width"),
  w("$env.height", "mesh.height"),
  w("mesh.geometry", "liftmesh.geometry"),
  w("noise.field", "liftmesh.field"),
  w("$env.width", "cam.width"),
  w("$env.height", "cam.height"),
  w("$env.height", "cam.sceneSize"),
];
const cullWires = [w("liftmesh.geometry", "cull.mesh"), w("cam.camera3d", "cull.camera3d")];

opGolden(visibilityCull, {
  "isometric camera": {
    nodes: { ...upstream, cam: isometric, cull: { type: "visibility-cull" } },
    wires: [...upstreamWires, w("normals.geometry", "cull.geometry"), ...cullWires],
  },
  bypass: {
    nodes: {
      ...upstream,
      cam: isometric,
      cull: { type: "visibility-cull", params: { bypass: 1 } },
    },
    wires: [...upstreamWires, w("normals.geometry", "cull.geometry"), ...cullWires],
  },
  "strokes without normals": {
    nodes: { ...upstream, cam: isometric, cull: { type: "visibility-cull" } },
    wires: [...upstreamWires, w("lift.geometry", "cull.geometry"), ...cullWires],
  },
  "default camera": {
    nodes: { ...upstream, cam: { type: "camera-3d" }, cull: { type: "visibility-cull" } },
    wires: [...upstreamWires, w("normals.geometry", "cull.geometry"), ...cullWires],
  },
});
