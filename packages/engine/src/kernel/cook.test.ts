import { describe, expect, test } from "bun:test";
import { CookEngine } from "./cook";
import type { Graph, Wire } from "./graph";
import { OperatorRegistry } from "./registry";
import { SeededRNG } from "./rng";
import type { GraphEnv, Operator } from "./types";

// ─── Fake operators ──────────────────────────────────────────────
//
// Kernel tests use their own operators, so they pin the kernel alone
// and never depend on the real operator library. Every output is a
// fresh object, so `toBe` tells a cached output from a re-cooked one.

/** Emits its param `k`. */
const source: Operator = {
  id: "source",
  category: "top",
  label: "Source",
  inputs: [],
  outputs: [{ name: "n", type: "number" }],
  params: [{ key: "k", label: "K", min: 0, max: 10, step: 1, default: 1 }],
  evaluate: (_inputs, params) => ({ n: params.k }),
};

/** Emits its input plus its param `k`. */
const pass: Operator = {
  id: "pass",
  category: "top",
  label: "Pass",
  inputs: [{ name: "n", type: "number" }],
  outputs: [{ name: "n", type: "number" }],
  params: [{ key: "k", label: "K", min: 0, max: 10, step: 1, default: 0 }],
  evaluate: ({ n }, params) => ({ n: n + params.k }),
};

/** Emits the params record it was handed. */
const echoParams: Operator = {
  id: "echo-params",
  category: "top",
  label: "Echo Params",
  inputs: [],
  outputs: [{ name: "params", type: "number" }],
  params: [
    { key: "p", label: "P", min: 0, max: 1000, step: 1, default: 1 },
    { key: "q", label: "Q", min: 0, max: 1000, step: 1, default: 2 },
    { key: "r", label: "R", min: 0, max: 1000, step: 1, default: 3 },
  ],
  evaluate: (_inputs, params) => ({ params: { ...params } }),
};

/** Emits its inputs as received. */
const collect: Operator = {
  id: "collect",
  category: "top",
  label: "Collect",
  inputs: [
    { name: "items", type: "number", variadic: true },
    { name: "single", type: "number", optional: true },
  ],
  outputs: [
    { name: "items", type: "number" },
    { name: "single", type: "number" },
  ],
  params: [],
  evaluate: (inputs) => ({ items: inputs.items, single: inputs.single }),
};

/** Emits env.dpr, read straight from the env. Declares the env keys it reads. */
const dprReader = {
  id: "dpr-reader",
  category: "top",
  label: "DPR Reader",
  inputs: [],
  outputs: [{ name: "dpr", type: "number" }],
  params: [],
  envReads: ["dpr"],
  evaluate: (_inputs: unknown, _params: unknown, env?: GraphEnv) => ({ dpr: env?.dpr }),
} as Operator;

/** Always throws. */
const broken: Operator = {
  id: "broken",
  category: "top",
  label: "Broken",
  inputs: [],
  outputs: [{ name: "n", type: "number" }],
  params: [],
  evaluate: () => {
    throw new Error("boom");
  },
};

/**
 * Stands in for circle-pack: draws from the shared env.rng and offsets
 * the draws by its `margin` param, so the output depends on both.
 */
const scatter: Operator = {
  id: "scatter",
  category: "sop",
  label: "Scatter",
  inputs: [],
  outputs: [{ name: "points", type: "geometry" }],
  params: [{ key: "margin", label: "Margin", min: 0, max: 300, step: 10, default: 100 }],
  evaluate: (_inputs, params, env) => {
    const rng = env?.rng;
    if (!rng) throw new Error("scatter needs env.rng");
    const margin = params.margin;
    if (margin === undefined) throw new Error("scatter needs params.margin");
    const points: number[] = [];
    for (let i = 0; i < 8; i++) points.push(rng.random() * 1000 - margin);
    return { points };
  },
};

function makeRegistry(): OperatorRegistry {
  const registry = new OperatorRegistry();
  for (const op of [source, pass, echoParams, collect, dprReader, broken, scatter]) {
    registry.register(op);
  }
  return registry;
}

function wire(from: string, output: string, to: string, input: string): Wire {
  return { from, output, to, input };
}

function graph(nodes: Graph["nodes"], wires: Wire[]): Graph {
  return { id: "test", name: "Test", nodes, wires };
}

const ENV: GraphEnv = { width: 100, height: 100, dpr: 1 };

/** Cook and return the keys of the nodes that evaluated, in cook order. */
function cooked(engine: CookEngine, env: GraphEnv = ENV): string[] {
  engine.cook(env);
  return [...engine.stats.timing.keys()];
}

// a → b → c, plus an independent d
const chain = graph(
  {
    a: { type: "source" },
    b: { type: "pass" },
    c: { type: "pass" },
    d: { type: "source" },
  },
  [wire("a", "n", "b", "n"), wire("b", "n", "c", "n")],
);

// ─── Dirty tracking ──────────────────────────────────────────────

describe("setParams dirty tracking", () => {
  test("the first cook evaluates every node in topological order", () => {
    const engine = new CookEngine(chain, makeRegistry());
    expect(engine.needsCook).toBe(true);
    expect(cooked(engine)).toEqual(["a", "d", "b", "c"]);
    expect(engine.stats).toMatchObject({ cooked: 4, cached: 0, total: 4 });
    expect(engine.needsCook).toBe(false);
  });

  test("an unchanged key dirties nothing, even in a new object", () => {
    const engine = new CookEngine(chain, makeRegistry());
    engine.setParams({ "a.k": 5 });
    cooked(engine);
    engine.setParams({ "a.k": 5 });
    expect(engine.needsCook).toBe(false);
    expect(cooked(engine)).toEqual([]);
    expect(engine.stats).toMatchObject({ cooked: 0, cached: 4, total: 4 });
  });

  test("a changed key dirties its node and everything downstream", () => {
    const engine = new CookEngine(chain, makeRegistry());
    engine.setParams({ "a.k": 5 });
    cooked(engine);
    engine.setParams({ "a.k": 6 });
    expect(engine.needsCook).toBe(true);
    expect(cooked(engine)).toEqual(["a", "b", "c"]);
    expect(engine.getOutput("c")).toEqual({ n: 6 });
  });

  test("an added key dirties its node", () => {
    const engine = new CookEngine(chain, makeRegistry());
    engine.setParams({ "a.k": 5 });
    cooked(engine);
    engine.setParams({ "a.k": 5, "d.k": 7 });
    expect(cooked(engine)).toEqual(["d"]);
    expect(engine.getOutput("d")).toEqual({ n: 7 });
  });

  test("a removed key dirties its node, which falls back to its default", () => {
    const engine = new CookEngine(chain, makeRegistry());
    engine.setParams({ "a.k": 5, "d.k": 7 });
    cooked(engine);
    engine.setParams({ "a.k": 5 });
    expect(cooked(engine)).toEqual(["d"]);
    expect(engine.getOutput("d")).toEqual({ n: 1 });
  });

  test("a key without a dot is ignored", () => {
    const engine = new CookEngine(chain, makeRegistry());
    cooked(engine);
    engine.setParams({ k: 3 });
    expect(engine.needsCook).toBe(false);
  });

  test("propagation runs downstream only", () => {
    const engine = new CookEngine(chain, makeRegistry());
    cooked(engine);
    engine.setParams({ "b.k": 2 });
    expect(cooked(engine)).toEqual(["b", "c"]);
    expect(engine.getOutput("c")).toEqual({ n: 3 });
  });

  test("invalidateAll and clearCache make the next cook a full one", () => {
    const engine = new CookEngine(chain, makeRegistry());
    cooked(engine);
    engine.invalidateAll();
    expect(cooked(engine)).toEqual(["a", "d", "b", "c"]);
    engine.clearCache();
    expect(engine.getOutput("a")).toBeUndefined();
    expect(cooked(engine)).toEqual(["a", "d", "b", "c"]);
  });
});

describe("env dirty tracking", () => {
  // w reads $env.width, h reads $env.height; w2 is downstream of w; s is independent
  const envGraph = graph(
    {
      s: { type: "source" },
      w: { type: "pass" },
      h: { type: "pass" },
      w2: { type: "pass" },
    },
    [wire("$env", "width", "w", "n"), wire("$env", "height", "h", "n"), wire("w", "n", "w2", "n")],
  );

  test("$env wires deliver env values as inputs", () => {
    const engine = new CookEngine(envGraph, makeRegistry());
    engine.cook({ width: 300, height: 200 });
    expect(engine.getOutput("w")).toEqual({ n: 300 });
    expect(engine.getOutput("h")).toEqual({ n: 200 });
  });

  test("a width change dirties only $env.width dependents and their descendants", () => {
    const engine = new CookEngine(envGraph, makeRegistry());
    cooked(engine, { width: 100, height: 100 });
    expect(cooked(engine, { width: 200, height: 100 })).toEqual(["w", "w2"]);
    expect(engine.getOutput("w2")).toEqual({ n: 200 });
  });

  test("an unchanged env, or a change to an unwired key, cooks nothing", () => {
    const engine = new CookEngine(envGraph, makeRegistry());
    cooked(engine, { width: 100, height: 100, dpr: 1 });
    expect(cooked(engine, { width: 100, height: 100, dpr: 1 })).toEqual([]);
    expect(cooked(engine, { width: 100, height: 100, dpr: 2 })).toEqual([]);
  });
});

// ─── Evaluation ──────────────────────────────────────────────────

describe("param resolution", () => {
  test("operator default < instance param < external param", () => {
    const g = graph({ n: { type: "echo-params", params: { q: 20, r: 30 } } }, []);
    const engine = new CookEngine(g, makeRegistry());
    engine.setParams({ "n.r": 300 });
    engine.cook(ENV);
    expect(engine.getOutput("n")).toEqual({ params: { p: 1, q: 20, r: 300 } });
  });

  test("external params apply only to the node named by their prefix", () => {
    const g = graph({ n: { type: "echo-params" }, nn: { type: "echo-params" } }, []);
    const engine = new CookEngine(g, makeRegistry());
    engine.setParams({ "n.p": 10, "nn.q": 20 });
    engine.cook(ENV);
    expect(engine.getOutput("n")).toEqual({ params: { p: 10, q: 2, r: 3 } });
    expect(engine.getOutput("nn")).toEqual({ params: { p: 1, q: 20, r: 3 } });
  });
});

describe("input gathering", () => {
  test("a variadic input receives an array in wire order", () => {
    const g = graph(
      {
        s1: { type: "source", params: { k: 1 } },
        s2: { type: "source", params: { k: 2 } },
        s3: { type: "source", params: { k: 3 } },
        col: { type: "collect" },
      },
      [
        wire("s3", "n", "col", "items"),
        wire("s1", "n", "col", "items"),
        wire("s2", "n", "col", "items"),
        wire("s2", "n", "col", "single"),
      ],
    );
    const engine = new CookEngine(g, makeRegistry());
    engine.cook(ENV);
    expect(engine.getOutput("col")).toEqual({ items: [3, 1, 2], single: 2 });
  });

  test("a variadic input with one wire receives an array of one", () => {
    const g = graph({ s: { type: "source", params: { k: 4 } }, col: { type: "collect" } }, [
      wire("s", "n", "col", "items"),
    ]);
    const engine = new CookEngine(g, makeRegistry());
    engine.cook(ENV);
    expect(engine.getOutput("col")).toEqual({ items: [4], single: undefined });
  });
});

describe("caching", () => {
  test("a clean node keeps the same cached output object", () => {
    const engine = new CookEngine(chain, makeRegistry());
    const first = engine.cook(ENV);
    const a = engine.getOutput("a");
    const c = engine.getOutput("c");
    expect(a).toBeDefined();
    expect(first.get("a")).toBe(a);

    engine.setParams({ "d.k": 9 });
    const second = engine.cook(ENV);
    expect(engine.getOutput("a")).toBe(a);
    expect(engine.getOutput("c")).toBe(c);
    expect(second.get("a")).toBe(a);
  });

  test("a re-cooked node gets a new output object", () => {
    const engine = new CookEngine(chain, makeRegistry());
    engine.cook(ENV);
    const a = engine.getOutput("a");
    engine.setParams({ "a.k": 2 });
    engine.cook(ENV);
    expect(engine.getOutput("a")).not.toBe(a);
  });
});

// ─── Known bugs ──────────────────────────────────────────────────
//
// Each test below is marked failing: it passes while its bug exists and
// fails once the bug is fixed, so the fix must turn it into a plain test.

describe("known bugs", () => {
  test.failing("setParams copies its argument (in-place edit detected)", () => {
    const engine = new CookEngine(chain, makeRegistry());
    const params: Record<string, number> = { "a.k": 1 };
    engine.setParams(params);
    engine.cook(ENV);
    params["a.k"] = 2;
    engine.setParams(params);
    expect(engine.needsCook).toBe(true);
    engine.cook(ENV);
    expect(engine.getOutput("a")).toEqual({ n: 2 });
  });

  test.failing("a dpr change re-cooks dpr readers", () => {
    const g = graph({ r: { type: "dpr-reader" } }, []);
    const engine = new CookEngine(g, makeRegistry());
    engine.cook({ ...ENV, dpr: 1 });
    engine.cook({ ...ENV, dpr: 2 });
    expect(engine.getOutput("r")).toEqual({ dpr: 2 });
  });

  test.failing("a throwing node does not stop independent branches", () => {
    // "bad" is first in key order, so it cooks before "good"
    const g = graph({ bad: { type: "broken" }, good: { type: "source" } }, []);
    const engine = new CookEngine(g, makeRegistry());
    try {
      engine.cook(ENV);
    } catch {
      // the fix may report the error by throwing after the cook, or in stats
    }
    expect(engine.getOutput("good")).toEqual({ n: 1 });
  });

  test.failing("validateGraph runs in the constructor", () => {
    // b's required input is not wired: validateGraph rejects this graph
    const g = graph({ a: { type: "source" }, b: { type: "pass" } }, []);
    expect(() => new CookEngine(g, makeRegistry())).toThrow();
  });

  test.failing("incremental cook equals full cook with two rng nodes", () => {
    const g = graph({ a: { type: "scatter" }, b: { type: "scatter" } }, []);
    // Each cook gets a fresh RNG with the same seed, as Frame and EditorPreview do
    const env = (): GraphEnv => ({ ...ENV, rng: new SeededRNG(42) });

    const full = new CookEngine(g, makeRegistry());
    full.cook(env());
    const expected = full.getOutput("b");

    const engine = new CookEngine(g, makeRegistry());
    engine.cook(env());
    engine.setParams({ "b.margin": 110 });
    engine.cook(env());
    engine.setParams({ "b.margin": 100 });
    engine.cook(env());
    expect(engine.getOutput("b")).toEqual(expected);
  });
});
