import { describe, it, expect } from "bun:test";
import { meridianGraph } from "./meridian";
import { CookEngine } from "@node-td/kernel";
import { createDefaultRegistry } from "@node-td/operators";
import { createRecordingCanvasFactory } from "@node-td/testing";

describe("meridian patch", () => {
  it("cooks without errors and produces a rendered buffer", () => {
    const registry = createDefaultRegistry();
    const env = {
      width: 256,
      height: 256,
      dpr: 1,
      seed: 42,
      createCanvas: createRecordingCanvasFactory().createCanvas,
    };

    const engine = new CookEngine(meridianGraph, registry);
    const outputs = engine.cook(env);

    // Check rendered buffer exists
    const renderOut = outputs.get("render") as Record<string, unknown>;
    expect(renderOut).toBeDefined();
    const buf = renderOut?.buffer as { width: number; height: number; channels: number } | undefined;
    expect(buf).toBeDefined();
    expect(buf?.width).toBe(256);
    expect(buf?.height).toBe(256);
    expect(buf?.channels).toBe(4);
  });

  it("surface-raymarch produces hit geometry with all expected attributes", () => {
    const registry = createDefaultRegistry();
    const env = {
      width: 256,
      height: 256,
      dpr: 1,
      seed: 12345,
      createCanvas: createRecordingCanvasFactory().createCanvas,
    };

    const engine = new CookEngine(meridianGraph, registry);
    const outputs = engine.cook(env);

    const raymarchOut = outputs.get("raymarch") as Record<string, unknown>;
    const geo = raymarchOut?.geometry as {
      vertexCount: number;
      topology: string;
      attributes?: Record<string, Float32Array>;
    };

    expect(geo).toBeDefined();
    expect(geo.topology).toBe("points");
    // Should have at least some hits in a 256×256 canvas
    expect(geo.vertexCount).toBeGreaterThan(0);

    const attrs = geo.attributes!;
    expect(attrs).toBeDefined();
    expect(attrs.depth).toHaveLength(geo.vertexCount);
    expect(attrs.ao).toHaveLength(geo.vertexCount);
    expect(attrs.worldX).toHaveLength(geo.vertexCount);
    expect(attrs.worldZ).toHaveLength(geo.vertexCount);
    expect(attrs.normalX).toHaveLength(geo.vertexCount);

    // Depth values should be normalized 0..1
    for (let i = 0; i < geo.vertexCount; i++) {
      expect(attrs.depth![i]).toBeGreaterThanOrEqual(0);
      expect(attrs.depth![i]).toBeLessThanOrEqual(1);
    }
  });

  it("point-orient adds angle and length attributes", () => {
    const registry = createDefaultRegistry();
    const env = {
      width: 256,
      height: 256,
      dpr: 1,
      seed: 99,
      createCanvas: createRecordingCanvasFactory().createCanvas,
    };

    const engine = new CookEngine(meridianGraph, registry);
    const outputs = engine.cook(env);

    const orientOut = outputs.get("orient") as Record<string, unknown>;
    const geo = orientOut?.geometry as {
      vertexCount: number;
      attributes?: Record<string, Float32Array>;
    };

    expect(geo).toBeDefined();
    const attrs = geo.attributes!;
    expect(attrs.angle).toBeDefined();
    expect(attrs.length).toBeDefined();
    expect(attrs.angle).toHaveLength(geo.vertexCount);
    expect(attrs.length).toHaveLength(geo.vertexCount);

    // Lengths should be positive
    for (let i = 0; i < geo.vertexCount; i++) {
      expect(attrs.length![i]).toBeGreaterThan(0);
    }
  });
});
