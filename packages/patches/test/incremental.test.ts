import { describe, expect, test } from "bun:test";
import {
  collectParams,
  CookEngine,
  type EnvValues,
  type Graph,
  isEnumParam,
  isEnvSource,
  type ParamDef,
  SeededRNG,
} from "@node-td/kernel";
import { createDefaultRegistry } from "@node-td/operators";
import { createRecordingCanvasFactory, type Digest, digest } from "@node-td/testing";
import { patches } from "../src/index";

/**
 * An incremental cook gives every node exactly what a full cook with the
 * same params and env gives it, so a host may keep its engine between
 * draws. The random stream is the hard part: every random operator draws
 * from one stream in topological order, and the engine replays it around
 * the nodes it does not re-cook.
 */

const GALLERY: readonly Graph[] = patches.map((p) => p.graph);

const ENV: EnvValues = { width: 256, height: 256, dpr: 1, seed: 42 };
const EDITS = 20;
const TIMEOUT_MS = 60_000;

/** The operators that draw from the random stream. */
const RANDOM_OPS = new Set(["poisson-disc", "circle-pack", "dash-stroke", "binary-subdivide"]);
/** The operators that read env.dpr. */
const DPR_OPS = new Set(["stroke-renderer", "field-render"]);

function newEngine(graph: Graph): CookEngine {
  return new CookEngine(graph, createDefaultRegistry());
}

/** Cook with recording canvases, the way the golden helpers do. */
function cook(engine: CookEngine, env: EnvValues): ReadonlyMap<string, Record<string, unknown>> {
  return engine.cook({ ...env, createCanvas: createRecordingCanvasFactory().createCanvas });
}

/** Node key → output port → digest, for every node with an output. */
function digests(
  cache: ReadonlyMap<string, Record<string, unknown>>,
  env: EnvValues,
): Record<string, Record<string, Digest>> {
  const extent = { width: env.width, height: env.height };
  const out: Record<string, Record<string, Digest>> = {};
  for (const [key, outputs] of cache) {
    const ports: Record<string, Digest> = {};
    for (const [port, value] of Object.entries(outputs)) ports[port] = digest(value, extent);
    out[key] = ports;
  }
  return out;
}

/** What a fresh engine's full cook gives every node, and which nodes failed. */
function fullCook(graph: Graph, params: Record<string, number>, env: EnvValues) {
  const engine = newEngine(graph);
  engine.setParams(params);
  const nodes = digests(cook(engine, env), env);
  return { nodes, errors: [...engine.stats.errors.keys()] };
}

/** One random in-range value for a param, on its step grid. */
function randomValue(def: ParamDef, pick: SeededRNG): number {
  if (isEnumParam(def)) {
    return def.options[Math.floor(pick.random() * def.options.length)]!.value;
  }
  const steps = Math.round((def.max - def.min) / def.step);
  const k = Math.floor(pick.random() * (steps + 1));
  return Math.min(def.max, Number((def.min + k * def.step).toFixed(6)));
}

/** The given nodes and every node downstream of them, in the graph's key order. */
function withDescendants(graph: Graph, start: Iterable<string>): string[] {
  const reached = new Set(start);
  const queue = [...reached];
  while (queue.length) {
    const key = queue.pop()!;
    for (const w of graph.wires) {
      if (isEnvSource(w.from) || w.from !== key || reached.has(w.to)) continue;
      reached.add(w.to);
      queue.push(w.to);
    }
  }
  return Object.keys(graph.nodes).filter((key) => reached.has(key));
}

function nodesOfType(graph: Graph, types: Set<string>): string[] {
  return Object.entries(graph.nodes)
    .filter(([, node]) => types.has(node.type))
    .map(([key]) => key);
}

/** The keys of the nodes the last cook evaluated, in the graph's key order. */
function cookedKeys(graph: Graph, engine: CookEngine): string[] {
  const timing = engine.stats.timing;
  return Object.keys(graph.nodes).filter((key) => timing.has(key));
}

describe("incremental cook equals full cook", () => {
  for (const graph of GALLERY) {
    test(
      `${graph.id}: ${EDITS} random param edits`,
      () => {
        const defs = collectParams(graph, createDefaultRegistry());
        // The edits are random but fixed: the picker has its own seed
        const pick = new SeededRNG(`edits ${graph.id}`);
        const engine = newEngine(graph);
        const params: Record<string, number> = {};
        let cache = cook(engine, ENV);

        for (let i = 0; i < EDITS; i++) {
          const def = defs[Math.floor(pick.random() * defs.length)]!;
          params[def.key] = randomValue(def, pick);
          engine.setParams(params);
          cache = cook(engine, ENV);
        }

        const incremental = { nodes: digests(cache, ENV), errors: [...engine.stats.errors.keys()] };
        expect(incremental).toEqual(fullCook(graph, params, ENV));
      },
      TIMEOUT_MS,
    );
  }
});

describe("a seed change", () => {
  for (const graph of GALLERY) {
    test(
      `${graph.id}: re-cooks exactly the random operators and their descendants`,
      () => {
        const engine = newEngine(graph);
        cook(engine, ENV);
        const next = { ...ENV, seed: 7 };
        const cache = cook(engine, next);

        const expected = withDescendants(graph, nodesOfType(graph, RANDOM_OPS));
        expect(cookedKeys(graph, engine)).toEqual(expected);
        expect(digests(cache, next)).toEqual(fullCook(graph, {}, next).nodes);
      },
      TIMEOUT_MS,
    );
  }

  test("changes the output of every patch that draws", () => {
    for (const graph of GALLERY) {
      if (nodesOfType(graph, RANDOM_OPS).length === 0) continue;
      const a = fullCook(graph, {}, ENV).nodes;
      const b = fullCook(graph, {}, { ...ENV, seed: 7 }).nodes;
      expect(b).not.toEqual(a);
    }
  });
});

describe("a dpr change", () => {
  for (const graph of GALLERY) {
    test(
      `${graph.id}: re-cooks exactly stroke-renderer, field-render and their descendants`,
      () => {
        const engine = newEngine(graph);
        cook(engine, ENV);
        const next = { ...ENV, dpr: 2 };
        const cache = cook(engine, next);

        const readers = nodesOfType(graph, DPR_OPS);
        expect(readers.length).toBeGreaterThan(0);
        expect(cookedKeys(graph, engine)).toEqual(withDescendants(graph, readers));
        expect(digests(cache, next)).toEqual(fullCook(graph, {}, next).nodes);
      },
      TIMEOUT_MS,
    );
  }
});
