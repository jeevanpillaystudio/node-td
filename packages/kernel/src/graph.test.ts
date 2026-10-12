import { describe, expect, test } from "bun:test";
import { CookEngine } from "./cook";
import {
  collectParams,
  type Graph,
  GraphValidationError,
  lintParamDefs,
  lintParams,
  topoSort,
  validateGraph,
  type Wire,
} from "./graph";
import { OperatorRegistry } from "./registry";
import type { Operator } from "./types";

// ─── Fake operators ──────────────────────────────────────────────
//
// Kernel tests use their own operators, so they pin the kernel alone
// and never depend on the real operator library.

const numSource: Operator = {
  id: "num-source",
  category: "top",
  label: "Number Source",
  inputs: [],
  outputs: [{ name: "n", type: "number" }],
  params: [{ key: "k", label: "K", min: 0, max: 10, step: 1, default: 1 }],
  evaluate: (_inputs, params) => ({ n: params.k }),
};

const geoSource: Operator = {
  id: "geo-source",
  category: "sop",
  label: "Geometry Source",
  inputs: [],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [
    { key: "count", label: "Count", min: 1, max: 100, step: 1, default: 10 },
    {
      key: "mode",
      label: "Mode",
      kind: "enum",
      options: [
        { label: "A", value: 0 },
        { label: "B", value: 1 },
      ],
      default: 0,
    },
  ],
  evaluate: () => ({ geometry: null }),
};

const numSink: Operator = {
  id: "num-sink",
  category: "top",
  label: "Number Sink",
  inputs: [
    { name: "n", type: "number" },
    { name: "extra", type: "number", optional: true },
  ],
  outputs: [{ name: "n", type: "number" }],
  params: [],
  evaluate: ({ n }) => ({ n }),
};

const geoMerge: Operator = {
  id: "geo-merge",
  category: "sop",
  label: "Geometry Merge",
  inputs: [{ name: "geometry", type: "geo2", variadic: true }],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [],
  evaluate: ({ geometry }) => ({ geometry }),
};

function makeRegistry(): OperatorRegistry {
  return new OperatorRegistry()
    .register(numSource)
    .register(geoSource)
    .register(numSink)
    .register(geoMerge);
}

function wire(from: string, output: string, to: string, input: string): Wire {
  return { from, output, to, input };
}

function graph(nodes: Graph["nodes"], wires: Wire[]): Graph {
  return { id: "test", name: "Test", nodes, wires };
}

/** The message validateGraph throws, or undefined when the graph is valid. */
function validationError(g: Graph): string | undefined {
  try {
    validateGraph(g, makeRegistry());
    return undefined;
  } catch (err) {
    return (err as Error).message;
  }
}

// ─── topoSort ────────────────────────────────────────────────────

describe("topoSort", () => {
  test("orders a chain upstream first, whatever the key order", () => {
    const wires = [wire("a", "n", "b", "n"), wire("b", "n", "c", "n")];
    expect(topoSort(["c", "b", "a"], wires)).toEqual(["a", "b", "c"]);
  });

  test("breaks ties by key order for roots, then by wire order (Kahn's queue is FIFO)", () => {
    expect(topoSort(["b", "a", "c"], [])).toEqual(["b", "a", "c"]);

    const diamond = [
      wire("a", "n", "c", "n"),
      wire("a", "n", "b", "n"),
      wire("b", "n", "d", "n"),
      wire("c", "n", "d", "extra"),
    ];
    expect(topoSort(["d", "c", "b", "a"], diamond)).toEqual(["a", "c", "b", "d"]);
  });

  test("counts two wires between the same pair of nodes as one edge", () => {
    const wires = [wire("a", "n", "b", "n"), wire("a", "n", "b", "extra")];
    expect(topoSort(["b", "a"], wires)).toEqual(["a", "b"]);
  });

  test("ignores $env wires", () => {
    const wires = [wire("$env", "width", "a", "n"), wire("a", "n", "b", "n")];
    expect(topoSort(["b", "a"], wires)).toEqual(["a", "b"]);
  });

  test("throws on a cycle, naming the nodes on it", () => {
    const loop = [wire("a", "n", "b", "n"), wire("b", "n", "a", "n"), wire("b", "n", "c", "n")];
    expect(() => topoSort(["a", "b", "c"], loop)).toThrow(
      'Graph contains a cycle through "a", "b"',
    );
    expect(() => topoSort(["a"], [wire("a", "n", "a", "n")])).toThrow(
      'Graph contains a cycle through "a"',
    );
  });
});

// ─── Wires to unknown nodes ──────────────────────────────────────

describe("a wire to an unknown node", () => {
  const toGhost = graph({ a: { type: "num-source" } }, [wire("a", "n", "ghost", "n")]);
  const fromGhost = graph({ b: { type: "num-sink" } }, [wire("ghost", "n", "b", "n")]);

  test("crashes topoSort with a TypeError (today's behaviour)", () => {
    expect(() => topoSort(["a"], toGhost.wires)).toThrow(TypeError);
    expect(() => topoSort(["b"], fromGhost.wires)).toThrow(TypeError);
  });

  test("is reported by name by validateGraph", () => {
    expect(validationError(toGhost)).toBe('Wire: target node "ghost" not found');
    expect(validationError(fromGhost)).toBe('Wire: source node "ghost" not found');
  });

  test("reports unknown node by name", () => {
    expect(() => new CookEngine(toGhost, makeRegistry())).toThrow(/ghost/);
    expect(() => new CookEngine(fromGhost, makeRegistry())).toThrow(/ghost/);
  });
});

// ─── validateGraph ───────────────────────────────────────────────

describe("validateGraph", () => {
  test("accepts a valid graph, including a variadic input wired twice", () => {
    const g = graph(
      {
        src: { type: "num-source" },
        sink: { type: "num-sink" },
        g1: { type: "geo-source" },
        g2: { type: "geo-source" },
        merge: { type: "geo-merge" },
      },
      [
        wire("src", "n", "sink", "n"),
        wire("g1", "geometry", "merge", "geometry"),
        wire("g2", "geometry", "merge", "geometry"),
      ],
    );
    expect(validationError(g)).toBeUndefined();
  });

  test("rejects an unknown operator type, and still checks the wires", () => {
    const g = graph({ x: { type: "nope" }, y: { type: "num-sink" } }, [
      wire("ghost", "n", "y", "n"),
      wire("x", "n", "y", "extra"),
    ]);
    expect(validationError(g)).toBe(
      ['Node "x" references unknown type "nope"', 'Wire: source node "ghost" not found'].join("\n"),
    );
  });

  test("rejects a node key that contains '.' or starts with '$'", () => {
    const g = graph({ "a.b": { type: "num-source" }, $env: { type: "num-source" } }, []);
    expect(validationError(g)).toBe(
      [
        'Node "a.b": a node key cannot contain "."',
        'Node "$env": a node key cannot start with "$"',
      ].join("\n"),
    );
  });

  test("finds only the graph's own nodes, not Object.prototype's", () => {
    const g = graph({ a: { type: "num-source" } }, [wire("a", "n", "constructor", "n")]);
    expect(validationError(g)).toBe('Wire: target node "constructor" not found');
  });

  test("rejects a wire to an unknown target node", () => {
    const g = graph({ a: { type: "num-source" } }, [wire("a", "n", "ghost", "n")]);
    expect(validationError(g)).toBe('Wire: target node "ghost" not found');
  });

  test("rejects a wire to an input the target does not have", () => {
    const g = graph({ a: { type: "num-source" }, b: { type: "num-sink" } }, [
      wire("a", "n", "b", "n"),
      wire("a", "n", "b", "nope"),
    ]);
    expect(validationError(g)).toBe('Wire: "b" has no input "nope"');
  });

  test("rejects two wires to the same non-variadic input", () => {
    const g = graph(
      { a: { type: "num-source" }, a2: { type: "num-source" }, b: { type: "num-sink" } },
      [wire("a", "n", "b", "n"), wire("a2", "n", "b", "n")],
    );
    expect(validationError(g)).toBe("Wire: duplicate wire to b.n");
  });

  test("rejects a wire from an unknown source node", () => {
    const g = graph({ b: { type: "num-sink" } }, [wire("ghost", "n", "b", "n")]);
    expect(validationError(g)).toBe('Wire: source node "ghost" not found');
  });

  test("rejects a wire from an output the source does not have", () => {
    const g = graph({ a: { type: "num-source" }, b: { type: "num-sink" } }, [
      wire("a", "nope", "b", "n"),
    ]);
    expect(validationError(g)).toBe('Wire: "a" has no output "nope"');
  });

  test("rejects a wire between ports of different types", () => {
    const g = graph({ g: { type: "geo-source" }, b: { type: "num-sink" } }, [
      wire("g", "geometry", "b", "n"),
    ]);
    expect(validationError(g)).toBe(
      'Wire: type mismatch — "g.geometry" (geo2) → "b.n" (number)',
    );
  });

  test("reports a cycle by the names of the nodes on it", () => {
    // c is downstream of the a ⇄ b cycle but not on it
    const g = graph({ a: { type: "num-sink" }, b: { type: "num-sink" }, c: { type: "num-sink" } }, [
      wire("a", "n", "b", "n"),
      wire("b", "n", "a", "n"),
      wire("b", "n", "c", "n"),
    ]);
    expect(validationError(g)).toBe('Graph contains a cycle through "a", "b"');
  });

  test("rejects a required input left unwired, but not an optional one", () => {
    const g = graph({ b: { type: "num-sink" } }, []);
    expect(validationError(g)).toBe('Node "b": required input "n" is not wired');
  });

  test("reports every wire and input error at once, one per line", () => {
    const g = graph(
      { a: { type: "num-source" }, b: { type: "num-sink" }, c: { type: "num-sink" } },
      [wire("a", "nope", "b", "n"), wire("a", "n", "ghost", "n")],
    );
    expect(validationError(g)).toBe(
      [
        'Wire: "a" has no output "nope"',
        'Wire: target node "ghost" not found',
        'Node "c": required input "n" is not wired',
      ].join("\n"),
    );
  });

  test("throws a GraphValidationError that lists every issue", () => {
    const g = graph({ b: { type: "num-sink" } }, [wire("a", "n", "b", "extra")]);
    let error: unknown;
    try {
      validateGraph(g, makeRegistry());
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(GraphValidationError);
    expect((error as GraphValidationError).issues).toEqual([
      'Wire: source node "a" not found',
      'Node "b": required input "n" is not wired',
    ]);
  });
});

// ─── The $env source ─────────────────────────────────────────────

describe("validateGraph on $env wires", () => {
  test("accepts its declared outputs, width and height, into number inputs", () => {
    const g = graph({ b: { type: "num-sink" } }, [
      wire("$env", "width", "b", "n"),
      wire("$env", "height", "b", "extra"),
    ]);
    expect(validationError(g)).toBeUndefined();
  });

  test("type-checks them against the declared outputs", () => {
    const g = graph({ merge: { type: "geo-merge" } }, [wire("$env", "width", "merge", "geometry")]);
    expect(validationError(g)).toBe(
      'Wire: type mismatch — "$env.width" (number) → "merge.geometry" (geo2)',
    );
  });

  test("rejects an output it does not declare", () => {
    const g = graph({ b: { type: "num-sink" } }, [wire("$env", "dpr", "b", "n")]);
    expect(validationError(g)).toBe('Wire: "$env" has no output "dpr"');
  });

  test("rejects a wire into it", () => {
    const g = graph({ a: { type: "num-source" } }, [wire("a", "n", "$env", "width")]);
    expect(validationError(g)).toBe('Wire: "$env" is a source and cannot be a wire target');
  });
});

// ─── Params ──────────────────────────────────────────────────────

/** Declares defaults that are not legal for their own params. */
const badDefaults: Operator = {
  id: "bad-defaults",
  category: "top",
  label: "Bad Defaults",
  inputs: [],
  outputs: [{ name: "n", type: "number" }],
  params: [
    { key: "low", label: "Low", min: 0.0001, max: 10, step: 0.0001, default: 0.00001 },
    { key: "fine", label: "Fine", min: 0, max: 1, step: 0.1, default: 0.5 },
    {
      key: "pick",
      label: "Pick",
      kind: "enum",
      options: [
        { label: "A", value: 0 },
        { label: "B", value: 1 },
      ],
      default: 2,
    },
  ],
  evaluate: () => ({ n: 0 }),
};

describe("validateGraph on params", () => {
  test("accepts declared params within range, ends included, and enum options", () => {
    const g = graph(
      {
        lo: { type: "num-source", params: { k: 0 } },
        hi: { type: "num-source", params: { k: 10 } },
        s: { type: "geo-source", params: { count: 50, mode: 1 } },
      },
      [],
    );
    expect(validationError(g)).toBeUndefined();
  });

  test("rejects a param the operator does not declare", () => {
    const g = graph({ a: { type: "num-source", params: { kk: 1 } } }, []);
    expect(validationError(g)).toBe('Node "a": "num-source" has no param "kk"');
  });

  test("rejects a number outside its param's [min, max]", () => {
    const g = graph(
      {
        lo: { type: "num-source", params: { k: -1 } },
        hi: { type: "num-source", params: { k: 10.5 } },
      },
      [],
    );
    expect(validationError(g)).toBe(
      [
        'Node "lo": param "k" is -1, outside [0, 10]',
        'Node "hi": param "k" is 10.5, outside [0, 10]',
      ].join("\n"),
    );
  });

  test("rejects an enum value that is not one of its options", () => {
    const g = graph({ s: { type: "geo-source", params: { mode: 2 } } }, []);
    expect(validationError(g)).toBe('Node "s": param "mode" is 2, not one of its options (0, 1)');
  });

  test("rejects a value that is not a number, NaN included", () => {
    const g = graph(
      {
        a: { type: "num-source", params: { k: "3" as unknown as number } },
        b: { type: "num-source", params: { k: Number.NaN } },
      },
      [],
    );
    expect(validationError(g)).toBe(
      [
        'Node "a": param "k" is "3", not a number',
        'Node "b": param "k" is NaN, outside [0, 10]',
      ].join("\n"),
    );
  });

  test("reports an operator's illegal defaults once, however many nodes use it", () => {
    const registry = makeRegistry().register(badDefaults);
    const g = graph({ a: { type: "bad-defaults" }, b: { type: "bad-defaults" } }, []);
    const expected = [
      'Operator "bad-defaults": the default of param "low" is 0.00001, outside [0.0001, 10]',
      'Operator "bad-defaults": the default of param "pick" is 2, not one of its options (0, 1)',
    ];
    expect(lintParamDefs(badDefaults)).toEqual(expected);
    expect(lintParams(g, registry)).toEqual(expected);
    expect(() => validateGraph(g, registry)).toThrow(expected.join("\n"));
  });

  test("skips nodes of an unknown type, which pass 1 reports", () => {
    const g = graph({ x: { type: "nope", params: { k: 99 } } }, []);
    expect(lintParams(g, makeRegistry())).toEqual([]);
    expect(validationError(g)).toBe('Node "x" references unknown type "nope"');
  });

  test("lists param issues after the wire and input issues", () => {
    const g = graph({ a: { type: "num-source", params: { k: 11 } }, b: { type: "num-sink" } }, []);
    expect(validationError(g)).toBe(
      [
        'Node "b": required input "n" is not wired',
        'Node "a": param "k" is 11, outside [0, 10]',
      ].join("\n"),
    );
  });

  test("makes the CookEngine constructor throw", () => {
    const g = graph({ a: { type: "num-source", params: { k: 11 } } }, []);
    expect(() => new CookEngine(g, makeRegistry())).toThrow(GraphValidationError);
  });
});

// ─── collectParams ───────────────────────────────────────────────

describe("collectParams", () => {
  test("prefixes keys and labels with the node key, in node then param order", () => {
    const g = graph({ noise: { type: "num-source" }, seeds: { type: "geo-source" } }, []);
    const params = collectParams(g, makeRegistry());
    expect(params.map((p) => p.key)).toEqual(["noise.k", "seeds.count", "seeds.mode"]);
    expect(params.map((p) => p.label)).toEqual(["noise / K", "seeds / Count", "seeds / Mode"]);
  });

  test("defaults to the instance value, else the operator default", () => {
    const g = graph({ a: { type: "num-source", params: { k: 7 } }, b: { type: "num-source" } }, []);
    const params = collectParams(g, makeRegistry());
    expect(params.map((p) => [p.key, p.default])).toEqual([
      ["a.k", 7],
      ["b.k", 1],
    ]);
  });

  test("keeps the rest of each definition, enum options included", () => {
    const g = graph({ s: { type: "geo-source", params: { mode: 1 } } }, []);
    expect(collectParams(g, makeRegistry())).toEqual([
      { key: "s.count", label: "s / Count", min: 1, max: 100, step: 1, default: 10 },
      {
        key: "s.mode",
        label: "s / Mode",
        kind: "enum",
        options: [
          { label: "A", value: 0 },
          { label: "B", value: 1 },
        ],
        default: 1,
      },
    ]);
  });

  test("does not modify the operator's own param definitions", () => {
    const g = graph({ a: { type: "num-source", params: { k: 7 } } }, []);
    collectParams(g, makeRegistry());
    expect(numSource.params[0]).toEqual({
      key: "k",
      label: "K",
      min: 0,
      max: 10,
      step: 1,
      default: 1,
    });
  });
});
