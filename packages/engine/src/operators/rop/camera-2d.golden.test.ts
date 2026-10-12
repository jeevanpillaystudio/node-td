import { opGolden, w } from "../../../test/goldens";
import { camera2d } from "./camera-2d";

const extent = [w("$env.width", "camera.width"), w("$env.height", "camera.height")];

opGolden(camera2d, {
  default: { nodes: { camera: { type: "camera-2d" } }, wires: extent },
  "centre offset, zoom 2, rotation 0.3": {
    nodes: {
      camera: { type: "camera-2d", params: { centerX: 10, centerY: -20, zoom: 2, rotation: 0.3 } },
    },
    wires: extent,
  },
  landscape: { nodes: { camera: { type: "camera-2d" } }, wires: extent, width: 640, height: 400 },
});
