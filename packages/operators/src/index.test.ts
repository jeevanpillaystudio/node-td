import { expect, test } from "bun:test";
import { allOperators, createDefaultRegistry, defaultRegistry } from "./index";

test("defaultRegistry() is one shared registry of every operator", () => {
  const registry = defaultRegistry();
  expect(defaultRegistry()).toBe(registry);
  expect(createDefaultRegistry()).not.toBe(registry);
  expect(registry.list().map((op) => op.id)).toEqual(allOperators.map((op) => op.id));
});
