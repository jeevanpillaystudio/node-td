import { expect, test } from "bun:test";
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
