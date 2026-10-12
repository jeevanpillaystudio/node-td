import { describe, expect, test } from "bun:test";
import { CookEngine, type Graph } from "@node-td/kernel";
import { createDefaultRegistry } from "@node-td/operators";
import { cookGraph, digest } from "@node-td/testing";
import { subscapesTerrain3dGraph } from "../src/index";

/**
 * One failing operator does not stop the branches that do not depend on
 * it. Subscapes cooked without createCanvas makes its three
 * stroke-renderers throw. In topological order they come before the 3D
 * branch's last nodes, so before per-node errors that branch never cooked.
 */

const SIZE = { width: 256, height: 256, dpr: 1 };
const SEED = 42;

/** Nodes that need no canvas and cook after the first renderer. */
const INDEPENDENT = ["normals", "cull", "proj", "shade"];

describe("a failing node does not stop independent branches", () => {
  test("subscapes without createCanvas: the 3D branch cooks, the renderers report errors", () => {
    const engine = new CookEngine(subscapesTerrain3dGraph, createDefaultRegistry());
    engine.cook({ ...SIZE, seed: SEED });
    const { errors } = engine.stats;

    const thrown = [...errors].flatMap(([key, failure]) =>
      failure.kind === "error" ? [[key, (failure.error as Error).message]] : [],
    );
    expect(thrown).toEqual([
      ["render-base", "stroke-renderer requires env.createCanvas"],
      ["render-cont", "stroke-renderer requires env.createCanvas"],
      ["render", "stroke-renderer requires env.createCanvas"],
    ]);
    // The composite reads all three, and is skipped
    expect(errors.get("comp")).toEqual({ kind: "skipped", cause: "render-base" });
    expect(engine.getOutput("comp")).toBeUndefined();
    expect(engine.stats.cooked).toBe(engine.stats.total - errors.size);

    // The independent nodes cook exactly as they do in a full cook
    const full = cookGraph(subscapesTerrain3dGraph, {
      ...SIZE,
      seed: SEED,
      registry: createDefaultRegistry(),
    });
    for (const key of INDEPENDENT) {
      const outputs = engine.getOutput(key);
      const expected = full.nodes[key];
      if (!outputs || !expected) throw new Error(`${key} did not cook`);
      const digests = Object.fromEntries(
        Object.entries(outputs).map(([port, value]) => [port, digest(value, SIZE)]),
      );
      expect(digests).toEqual(expected);
    }
  });

  test("the golden cook helper fails loudly instead, naming the node", () => {
    const registry = createDefaultRegistry().register({
      id: "throws",
      category: "top",
      label: "Throws",
      inputs: [],
      outputs: [{ name: "n", type: "number" }],
      params: [],
      evaluate: () => {
        throw new Error("boom");
      },
    });
    const graph: Graph = {
      id: "throws",
      name: "Throws",
      nodes: { bad: { type: "throws" } },
      wires: [],
    };
    expect(() => cookGraph(graph, { ...SIZE, seed: SEED, registry })).toThrow(
      'throws: the cook failed\nnode "bad": boom',
    );
  });
});
