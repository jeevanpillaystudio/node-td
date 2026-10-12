import { describe, expect, it } from "bun:test";
import { type Camera2D, type NodeEnv, pathsGeometry } from "@node-td/kernel";
import { createRecordingCanvasFactory } from "@node-td/testing";
import { strokeRenderer } from "./stroke-renderer";

type Params = Parameters<typeof strokeRenderer.evaluate>[1];
const params = Object.fromEntries(strokeRenderer.params.map((p) => [p.key, p.default])) as Params;
const line = pathsGeometry([[[10, 10], [90, 90]]]);

function render(camera: Camera2D) {
  const recorder = createRecordingCanvasFactory();
  const env = {
    width: 0,
    height: 0,
    dpr: 1,
    seed: 0,
    rng: { random: () => 0 },
    createCanvas: recorder.createCanvas,
  } satisfies NodeEnv;
  const { buffer } = strokeRenderer.evaluate({ geometry: line, camera, palette: undefined }, params, env);
  return { buffer, log: recorder.log };
}
// The camera's transforms, after the dpr scale every render starts with
const transforms = (log: ReturnType<typeof render>["log"]) =>
  log.filter((e) => ["translate", "rotate", "scale"].includes(e[1])).map((e) => e.slice(1)).slice(1);
const camera = (center: [number, number], zoom = 1, rotation = 0): Camera2D => ({
  center,
  zoom,
  rotation,
  viewport: [100, 80],
});

describe("stroke-renderer camera", () => {
  it("applies no transform at the middle of the canvas, unzoomed and unrotated", () => {
    expect(transforms(render(camera([50, 40])).log)).toEqual([]);
  });

  // camera-2d's Center X/Y move the camera.center, which now pans
  it("pans: the camera's center lands at the middle of the canvas", () => {
    expect(transforms(render(camera([70, 30])).log)).toEqual([
      ["translate", 50, 40],
      ["translate", -70, -30],
    ]);
  });

  it("rotates and zooms about the camera's center", () => {
    expect(transforms(render(camera([70, 30], 2, 0.5)).log)).toEqual([
      ["translate", 50, 40],
      ["rotate", 0.5],
      ["scale", 2, 2],
      ["translate", -70, -30],
    ]);
  });
});

describe("stroke-renderer size", () => {
  it("returns an empty image for a canvas with no pixels, making no canvas", () => {
    for (const viewport of [[0, 80], [100, 0], [-5, 10]] as [number, number][]) {
      const { buffer, log } = render({ ...camera([0, 0]), viewport });
      expect(buffer.data.length).toBe(0);
      expect(buffer.width * buffer.height).toBe(0);
      expect(log).toEqual([]);
    }
  });
});
