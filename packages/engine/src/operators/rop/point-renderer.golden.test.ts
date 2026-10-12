import { opGolden, w } from "../../../test/support/op-golden";
import { pointRenderer } from "./point-renderer";

const SIZE = { width: 128, height: 128 };
const seeds = { type: "poisson-disc", params: { minRadius: 20, margin: 0 } };
const wires = [
  w("$env.width", "seeds.width"),
  w("$env.height", "seeds.height"),
  w("$env.width", "camera.width"),
  w("$env.height", "camera.height"),
  w("seeds.geometry", "render.geometry"),
  w("camera.camera", "render.camera"),
];

opGolden(pointRenderer, {
  default: {
    nodes: { seeds, camera: { type: "camera-2d" }, render: { type: "point-renderer" } },
    wires,
    ...SIZE,
  },
  // Colours cycle through the palette by vertex index
  "palette cycling": {
    nodes: {
      seeds,
      camera: { type: "camera-2d" },
      palette: { type: "oklab-palette" },
      render: { type: "point-renderer", params: { radius: 5, alpha: 1 } },
    },
    wires: [...wires, w("palette.palette", "render.palette")],
    ...SIZE,
  },
  "camera zoom 2, rotation 0.3": {
    nodes: {
      seeds,
      camera: { type: "camera-2d", params: { zoom: 2, rotation: 0.3 } },
      render: { type: "point-renderer" },
    },
    wires,
    ...SIZE,
  },
  "dpr 2": {
    nodes: { seeds, camera: { type: "camera-2d" }, render: { type: "point-renderer" } },
    wires,
    ...SIZE,
    dpr: 2,
  },
});
