import { describe, expect, test } from "bun:test";
import {
  abs,
  add,
  apply,
  c,
  clamp,
  createField,
  div,
  evalExpr,
  FIELD_EXPR,
  type FieldExpr,
  fatan2,
  fbmExpr,
  floor,
  fmax,
  fmin,
  fpow,
  getFieldExpr,
  mix,
  mul,
  neg,
  perlin,
  round,
  simplex,
  smoothstep,
  sub,
  u,
  warpExpr,
  X,
  Y,
} from "./expr";

// Golden values are taken from the current CPU interpreter: they pin
// today's behaviour, they do not judge it.

const POINTS: readonly [number, number][] = [
  [0, 0],
  [0.5, -1.25],
  [3.7, 2.2],
  [-4.1, 7.9],
  [12.3, -0.6],
];

const n1 = perlin(mul(X, c(0.37)), mul(Y, c(0.53)));
const n2 = simplex(mul(X, c(0.29)), mul(Y, c(0.41)));

/** One expression per FieldExpr tag, rooted at that tag, with its values at POINTS. */
const GOLDEN: { [T in FieldExpr["tag"]]: { expr: FieldExpr; values: number[] } } = {
  x: { expr: X, values: [0, 0.5, 3.7, -4.1, 12.3] },
  y: { expr: Y, values: [0, -1.25, 2.2, 7.9, -0.6] },
  const: { expr: c(1.75), values: [1.75, 1.75, 1.75, 1.75, 1.75] },
  uniform: { expr: u("k", -2.5), values: [-2.5, -2.5, -2.5, -2.5, -2.5] },
  perlin: {
    expr: n1,
    values: [
      0, -0.003071442839439442, 0.5694213434888127, -0.20728491733525736, -0.2386614859137544,
    ],
  },
  simplex: {
    expr: n2,
    values: [0, -0.5549552140592888, -0.5691053103917549, 0.41520133368192946, -0.6498174749834782],
  },
  add: { expr: add(X, Y), values: [0, -0.75, 5.9, 3.8000000000000007, 11.700000000000001] },
  sub: { expr: sub(X, Y), values: [0, 1.75, 1.5, -12, 12.9] },
  mul: { expr: mul(X, Y), values: [0, -0.625, 8.14, -32.39, -7.38] },
  // division by zero gives 0, at (0, 0)
  div: {
    expr: div(X, Y),
    values: [0, -0.4, 1.6818181818181817, -0.5189873417721518, -20.500000000000004],
  },
  min: { expr: fmin(X, Y), values: [0, -1.25, 2.2, -4.1, -0.6] },
  max: { expr: fmax(X, Y), values: [0, 0.5, 3.7, 7.9, 12.3] },
  // a negative base is clamped to 0, at (-4.1, 7.9)
  pow: {
    expr: fpow(X, c(1.5)),
    values: [0, 0.3535533905932738, 7.117092102818398, 0, 43.13776767520545],
  },
  atan2: {
    expr: fatan2(Y, X),
    values: [0, -1.1902899496825317, 0.5364354576047312, 2.049518170790662, -0.04874185130993158],
  },
  mix: {
    expr: mix(X, Y, c(0.25)),
    values: [0, 0.0625, 3.325, -1.0999999999999996, 9.075000000000001],
  },
  clamp: { expr: clamp(X, c(-1), c(2)), values: [0, 0.5, 2, -1, 2] },
  smoothstep: {
    expr: smoothstep(c(-1), c(4), X),
    values: [0.10400000000000002, 0.216, 0.9896320000000001, 0, 1],
  },
  abs: { expr: abs(Y), values: [0, 1.25, 2.2, 7.9, 0.6] },
  neg: { expr: neg(X), values: [0, -0.5, -3.7, 4.1, -12.3] },
  floor: { expr: floor(X), values: [0, 0, 3, -5, 12] },
  round: { expr: round(Y), values: [0, -1, 2, 8, -1] },
  // evaluates x − 2y at (y, x)
  apply: {
    expr: apply(sub(X, mul(Y, c(2))), Y, X),
    values: [0, -2.25, -5.2, 16.1, -25.200000000000003],
  },
  fbm: {
    expr: fbmExpr(n1, c(4), c(2), c(0.5), c(1.5)),
    values: [
      0, -0.14598865914892922, 0.6827946987609894, -0.04158750916482683, -0.38142390244984625,
    ],
  },
  warp: {
    expr: warpExpr(n1, n2, c(3), c(5.2), c(1.3)),
    values: [
      0.18334677041598613, 0.2333793983907072, -0.4947104503411808, -0.5688687109732833,
      -0.1833893987029064,
    ],
  },
};

describe("evalExpr", () => {
  for (const [tag, { expr, values }] of Object.entries(GOLDEN)) {
    test(`${tag} at five fixed points`, () => {
      expect(expr.tag).toBe(tag as FieldExpr["tag"]);
      POINTS.forEach(([x, y], i) => {
        expect(evalExpr(expr, x, y)).toBeCloseTo(values[i] as number, 12);
      });
    });
  }
});

// ─── Noise ───────────────────────────────────────────────────────
//
// pnoise and simplex2 are reached through evalExpr's perlin and simplex
// tags, which call them with exactly these coordinates. The noise is
// plain arithmetic, so the values are pinned exactly.

const NOISE_POINTS: readonly [number, number][] = [
  [0.5, 0.5],
  [0.1, 0.9],
  [1.3, 2.7],
  [-0.4, 0.25],
  [-3.6, -7.2],
  [10.75, 3.125],
  [42.42, -17.17],
  [255.5, 0.5],
  [300.7, 511.3],
  [-1000.33, 66.6],
];

describe("noise", () => {
  test("pnoise at ten points", () => {
    const values = NOISE_POINTS.map(([x, y]) => evalExpr(perlin(c(x), c(y)), 0, 0));
    expect(values).toEqual([
      -0.5, -0.1982879999999997, -0.11005810367999991, 0.08675437500000009, -0.5835046502400006,
      0.24823683500289917, -0.07013981145723203, -0.25, 0.6932308790400211, 0.15439659727493615,
    ]);
  });

  test("simplex2 at ten points", () => {
    const values = NOISE_POINTS.map(([x, y]) => evalExpr(simplex(c(x), c(y)), 0, 0));
    expect(values).toEqual([
      -0.6143130272544324, -0.25613907312566875, 0.4374536938558955, 0.6615580050527833,
      0.7353118630227358, 0.011551596044320342, 0.17640374701539827, 0.001075244621047171,
      -0.16552769779410242, -0.16467150836622238,
    ]);
  });

  test("both are zero on the integer lattice", () => {
    for (const [x, y] of [
      [0, 0],
      [3, -7],
      [256, 512],
    ] as const) {
      expect(evalExpr(perlin(c(x), c(y)), 0, 0)).toBe(0);
    }
    expect(evalExpr(simplex(c(0), c(0)), 0, 0)).toBe(0);
  });
});

// ─── Field2D tagging ─────────────────────────────────────────────

describe("createField / getFieldExpr", () => {
  const expr = add(n1, mul(X, c(0.01)));

  test("a created field carries its expression", () => {
    expect(getFieldExpr(createField(expr))).toBe(expr);
  });

  test("a created field evaluates its expression", () => {
    const field = createField(expr);
    for (const [x, y] of POINTS) expect(field(x, y)).toBe(evalExpr(expr, x, y));
  });

  test("the expression hangs off a registered, non-enumerable symbol", () => {
    const field = createField(expr);
    expect(Symbol.keyFor(FIELD_EXPR)).toBeDefined();
    expect(Object.getOwnPropertyDescriptor(field, FIELD_EXPR)?.enumerable).toBe(false);
  });

  test("a plain closure carries no expression", () => {
    expect(getFieldExpr((x, y) => x + y)).toBeUndefined();
  });

  test("an expression survives a JSON round trip", () => {
    const copy = JSON.parse(JSON.stringify(getFieldExpr(createField(expr)))) as FieldExpr;
    expect(copy).toEqual(expr);
    const field = createField(copy);
    for (const [x, y] of POINTS) expect(field(x, y)).toBe(evalExpr(expr, x, y));
  });
});
