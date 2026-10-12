import { expect, test } from "bun:test";
import { GraphValidationError, lintParams, validateGraph } from "@node-td/kernel";
import { createDefaultRegistry } from "@node-td/operators";
import * as exported from "../src/index";
import { patches } from "../src/index";

test("each registry entry takes its id and name from its graph", () => {
  for (const patch of patches) {
    expect(patch.id).toBe(patch.graph.id);
    expect(patch.name).toBe(patch.graph.name);
  }
  expect(new Set(patches.map((p) => p.id)).size).toBe(patches.length);
});

test("the registry lists every exported graph", () => {
  const graphs = new Set<unknown>(
    Object.entries(exported)
      .filter(([name]) => name.endsWith("Graph"))
      .map(([, graph]) => graph),
  );
  expect(graphs.size).toBeGreaterThan(0);
  expect(new Set<unknown>(patches.map((p) => p.graph))).toEqual(graphs);
});

test("every patch validates against the default operators, port types and params included", () => {
  const registry = createDefaultRegistry();
  const issues = patches.flatMap((patch) => {
    try {
      validateGraph(patch.graph, registry);
      return [];
    } catch (err) {
      if (!(err instanceof GraphValidationError)) throw err;
      return err.issues.map((issue) => `${patch.id}: ${issue}`);
    }
  });
  expect(issues).toEqual([]);
});

test("every patch's params are declared by its operators and legal for them", () => {
  const registry = createDefaultRegistry();
  const issues = patches.flatMap((patch) =>
    lintParams(patch.graph, registry).map((issue) => `${patch.id}: ${issue}`),
  );
  expect(issues).toEqual([]);
});
