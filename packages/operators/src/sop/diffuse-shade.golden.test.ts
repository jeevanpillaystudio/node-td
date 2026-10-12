import { opGolden, w } from "../../test/goldens";
import { diffuseShade } from "./diffuse-shade";

const upstream = {
  noise: { type: "simplex-noise" },
  mesh: { type: "parametric-surface", params: { uSegments: 8, vSegments: 8 } },
  lift: { type: "surface-lift" },
  normals: { type: "geometric-normal", params: { epsilon: 1 } },
};
const liftWires = [
  w("$env.width", "mesh.width"),
  w("$env.height", "mesh.height"),
  w("mesh.geometry", "lift.geometry"),
  w("noise.field", "lift.field"),
];
const upstreamWires = [
  ...liftWires,
  w("lift.geometry", "normals.geometry"),
  w("noise.field", "normals.field"),
];
const shaded = [...upstreamWires, w("normals.geometry", "shade.geometry")];
const withPalette = [...shaded, w("palette.palette", "shade.palette")];
// biome-ignore lint/suspicious/noApproximativeNumericConstant: the Subscapes patch's light, as written
const subscapes = { lightX: -0.5, lightY: -0.707, lightZ: -0.5, steps: 4, ambient: 0.7 };

opGolden(diffuseShade, {
  "no palette": { nodes: { ...upstream, shade: { type: "diffuse-shade" } }, wires: shaded },
  "one-colour palette (subscapes)": {
    nodes: {
      ...upstream,
      palette: {
        type: "oklab-palette",
        params: { count: 1, lightness: 0.2, chroma: 0, hueSpread: 0 },
      },
      shade: { type: "diffuse-shade", params: subscapes },
    },
    wires: withPalette,
  },
  "five-colour palette ramp": {
    nodes: { ...upstream, palette: { type: "oklab-palette" }, shade: { type: "diffuse-shade" } },
    wires: withPalette,
  },
  "steps 0": {
    nodes: { ...upstream, shade: { type: "diffuse-shade", params: { steps: 0 } } },
    wires: shaded,
  },
  // A zero light vector falls back to the default direction
  "zero light vector": {
    nodes: {
      ...upstream,
      shade: { type: "diffuse-shade", params: { lightX: 0, lightY: 0, lightZ: 0 } },
    },
    wires: shaded,
  },
  "geometry without normals": {
    nodes: {
      noise: upstream.noise,
      mesh: upstream.mesh,
      lift: upstream.lift,
      shade: { type: "diffuse-shade" },
    },
    wires: [...liftWires, w("lift.geometry", "shade.geometry")],
  },
});
