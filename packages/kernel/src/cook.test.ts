import { describe, expect, test } from "bun:test";
import { CookEngine } from "./cook";
import { type Graph, GraphValidationError, type Wire } from "./graph";
import { OperatorRegistry } from "./registry";
import type { Capabilities, EnvValues, Operator } from "./types";

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
const dprReader: Operator = {
  id: "dpr-reader",
  category: "top",
  label: "DPR Reader",
  inputs: [],
  outputs: [{ name: "dpr", type: "number" }],
  params: [],
  envReads: ["dpr"],
  evaluate: (_inputs, _params, env) => ({ dpr: env.dpr }),
};

/** Emits the env it was handed, as plain data. Declares every env value. */
const envEcho: Operator = {
  id: "env-echo",
  category: "top",
  label: "Env Echo",
  inputs: [],
  outputs: [{ name: "env", type: "number" }],
  params: [],
  envReads: ["width", "height", "dpr", "seed"],
  evaluate: (_inputs, _params, env) => ({
    env: {
      width: env.width,
      height: env.height,
      dpr: env.dpr,
      seed: env.seed,
      canvas: env.createCanvas?.(3, 4),
      rngKeys: Object.keys(env.rng),
    },
  }),
};

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

/** Emits its input plus one, or throws while its param `fail` is 1. */
const flaky: Operator = {
  id: "flaky",
  category: "top",
  label: "Flaky",
  inputs: [{ name: "n", type: "number" }],
  outputs: [{ name: "n", type: "number" }],
  params: [{ key: "fail", label: "Fail", min: 0, max: 1, step: 1, default: 0 }],
  evaluate: ({ n }, params) => {
    if (params.fail === 1) throw new Error("flaky failed");
    return { n: n + 1 };
  },
};

/** Declares no evaluate. */
const inert: Operator = {
  id: "inert",
  category: "top",
  label: "Inert",
  inputs: [],
  outputs: [{ name: "n", type: "number" }],
  params: [],
};

/**
 * Stands in for circle-pack: draws eight values from the shared env.rng
 * and offsets them by its `margin` param, so the output depends on both,
 * while the number of draws does not.
 */
const scatter: Operator = {
  id: "scatter",
  category: "sop",
  label: "Scatter",
  inputs: [],
  outputs: [{ name: "points", type: "geometry" }],
  params: [{ key: "margin", label: "Margin", min: 0, max: 300, step: 10, default: 100 }],
  evaluate: (_inputs, params, env) => {
    const margin = params.margin;
    if (margin === undefined) throw new Error("scatter needs params.margin");
    const points: number[] = [];
    for (let i = 0; i < 8; i++) points.push(env.rng.random() * 1000 - margin);
    return { points };
  },
};

/**
 * Stands in for poisson-disc: the number of values it draws is its
 * param `n`. While `fail` is 1 it draws one value and throws.
 */
const draws: Operator = {
  id: "draws",
  category: "sop",
  label: "Draws",
  inputs: [],
  outputs: [{ name: "values", type: "geometry" }],
  params: [
    { key: "n", label: "N", min: 0, max: 10, step: 1, default: 3 },
    { key: "fail", label: "Fail", min: 0, max: 1, step: 1, default: 0 },
  ],
  evaluate: (_inputs, params, env) => {
    if (params.fail === 1) {
      env.rng.random();
      throw new Error("draws failed");
    }
    const values: number[] = [];
    for (let i = 0; i < (params.n ?? 0); i++) values.push(env.rng.random());
    return { values };
  },
};

/** Emits how many values its input holds. Draws nothing. */
const count: Operator = {
  id: "count",
  category: "sop",
  label: "Count",
  inputs: [{ name: "values", type: "geometry" }],
  outputs: [{ name: "n", type: "number" }],
  params: [],
  evaluate: ({ values }) => ({ n: values.length }),
};

function makeRegistry(): OperatorRegistry {
  const registry = new OperatorRegistry();
  for (const op of [
    source,
    pass,
    echoParams,
    collect,
    dprReader,
    envEcho,
    broken,
    flaky,
    inert,
    scatter,
    draws,
    count,
  ]) {
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

const ENV: EnvValues = { width: 100, height: 100, dpr: 1, seed: 42 };

/** Cook and return the keys of the nodes that evaluated, in cook order. */
function cooked(engine: CookEngine, env: EnvValues & Capabilities = ENV): string[] {
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

// ─── Construction ────────────────────────────────────────────────

describe("construction", () => {
  test("validates the graph, throwing a GraphValidationError that lists every issue", () => {
    // b's required input is not wired, and c reads an output a lacks
    const g = graph({ a: { type: "source" }, b: { type: "pass" }, c: { type: "pass" } }, [
      wire("a", "nope", "c", "n"),
    ]);
    let error: unknown;
    try {
      new CookEngine(g, makeRegistry());
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(GraphValidationError);
    expect((error as GraphValidationError).issues).toEqual([
      'Wire: "a" has no output "nope"',
      'Node "b": required input "n" is not wired',
    ]);
  });

  test("rejects a cycle by name", () => {
    const g = graph({ a: { type: "pass" }, b: { type: "pass" } }, [
      wire("a", "n", "b", "n"),
      wire("b", "n", "a", "n"),
    ]);
    expect(() => new CookEngine(g, makeRegistry())).toThrow(
      'Graph contains a cycle through "a", "b"',
    );
  });
});

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

  test("setParams copies its argument (in-place edit detected)", () => {
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

  test("a key naming no node dirties nothing", () => {
    const engine = new CookEngine(chain, makeRegistry());
    cooked(engine);
    engine.setParams({ "zzz.k": 3 });
    expect(engine.needsCook).toBe(false);
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
    engine.cook({ ...ENV, width: 300, height: 200 });
    expect(engine.getOutput("w")).toEqual({ n: 300 });
    expect(engine.getOutput("h")).toEqual({ n: 200 });
  });

  test("a width change dirties only $env.width dependents and their descendants", () => {
    const engine = new CookEngine(envGraph, makeRegistry());
    cooked(engine, { ...ENV, width: 100, height: 100 });
    expect(cooked(engine, { ...ENV, width: 200, height: 100 })).toEqual(["w", "w2"]);
    expect(engine.getOutput("w2")).toEqual({ n: 200 });
  });

  test("an unchanged env, or a change to a key nothing reads, cooks nothing", () => {
    const engine = new CookEngine(envGraph, makeRegistry());
    cooked(engine, { ...ENV, dpr: 1 });
    expect(cooked(engine, { ...ENV, dpr: 1 })).toEqual([]);
    expect(cooked(engine, { ...ENV, dpr: 2 })).toEqual([]);
    expect(cooked(engine, { ...ENV, seed: 7 })).toEqual([]);
  });

  test("setEnv dirties at once, so needsCook is accurate before the cook", () => {
    const engine = new CookEngine(envGraph, makeRegistry());
    engine.cook(ENV);
    engine.setEnv(ENV);
    expect(engine.needsCook).toBe(false);
    engine.setEnv({ ...ENV, width: 200 });
    expect(engine.needsCook).toBe(true);
    engine.run();
    expect(engine.stats.timing.size).toBe(2);
    expect(engine.getOutput("w2")).toEqual({ n: 200 });
    expect(engine.needsCook).toBe(false);
  });

  test("setEnv copies its values (in-place edit detected)", () => {
    const engine = new CookEngine(envGraph, makeRegistry());
    const values = { ...ENV };
    engine.cook(values);
    values.height = 300;
    engine.setEnv(values);
    expect(engine.needsCook).toBe(true);
    engine.run();
    expect(engine.getOutput("h")).toEqual({ n: 300 });
  });

  test("run before any setEnv throws", () => {
    const engine = new CookEngine(envGraph, makeRegistry());
    expect(() => engine.run()).toThrow("CookEngine.run: call setEnv (or cook) first");
  });
});

describe("env values read by operators", () => {
  test("a dpr change re-cooks dpr readers", () => {
    const g = graph({ r: { type: "dpr-reader" } }, []);
    const engine = new CookEngine(g, makeRegistry());
    engine.cook({ ...ENV, dpr: 1 });
    engine.cook({ ...ENV, dpr: 2 });
    expect(engine.getOutput("r")).toEqual({ dpr: 2 });
  });

  test("a dpr change re-cooks only the nodes whose operator reads it, and their descendants", () => {
    // r reads dpr; p is downstream of r; s and w do not read it (w reads $env.width)
    const g = graph(
      {
        s: { type: "source" },
        r: { type: "dpr-reader" },
        p: { type: "pass" },
        w: { type: "pass" },
      },
      [wire("r", "dpr", "p", "n"), wire("$env", "width", "w", "n")],
    );
    const engine = new CookEngine(g, makeRegistry());
    cooked(engine);
    expect(cooked(engine, { ...ENV, dpr: 2 })).toEqual(["r", "p"]);
    expect(engine.getOutput("p")).toEqual({ n: 2 });
  });

  test("evaluate gets the env values, the capabilities and a draw-only rng", () => {
    const g = graph({ e: { type: "env-echo" } }, []);
    const engine = new CookEngine(g, makeRegistry());
    const canvas = { width: 3, height: 4 };
    engine.cook({ width: 10, height: 20, dpr: 2, seed: "abc", createCanvas: () => canvas });
    expect(engine.getOutput("e")).toEqual({
      env: { width: 10, height: 20, dpr: 2, seed: "abc", canvas, rngKeys: ["random"] },
    });
  });

  test("capabilities are never diffed: a new factory re-cooks nothing", () => {
    const g = graph({ e: { type: "env-echo" } }, []);
    const engine = new CookEngine(g, makeRegistry());
    engine.cook({ ...ENV, createCanvas: () => ({ width: 3, height: 4 }) });
    expect(cooked(engine, { ...ENV, createCanvas: () => ({ width: 3, height: 4 }) })).toEqual([]);
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

// ─── Per-node errors ─────────────────────────────────────────────

describe("per-node errors", () => {
  test("a throwing node does not stop independent branches", () => {
    // "bad" is first in key order, so it cooks before "good"
    const g = graph({ bad: { type: "broken" }, good: { type: "source" } }, []);
    const engine = new CookEngine(g, makeRegistry());
    engine.cook(ENV);
    expect(engine.getOutput("good")).toEqual({ n: 1 });
  });

  test("records the error, skips the nodes downstream, and counts them in stats", () => {
    // bad → p1 → p2, plus an independent good
    const g = graph(
      {
        bad: { type: "broken" },
        p1: { type: "pass" },
        p2: { type: "pass" },
        good: { type: "source" },
      },
      [wire("bad", "n", "p1", "n"), wire("p1", "n", "p2", "n")],
    );
    const engine = new CookEngine(g, makeRegistry());
    const cache = engine.cook(ENV);

    const { errors } = engine.stats;
    expect([...errors.keys()]).toEqual(["bad", "p1", "p2"]);
    const bad = errors.get("bad");
    expect(bad?.kind).toBe("error");
    expect(bad?.kind === "error" && (bad.error as Error).message).toBe("boom");
    expect(errors.get("p1")).toEqual({ kind: "skipped", cause: "bad" });
    expect(errors.get("p2")).toEqual({ kind: "skipped", cause: "bad" });
    expect(engine.stats).toMatchObject({ cooked: 1, cached: 0, total: 4 });
    expect([...cache.keys()]).toEqual(["good"]);
  });

  test("a failed node and its descendants stay dirty, keep no output, and recover", () => {
    // a → f → p, plus an independent d
    const g = graph(
      { a: { type: "source" }, f: { type: "flaky" }, p: { type: "pass" }, d: { type: "source" } },
      [wire("a", "n", "f", "n"), wire("f", "n", "p", "n")],
    );
    const engine = new CookEngine(g, makeRegistry());
    engine.cook(ENV);
    expect(engine.getOutput("p")).toEqual({ n: 2 });

    engine.setParams({ "f.fail": 1 });
    expect(cooked(engine)).toEqual([]);
    expect([...engine.stats.errors.keys()]).toEqual(["f", "p"]);
    expect(engine.getOutput("f")).toBeUndefined();
    expect(engine.getOutput("p")).toBeUndefined();
    expect(engine.getOutput("d")).toEqual({ n: 1 });
    expect(engine.needsCook).toBe(true);

    // Nothing changed: the next cook tries the failed nodes again
    expect(cooked(engine)).toEqual([]);
    expect([...engine.stats.errors.keys()]).toEqual(["f", "p"]);

    engine.setParams({ "f.fail": 0 });
    expect(cooked(engine)).toEqual(["f", "p"]);
    expect(engine.stats.errors.size).toBe(0);
    expect(engine.getOutput("p")).toEqual({ n: 2 });
    expect(engine.needsCook).toBe(false);
  });

  test("an operator without evaluate is an error, not a silent cache hit", () => {
    const g = graph({ i: { type: "inert" }, p: { type: "pass" } }, [wire("i", "n", "p", "n")]);
    const engine = new CookEngine(g, makeRegistry());
    engine.cook(ENV);
    const failure = engine.stats.errors.get("i");
    expect(failure?.kind === "error" && (failure.error as Error).message).toBe(
      'Operator "inert" has no evaluate',
    );
    expect(engine.stats.errors.get("p")).toEqual({ kind: "skipped", cause: "i" });
    expect(engine.stats).toMatchObject({ cooked: 0, cached: 0, total: 2 });
  });
});

// ─── The random stream ───────────────────────────────────────────
//
// Every node draws from one stream per cook, in topological order. An
// incremental cook must give each node exactly the draws a full cook
// would, whichever nodes it re-cooks.

/** The outputs of every node after a fresh engine's full cook. */
function fullCook(
  g: Graph,
  params: Record<string, number> = {},
  env: EnvValues = ENV,
): Map<string, Record<string, unknown>> {
  const engine = new CookEngine(g, makeRegistry());
  engine.setParams(params);
  return new Map(engine.cook(env));
}

// x draws `n` values; s draws nothing; y draws eight; c counts y's points
const streamGraph = graph(
  {
    x: { type: "draws" },
    s: { type: "source" },
    y: { type: "scatter" },
    c: { type: "count" },
  },
  [wire("y", "points", "c", "values")],
);

describe("random stream replay", () => {
  test("incremental cook equals full cook with two rng nodes", () => {
    const g = graph({ a: { type: "scatter" }, b: { type: "scatter" } }, []);
    const expected = fullCook(g).get("b");

    const engine = new CookEngine(g, makeRegistry());
    engine.cook(ENV);
    engine.setParams({ "b.margin": 110 });
    engine.cook(ENV);
    engine.setParams({ "b.margin": 100 });
    engine.cook(ENV);
    expect(engine.getOutput("b")).toEqual(expected);
  });

  test("a clean node that draws is skipped when the stream reaches it unchanged", () => {
    const engine = new CookEngine(streamGraph, makeRegistry());
    cooked(engine);
    const y = engine.getOutput("y");
    // x re-cooks but still draws three values, so y's draws start where they did
    engine.setParams({ "x.fail": 0 });
    expect(cooked(engine)).toEqual(["x"]);
    expect(engine.getOutput("y")).toBe(y);
  });

  test("a node that draws a different amount re-cooks the drawing nodes after it", () => {
    const engine = new CookEngine(streamGraph, makeRegistry());
    cooked(engine);
    engine.setParams({ "x.n": 5 });
    // s draws nothing, so it stays cached; y's draws now start two values later
    expect(cooked(engine)).toEqual(["x", "y", "c"]);
    expect(new Map(engine.cook(ENV))).toEqual(fullCook(streamGraph, { "x.n": 5 }));
  });

  test("a seed change re-cooks exactly the nodes that drew, and their descendants", () => {
    const engine = new CookEngine(streamGraph, makeRegistry());
    cooked(engine);
    engine.setEnv({ ...ENV, seed: 7 });
    expect(engine.needsCook).toBe(true);
    engine.run();
    expect([...engine.stats.timing.keys()]).toEqual(["x", "y", "c"]);
    expect(new Map(engine.run())).toEqual(fullCook(streamGraph, {}, { ...ENV, seed: 7 }));
  });

  test("a seed change re-cooks nothing in a graph that never draws", () => {
    const engine = new CookEngine(chain, makeRegistry());
    cooked(engine);
    engine.setEnv({ ...ENV, seed: 7 });
    expect(engine.needsCook).toBe(false);
  });

  test("a node that fails mid-draw stays dirty, and the nodes after it match a full cook", () => {
    const engine = new CookEngine(streamGraph, makeRegistry());
    cooked(engine);

    // x now draws one value and throws, so y's draws start two values earlier
    engine.setParams({ "x.fail": 1 });
    expect(cooked(engine)).toEqual(["y", "c"]);
    expect([...engine.stats.errors.keys()]).toEqual(["x"]);
    const failed = fullCook(streamGraph, { "x.fail": 1 });
    expect(engine.getOutput("y")).toEqual(failed.get("y"));

    // Nothing changed: x fails again from the same state, and y stays cached
    const y = engine.getOutput("y");
    expect(engine.needsCook).toBe(true);
    expect(cooked(engine)).toEqual([]);
    expect([...engine.stats.errors.keys()]).toEqual(["x"]);
    expect(engine.getOutput("y")).toBe(y);

    engine.setParams({ "x.fail": 0 });
    expect(cooked(engine)).toEqual(["x", "y", "c"]);
    expect(new Map(engine.cook(ENV))).toEqual(fullCook(streamGraph));
  });

  // Pinned, not a goal: the stream follows topological order, and Kahn's
  // algorithm breaks ties by node key order, so listing the same nodes in
  // another order hands out the draws differently. Per-node seeds, which
  // would remove this, are deferred: they would change every random patch.
  test("draws follow topological order, ties broken by node key order", () => {
    const ab = fullCook(graph({ a: { type: "scatter" }, b: { type: "scatter" } }, []));
    const ba = fullCook(graph({ b: { type: "scatter" }, a: { type: "scatter" } }, []));
    expect(ba.get("b")).toEqual(ab.get("a"));
    expect(ba.get("a")).toEqual(ab.get("b"));
    expect(ab.get("a")).not.toEqual(ab.get("b"));
  });
});
