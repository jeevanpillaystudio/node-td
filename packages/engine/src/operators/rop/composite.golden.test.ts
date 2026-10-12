import { type OpFixture, opGolden, w } from "../../../test/support/op-golden";
import { composite } from "./composite";

const MODES: [string, number][] = [
  ["Over", 0],
  ["Add", 1],
  ["Multiply", 2],
  ["Screen", 3],
];

// Canvas path: every layer is a stroke-renderer output, which carries a canvas
const canvasLayers = {
  nodes: {
    seeds: { type: "circle-pack", params: { minRadius: 20, margin: 0 } },
    mesh: { type: "parametric-surface", params: { uSegments: 4, vSegments: 4 } },
    camera: { type: "camera-2d" },
    base: {
      type: "stroke-renderer",
      params: { renderMode: 1, fillR: 249, fillG: 249, fillB: 249 },
    },
    overlay: { type: "stroke-renderer", params: { bgAlpha: 0 } },
  },
  wires: [
    w("$env.width", "seeds.width"),
    w("$env.height", "seeds.height"),
    w("$env.width", "mesh.width"),
    w("$env.height", "mesh.height"),
    w("$env.width", "camera.width"),
    w("$env.height", "camera.height"),
    w("mesh.geometry", "base.geometry"),
    w("camera.camera", "base.camera"),
    w("seeds.geometry", "overlay.geometry"),
    w("camera.camera", "overlay.camera"),
    w("base.buffer", "comp.layers"),
    w("overlay.buffer", "comp.layers"),
  ],
  width: 128,
  height: 128,
};

// CPU path: fixture images carry no canvas
const cpuLayers = {
  nodes: {
    base: { type: "fixture-image" },
    overlay: { type: "fixture-image", params: { pattern: 1 } },
  },
  wires: [
    w("$env.width", "base.width"),
    w("$env.height", "base.height"),
    w("$env.width", "overlay.width"),
    w("$env.height", "overlay.height"),
    w("base.buffer", "comp.layers"),
    w("overlay.buffer", "comp.layers"),
  ],
  width: 32,
  height: 32,
};

const fixtures: Record<string, OpFixture> = {};
for (const [name, mode] of MODES) {
  const comp = { type: "composite", params: { mode } };
  fixtures[`${name}, canvas layers`] = { ...canvasLayers, nodes: { ...canvasLayers.nodes, comp } };
  fixtures[`${name}, CPU layers`] = { ...cpuLayers, nodes: { ...cpuLayers.nodes, comp } };
}

fixtures["Over, three canvas layers"] = {
  ...canvasLayers,
  nodes: {
    ...canvasLayers.nodes,
    top: { type: "stroke-renderer", params: { bgAlpha: 0, lineWidth: 4 } },
    comp: { type: "composite" },
  },
  wires: [
    ...canvasLayers.wires,
    w("seeds.geometry", "top.geometry"),
    w("camera.camera", "top.camera"),
    w("top.buffer", "comp.layers"),
  ],
};

// One layer without a canvas sends every layer down the CPU path
fixtures["Over, canvas layer under a CPU layer"] = {
  nodes: {
    mesh: canvasLayers.nodes.mesh,
    camera: canvasLayers.nodes.camera,
    base: canvasLayers.nodes.base,
    overlay: { type: "fixture-image", params: { pattern: 1 } },
    comp: { type: "composite" },
  },
  wires: [
    w("$env.width", "mesh.width"),
    w("$env.height", "mesh.height"),
    w("$env.width", "camera.width"),
    w("$env.height", "camera.height"),
    w("mesh.geometry", "base.geometry"),
    w("camera.camera", "base.camera"),
    w("$env.width", "overlay.width"),
    w("$env.height", "overlay.height"),
    w("base.buffer", "comp.layers"),
    w("overlay.buffer", "comp.layers"),
  ],
  width: 32,
  height: 32,
};

fixtures["single layer passes through"] = {
  nodes: { base: { type: "fixture-image" }, comp: { type: "composite" } },
  wires: [
    w("$env.width", "base.width"),
    w("$env.height", "base.height"),
    w("base.buffer", "comp.layers"),
  ],
  width: 32,
  height: 32,
};

opGolden(composite, fixtures);
