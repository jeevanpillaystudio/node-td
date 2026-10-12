import { describe, expect, expectTypeOf, test } from "bun:test";
import { CookEngine } from "./cook";
import { defineOperator } from "./define";
import type { Graph, Wire } from "./graph";
import { OperatorRegistry } from "./registry";
import type { EnvValues, Geometry, Operator, Palette } from "./types";

// ─── Fake operators ──────────────────────────────────────────────
//
// Kernel tests use their own operators, so they pin the kernel alone.

/** Emits a geometry of `count` points. */
const points = defineOperator({
  id: "points",
  category: "sop",
  label: "Points",
  inputs: [],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [{ key: "count", label: "Count", min: 0, max: 10, step: 1, default: 2 }],
  evaluate(_inputs, params) {
    const positions = new Float32Array(params.count * 2);
    return { geometry: { positions, vertexCount: params.count, dim: 2, topology: "points" } };
  },
});

/** Counts the vertices on its variadic input, plus one if a palette is wired. */
const tally = defineOperator({
  id: "tally",
  category: "sop",
  label: "Tally",
  inputs: [
    { name: "geometry", type: "geo2", variadic: true, optional: true },
    { name: "palette", type: "palette", optional: true },
    { name: "width", type: "number" },
  ],
  outputs: [{ name: "total", type: "number" }],
  params: [
    { key: "scale", label: "Scale", min: 0, max: 10, step: 1, default: 1 },
    {
      key: "mode",
      label: "Mode",
      kind: "enum",
      options: [
        { label: "Vertices", value: 0 },
        { label: "Width", value: 1 },
      ],
      default: 0,
    },
  ],
  evaluate({ geometry, palette, width }, params) {
    const vertices = geometry.reduce((sum, g) => sum + g.vertexCount, 0);
    const base = params.mode === 1 ? width : vertices + (palette ? 1 : 0);
    return { total: base * params.scale };
  },
});

function makeRegistry(): OperatorRegistry {
  return new OperatorRegistry().register(points).register(tally);
}

const ENV: EnvValues = { width: 64, height: 32, dpr: 1, seed: 1 };

function graph(nodes: Graph["nodes"], wires: Wire[]): Graph {
  return { id: "define", name: "Define", nodes, wires };
}

const fromWidth: Wire = { from: "$env", output: "width", to: "t", input: "width" };

// ─── defineOperator ──────────────────────────────────────────────

describe("defineOperator", () => {
  test("returns an Operator that the registry and the cook take as it is", () => {
    const erased: Operator = tally;
    expect(makeRegistry().resolve("tally")).toBe(erased);
  });

  test("a cook hands evaluate its typed inputs and resolved params", () => {
    const g = graph(
      {
        a: { type: "points", params: { count: 3 } },
        b: { type: "points" },
        t: { type: "tally", params: { scale: 2 } },
      },
      [
        { from: "a", output: "geometry", to: "t", input: "geometry" },
        { from: "b", output: "geometry", to: "t", input: "geometry" },
        fromWidth,
      ],
    );
    const engine = new CookEngine(g, makeRegistry());
    engine.cook(ENV);
    expect(engine.getOutput("t")).toEqual({ total: (3 + 2) * 2 });
  });

  test("an unwired variadic input arrives as [], so evaluate can treat it as an array", () => {
    const engine = new CookEngine(graph({ t: { type: "tally" } }, [fromWidth]), makeRegistry());
    engine.cook(ENV);
    expect(engine.stats.errors.size).toBe(0);
    expect(engine.getOutput("t")).toEqual({ total: 0 });
  });
});

// ─── Types ───────────────────────────────────────────────────────

describe("defineOperator types", () => {
  type Evaluate = typeof tally.evaluate;
  type Inputs = Parameters<Evaluate>[0];
  type Params = Parameters<Evaluate>[1];

  test("an input is an array on a variadic port, T | undefined on an optional one", () => {
    expectTypeOf<Inputs>().toEqualTypeOf<{
      geometry: Geometry<2>[];
      palette: Palette | undefined;
      width: number;
    }>();
  });

  test("params name exactly the declared keys", () => {
    expectTypeOf<Params>().toEqualTypeOf<{ scale: number; mode: number }>();
  });

  test("evaluate returns a record of its output ports' values", () => {
    expectTypeOf<ReturnType<Evaluate>>().toEqualTypeOf<{ total: number }>();
    expectTypeOf<ReturnType<typeof points.evaluate>>().toEqualTypeOf<{
      geometry: Geometry<2>;
    }>();
  });

  test("reading an undeclared input or param does not compile", () => {
    defineOperator({
      id: "undeclared",
      category: "top",
      label: "Undeclared",
      inputs: [{ name: "n", type: "number" }],
      outputs: [{ name: "n", type: "number" }],
      params: [{ key: "k", label: "K", min: 0, max: 1, step: 1, default: 0 }],
      evaluate(inputs, params) {
        // @ts-expect-error: "m" is not a declared input
        inputs.m;
        // @ts-expect-error: "nope" is not a declared param
        params.nope;
        return { n: inputs.n + params.k };
      },
    });
  });

  test("returning a value of the wrong type for an output port does not compile", () => {
    defineOperator({
      id: "wrong-output",
      category: "sop",
      label: "Wrong Output",
      inputs: [],
      outputs: [{ name: "geometry", type: "geo2" }],
      params: [],
      // @ts-expect-error: a geo2 port carries a Geometry<2>, not a Geometry<3>
      evaluate() {
        return {
          geometry: { positions: new Float32Array(0), vertexCount: 0, dim: 3, topology: "points" },
        };
      },
    });
  });
});
