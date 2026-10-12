import { opGolden, w } from "../../../test/support/op-golden";
import { pointOrient } from "./point-orient";

const angle = { type: "simplex-noise", params: { noiseScale: 0.03 } };
const custom = {
  type: "point-orient",
  params: { baseAngle: 0.5, angleScale: 1, baseLength: 20, lengthScale: 0.5, noiseScale: 0.05 },
};
const plainWires = [
  w("$env.width", "seeds.width"),
  w("$env.height", "seeds.height"),
  w("seeds.geometry", "orient.geometry"),
  w("angle.field", "orient.field"),
];

opGolden(pointOrient, {
  // Raymarch hits carry worldX/worldZ, depth and ao
  "raymarch hits": {
    nodes: {
      terrain: { type: "simplex-noise", params: { noiseScale: 0.018 } },
      angle,
      cam: {
        type: "camera-3d",
        params: { eyeX: 0.281, eyeY: 1.172, eyeZ: -1.281, orthoSize: 1.367 },
      },
      seeds: { type: "poisson-disc", params: { minRadius: 20, margin: 0 } },
      march: { type: "surface-raymarch", params: { aoRadius: 12 } },
      orient: { type: "point-orient" },
    },
    wires: [
      w("$env.width", "cam.width"),
      w("$env.height", "cam.height"),
      w("$env.height", "cam.sceneSize"),
      w("$env.width", "seeds.width"),
      w("$env.height", "seeds.height"),
      w("seeds.geometry", "march.seeds"),
      w("cam.camera3d", "march.camera3d"),
      w("terrain.field", "march.field"),
      w("march.geometry", "orient.geometry"),
      w("angle.field", "orient.field"),
    ],
  },
  "plain points": {
    nodes: { seeds: { type: "circle-pack" }, angle, orient: { type: "point-orient" } },
    wires: plainWires,
  },
  "plain points, custom params": {
    nodes: { seeds: { type: "circle-pack" }, angle, orient: custom },
    wires: plainWires,
  },
});
