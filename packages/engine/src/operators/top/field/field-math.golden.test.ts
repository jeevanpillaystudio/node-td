import { type OpFixture, opGolden, w } from "../../../../test/support/op-golden";
import { fieldMath } from "./field-math";

const a = { type: "simplex-noise" };
const b = { type: "perlin-noise" };

const MODES: [string, Record<string, number>][] = [
  ["Add", { mode: 0 }],
  ["Multiply", { mode: 1 }],
  ["Min", { mode: 2 }],
  ["Max", { mode: 3 }],
  ["Lerp, mix 0.25", { mode: 4, mix: 0.25 }],
];

const fixtures: Record<string, OpFixture> = {};
for (const [name, params] of MODES) {
  // FieldExpr path: both inputs carry an expression
  fixtures[name] = {
    nodes: { a, b, math: { type: "field-math", params } },
    wires: [w("a.field", "math.a"), w("b.field", "math.b")],
  };
  // Closure path: one input without an expression is enough
  fixtures[`${name}, opaque a`] = {
    nodes: { a, b, opaque: { type: "fixture-opaque-field" }, math: { type: "field-math", params } },
    wires: [w("a.field", "opaque.field"), w("opaque.field", "math.a"), w("b.field", "math.b")],
  };
}

opGolden(fieldMath, fixtures);
