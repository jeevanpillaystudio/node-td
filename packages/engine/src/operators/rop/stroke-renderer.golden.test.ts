import {
  type FixtureGraph,
  type NodeInstance,
  type OpFixture,
  opGolden,
  w,
} from "../../../test/goldens";
import { strokeRenderer } from "./stroke-renderer";

const SIZE = { width: 128, height: 128 };

/** A renderer fed by `geometry` (and optionally `palette`), viewed through a camera-2d. */
function fixture(
  render: NodeInstance,
  upstream: FixtureGraph,
  extra: Partial<OpFixture> = {},
): OpFixture {
  return {
    nodes: { ...upstream.nodes, camera: { type: "camera-2d" }, render },
    wires: [
      ...upstream.wires,
      w("$env.width", "camera.width"),
      w("$env.height", "camera.height"),
      w("camera.camera", "render.camera"),
    ],
    ...SIZE,
    ...extra,
  };
}

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
const strips = {
  nodes: traceNodes,
  wires: [...traceWires, w("trace.geometry", "render.geometry")],
};
const points = {
  nodes: { seeds: { type: "circle-pack" } },
  wires: [
    w("$env.width", "seeds.width"),
    w("$env.height", "seeds.height"),
    w("seeds.geometry", "render.geometry"),
  ],
};
const triangles = {
  nodes: { mesh: { type: "parametric-surface", params: { uSegments: 4, vSegments: 4 } } },
  wires: [
    w("$env.width", "mesh.width"),
    w("$env.height", "mesh.height"),
    w("mesh.geometry", "render.geometry"),
  ],
};
const implicitStrip = {
  nodes: { polyline: { type: "fixture-polyline" } },
  wires: [
    w("$env.width", "polyline.width"),
    w("$env.height", "polyline.height"),
    w("polyline.geometry", "render.geometry"),
  ],
};
const withPalette = (upstream: FixtureGraph, palette: NodeInstance) => ({
  nodes: { ...upstream.nodes, palette },
  wires: [...upstream.wires, w("palette.palette", "render.palette")],
});
const grey = {
  type: "oklab-palette",
  params: { count: 1, lightness: 0.2, chroma: 0, hueSpread: 0 },
};

// One shade per strip vertex: the per-strip colour path
const shadedStrips = {
  nodes: {
    ...traceNodes,
    lift: { type: "surface-lift" },
    normals: { type: "geometric-normal", params: { epsilon: 1 } },
    shade: { type: "diffuse-shade" },
  },
  wires: [
    ...traceWires,
    w("trace.geometry", "lift.geometry"),
    w("noise.field", "lift.field"),
    w("lift.geometry", "normals.geometry"),
    w("noise.field", "normals.field"),
    w("normals.geometry", "shade.geometry"),
    w("trace.geometry", "render.geometry"),
    w("shade.palette", "render.palette"),
  ],
};

// Meridian's chain: raymarch hits oriented by a second noise field
const orientedNodes = {
  terrain: { type: "simplex-noise", params: { noiseScale: 0.018 } },
  angle: { type: "simplex-noise", params: { noiseScale: 0.03 } },
  cam3d: {
    type: "camera-3d",
    params: { eyeX: 0.281, eyeY: 1.172, eyeZ: -1.281, orthoSize: 1.367 },
  },
  seeds: { type: "poisson-disc", params: { minRadius: 20, margin: 0 } },
  march: { type: "surface-raymarch", params: { aoRadius: 12 } },
  orient: { type: "point-orient" },
};
const orientedWires = [
  w("$env.width", "cam3d.width"),
  w("$env.height", "cam3d.height"),
  w("$env.height", "cam3d.sceneSize"),
  w("$env.width", "seeds.width"),
  w("$env.height", "seeds.height"),
  w("seeds.geometry", "march.seeds"),
  w("cam3d.camera3d", "march.camera3d"),
  w("terrain.field", "march.field"),
  w("march.geometry", "orient.geometry"),
  w("angle.field", "orient.field"),
  w("orient.geometry", "render.geometry"),
];
const oriented = { nodes: orientedNodes, wires: orientedWires };

const stroke = { type: "stroke-renderer" };
const fill = {
  type: "stroke-renderer",
  params: { renderMode: 1, fillR: 249, fillG: 249, fillB: 249 },
};
const dash = {
  type: "stroke-renderer",
  params: { renderMode: 2, lineWidth: 1, bgR: 12, bgG: 14, bgB: 18 },
};

opGolden(strokeRenderer, {
  "Stroke, line strips": fixture(stroke, strips),
  "Stroke, points": fixture(stroke, points),
  "Stroke, triangles": fixture(stroke, triangles),
  "Stroke, implicit strip": fixture(stroke, implicitStrip),
  "Stroke, uniform palette colour": fixture(stroke, withPalette(strips, { type: "oklab-palette" })),
  "Stroke, per-strip palette colours": fixture(stroke, shadedStrips),
  "Fill, line strips": fixture(fill, strips),
  "Fill, triangles": fixture(fill, triangles),
  "Fill, implicit strip": fixture(fill, implicitStrip),
  "Fill, palette colour": fixture(fill, withPalette(strips, grey)),
  "Oriented Dash, depth-indexed palette": fixture(
    dash,
    withPalette(oriented, { type: "oklab-palette" }),
  ),
  "Oriented Dash, per-vertex palette": fixture(dash, {
    nodes: { ...orientedNodes, shade: { type: "diffuse-shade" } },
    wires: [
      ...orientedWires,
      w("orient.geometry", "shade.geometry"),
      w("shade.palette", "render.palette"),
    ],
  }),
  "Oriented Dash, no palette": fixture(dash, oriented),
  "Oriented Dash, points without attributes": fixture(dash, points),
  // Oriented Dash only applies to points; strips fall through to Stroke
  "Oriented Dash, line strips": fixture(dash, strips),
  "camera zoom 2, rotation 0.3": {
    ...fixture(stroke, strips),
    nodes: {
      ...traceNodes,
      camera: { type: "camera-2d", params: { zoom: 2, rotation: 0.3 } },
      render: stroke,
    },
  },
  "transparent background": fixture({ type: "stroke-renderer", params: { bgAlpha: 0 } }, strips),
  "translucent background": fixture({ type: "stroke-renderer", params: { bgAlpha: 0.5 } }, strips),
  "dpr 2": fixture(stroke, strips, { dpr: 2 }),
});
