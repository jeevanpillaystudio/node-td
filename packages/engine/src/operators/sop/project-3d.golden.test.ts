import { opGolden, w } from "../../../test/support/op-golden";
import { project3d } from "./project-3d";

const noise = { type: "simplex-noise" };
const meshNodes = {
  noise,
  mesh: { type: "parametric-surface", params: { uSegments: 8, vSegments: 8 } },
  lift: { type: "surface-lift" },
  proj: { type: "project-3d" },
};
const meshWires = [
  w("$env.width", "mesh.width"),
  w("$env.height", "mesh.height"),
  w("mesh.geometry", "lift.geometry"),
  w("noise.field", "lift.field"),
  w("$env.width", "cam.width"),
  w("$env.height", "cam.height"),
  w("lift.geometry", "proj.geometry"),
  w("cam.camera3d", "proj.camera3d"),
];

opGolden(project3d, {
  "grid mesh, orthographic": {
    nodes: { ...meshNodes, cam: { type: "camera-3d" } },
    wires: meshWires,
  },
  "grid mesh, perspective": {
    nodes: { ...meshNodes, cam: { type: "camera-3d", params: { projection: 1 } } },
    wires: meshWires,
  },
  "strips, isometric camera": {
    nodes: {
      noise,
      grid: { type: "grid-sampler" },
      seeds: { type: "circle-pack" },
      trace: { type: "flow-tracer" },
      lift: { type: "surface-lift" },
      cam: { type: "camera-3d", params: { eyeX: 1, eyeY: 1, eyeZ: 1, orthoSize: 0.93 } },
      proj: { type: "project-3d" },
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
      w("$env.width", "cam.width"),
      w("$env.height", "cam.height"),
      w("$env.height", "cam.sceneSize"),
      w("lift.geometry", "proj.geometry"),
      w("cam.camera3d", "proj.camera3d"),
    ],
  },
});
