import { expect, test } from "bun:test";
import type { Graph } from "@node-td/kernel";
import { createDefaultRegistry } from "@node-td/operators";
import { cookedFields, cookGraph, fieldGlslIssues } from "@node-td/testing";
import { patches } from "../src/index";

/**
 * compileField has no runtime caller until the deferred GPU rasterizer.
 * This keeps it able to compile each gallery patch's field chain: every
 * FieldExpr the patch's field outputs carry after a full cook. Fields
 * that are plain closures (fbm with a domain rotation) carry none.
 */

const GALLERY: readonly Graph[] = patches.map((p) => p.graph);

const SIZE = { width: 256, height: 256, dpr: 1 };
const SEED = 42;

for (const graph of GALLERY) {
  test(`${graph.id}: every field the cook carries compiles to GLSL`, () => {
    const { cooked } = cookGraph(graph, { ...SIZE, seed: SEED, registry: createDefaultRegistry() });
    const fields = cookedFields(cooked);
    expect(fields.length).toBeGreaterThan(0);
    expect(fieldGlslIssues(fields)).toEqual([]);
  });
}
