import { describe, expect, it } from "bun:test";
import type { Buffer2D, NodeEnv } from "@node-td/kernel";
import { createRecordingCanvasFactory } from "@node-td/testing";
import { composite } from "./composite";

const env = { width: 0, height: 0, dpr: 1, seed: 0, rng: { random: () => 0 } } satisfies NodeEnv;

/** A one-pixel layer of straight (not premultiplied) RGBA. */
const px = (r: number, g: number, b: number, a: number): Buffer2D => ({
  data: new Float32Array([r, g, b, a]),
  width: 1,
  height: 1,
  channels: 4,
});
const blend = (mode: number, bottom: Buffer2D, top: Buffer2D) => [
  ...composite.evaluate({ layers: [bottom, top] }, { mode }, env).buffer.data,
];
const OVER = 0;
const ADD = 1;
const MULTIPLY = 2;
const SCREEN = 3;

// The CPU path, against the canvas's compositing formulas worked by hand
describe("composite, CPU path", () => {
  it("lays a transparent layer over anything without a trace", () => {
    for (const mode of [OVER, ADD, MULTIPLY, SCREEN]) {
      expect(blend(mode, px(0, 0, 1, 1), px(1, 1, 1, 0))).toEqual([0, 0, 1, 1]);
    }
  });

  it("over a transparent backdrop, every mode gives the layer itself", () => {
    for (const mode of [OVER, ADD, MULTIPLY, SCREEN]) {
      const out = blend(mode, px(1, 0, 0, 0), px(0.5, 0.25, 1, 0.5));
      expect(out[0]).toBeCloseTo(0.5, 6);
      expect(out[1]).toBeCloseTo(0.25, 6);
      expect(out[2]).toBeCloseTo(1, 6);
      expect(out[3]).toBeCloseTo(0.5, 6);
    }
  });

  it("weights each mode by a semi-transparent layer's alpha", () => {
    const backdrop = px(1, 1, 0, 1);
    const half = px(0.5, 0.5, 0.5, 0.5);
    const cases: [number, number[]][] = [
      [OVER, [0.75, 0.75, 0.25, 1]],
      [ADD, [1, 1, 0.25, 1]],
      [MULTIPLY, [0.75, 0.75, 0, 1]],
      [SCREEN, [1, 1, 0.25, 1]],
    ];
    for (const [mode, want] of cases) {
      const out = blend(mode, backdrop, half);
      for (const [c, v] of want.entries()) expect(out[c]).toBeCloseTo(v, 6);
    }
  });

  it("adds premultiplied colour, so two half-alpha layers make one opaque", () => {
    const out = blend(ADD, px(0, 0, 1, 0.5), px(1, 0, 0, 0.5));
    for (const [c, v] of [0.5, 0, 0.5, 1].entries()) expect(out[c]).toBeCloseTo(v, 6);
  });
});

// The canvas path hands each mode to the canvas's own compositing
describe("composite, canvas path", () => {
  it("draws each layer with the mode's globalCompositeOperation", () => {
    const ops = ["source-over", "lighter", "multiply", "screen"];
    for (const [mode, op] of ops.entries()) {
      const recorder = createRecordingCanvasFactory();
      const layer = (a: number): Buffer2D => ({
        ...px(1, 0, 0, a),
        _canvas: recorder.createCanvas(1, 1),
      });
      const layers = [layer(1), layer(0), layer(0.5)];
      for (const l of layers) (l._canvas as unknown as { getContext(k: string): unknown }).getContext("2d");
      composite.evaluate({ layers }, { mode }, { ...env, createCanvas: recorder.createCanvas });
      const calls = recorder.log.filter((e) => e[0] === 3).map((e) => e.slice(1));
      expect(calls).toEqual([
        ["create", 1, 1],
        ["drawImage", 0, 0, 0],
        ["globalCompositeOperation", op],
        ["drawImage", 1, 0, 0],
        ["globalCompositeOperation", op],
        ["drawImage", 2, 0, 0],
      ]);
    }
  });
});
