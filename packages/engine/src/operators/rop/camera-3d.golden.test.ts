import { opGolden, w } from "../../../test/support/op-golden";
import { camera3d } from "./camera-3d";

const extent = [w("$env.width", "cam.width"), w("$env.height", "cam.height")];
const scene = [...extent, w("$env.height", "cam.sceneSize")];
const meridian = { eyeX: 0.281, eyeY: 1.172, eyeZ: -1.281, orthoSize: 1.367 };

opGolden(camera3d, {
  // No sceneSize: it falls back to min(width, height)
  "orthographic, defaults": { nodes: { cam: { type: "camera-3d" } }, wires: extent },
  "meridian, sceneSize = height": {
    nodes: { cam: { type: "camera-3d", params: meridian } },
    wires: scene,
  },
  "isometric (subscapes), sceneSize = height": {
    nodes: { cam: { type: "camera-3d", params: { eyeX: 1, eyeY: 1, eyeZ: 1, orthoSize: 0.93 } } },
    wires: scene,
  },
  "perspective, fov 45": {
    nodes: { cam: { type: "camera-3d", params: { projection: 1, fov: 45 } } },
    wires: scene,
  },
  "landscape, meridian": {
    nodes: { cam: { type: "camera-3d", params: meridian } },
    wires: scene,
    width: 640,
    height: 400,
  },
});
