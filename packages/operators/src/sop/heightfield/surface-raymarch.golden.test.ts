import { opGolden, w } from "../../../test/goldens";
import { surfaceRaymarch } from "./surface-raymarch";

// Meridian's camera and seeds over a plain simplex terrain
const upstream = {
  noise: { type: "simplex-noise", params: { noiseScale: 0.018 } },
  cam: {
    type: "camera-3d",
    params: { eyeX: 0.281, eyeY: 1.172, eyeZ: -1.281, orthoSize: 1.367 },
  },
  seeds: { type: "poisson-disc", params: { minRadius: 20, margin: 0 } },
};
const wires = [
  w("$env.width", "cam.width"),
  w("$env.height", "cam.height"),
  w("$env.height", "cam.sceneSize"),
  w("$env.width", "seeds.width"),
  w("$env.height", "seeds.height"),
  w("seeds.geometry", "march.seeds"),
  w("cam.camera3d", "march.camera3d"),
  w("noise.field", "march.field"),
];
const meridian = { aoRadius: 12 };

opGolden(surfaceRaymarch, {
  "meridian params": {
    nodes: { ...upstream, march: { type: "surface-raymarch", params: meridian } },
    wires,
  },
  "aoSteps 0": {
    nodes: {
      ...upstream,
      march: { type: "surface-raymarch", params: { ...meridian, aoSteps: 0 } },
    },
    wires,
  },
  "meridian params, 400 × 400": {
    nodes: { ...upstream, march: { type: "surface-raymarch", params: meridian } },
    wires,
    width: 400,
    height: 400,
  },
  // Rays start further from the terrain than maxDist: the march goes on
  "meridian params, 800 × 800": {
    nodes: { ...upstream, march: { type: "surface-raymarch", params: meridian } },
    wires,
    width: 800,
    height: 800,
  },
  // Seeds tagged with their partition's cellId: the hits keep it
  "seeds with attributes": {
    nodes: {
      ...upstream,
      cells: { type: "binary-subdivide" },
      march: { type: "surface-raymarch", params: meridian },
    },
    wires: [
      ...wires,
      w("$env.width", "cells.width"),
      w("$env.height", "cells.height"),
      w("cells.geometry", "seeds.partitions"),
    ],
  },
  // The camera looks up, away from the terrain: the no-hit branch
  "camera looking up, no hits": {
    nodes: {
      ...upstream,
      cam: { type: "camera-3d", params: { ...upstream.cam.params, targetY: 2 } },
      march: { type: "surface-raymarch", params: { maxSteps: 50, maxDist: 50 } },
    },
    wires,
  },
});
