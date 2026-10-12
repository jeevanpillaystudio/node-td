import { serialize } from "bun:jsc";
import { describe, expect, test } from "bun:test";
import {
  abs,
  add,
  apply,
  c,
  clamp,
  div,
  type FieldExpr,
  fatan2,
  fbmExpr,
  floor,
  fmax,
  fmin,
  fpow,
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
import type { CompiledField } from "./glsl";

// ─── Running compileField ────────────────────────────────────────
//
// compileField once looped forever on fbm, warp and apply, growing memory
// by gigabytes a second. bun cannot time out a test whose code never
// yields, and a terminated worker keeps running for seconds, so every
// compile here runs in a child bun process that is killed at a deadline:
// a compiler that does not return fails its test instead of hanging the
// run. After one miss the rest are not run, so a hang costs one deadline.
//
// The FieldExprs of the real operators and patches are compiled by the
// operators' golden tests and the patches' field-glsl test, which can
// reach them; the kernel cannot depend on those packages.

const DEADLINE_MS = 2_000;

const COMPILE_SCRIPT = `
import { deserialize } from "bun:jsc";
import { compileField } from ${JSON.stringify(new URL("./glsl.ts", import.meta.url).href)};
const expr = deserialize(new Uint8Array(await Bun.stdin.arrayBuffer()));
let result;
try {
  result = { compiled: compileField(expr) };
} catch (error) {
  result = { error: error instanceof Error ? error.message : String(error) };
}
process.stdout.write(JSON.stringify(result));
`;

/** Set when a compile misses the deadline. */
let hung = false;

/**
 * compileField(expr) in a child process. Throws compileField's own
 * error, or when it has not returned by the deadline. The expression
 * crosses as a structured clone, which keeps NaN and Infinity, and the
 * sharing of sub-trees that the compiler keys on.
 */
function compile(expr: FieldExpr): CompiledField {
  if (hung) throw new Error("not compiled: an earlier compileField did not return");
  const child = Bun.spawnSync({
    cmd: [process.execPath, "-e", COMPILE_SCRIPT],
    stdin: serialize(expr, { binaryType: "nodebuffer" }),
    timeout: DEADLINE_MS,
    killSignal: "SIGKILL",
  });
  if (child.exitedDueToTimeout) {
    hung = true;
    throw new Error(`compileField did not return within ${DEADLINE_MS} ms`);
  }
  if (!child.success) throw new Error(`the compile process failed:\n${child.stderr.toString()}`);
  const { compiled, error } = JSON.parse(child.stdout.toString()) as {
    compiled?: CompiledField;
    error?: string;
  };
  if (!compiled) throw new Error(error);
  return compiled;
}

/**
 * What is wrong with the order of a shader's field functions. GLSL needs
 * a function defined before any call to it, and forbids recursion.
 */
function functionOrderIssues(source: string): string[] {
  const issues: string[] = [];
  const defined = new Set<string>();
  let current: string | undefined;
  for (const line of source.split("\n")) {
    const definition = /^float (field_fn_\d+)\(/.exec(line)?.[1];
    if (definition) {
      if (defined.has(definition)) issues.push(`${definition} is defined twice`);
      current = definition;
      continue;
    }
    if (line === "}") {
      if (current) defined.add(current);
      current = undefined;
      continue;
    }
    for (const [, name] of line.matchAll(/\b(field_fn_\d+)\(/g)) {
      if (name === current) issues.push(`${name} calls itself`);
      else if (name && !defined.has(name)) issues.push(`${name} is called before it is defined`);
    }
  }
  return issues;
}

/** The number of field functions a shader defines. */
function functionCount(source: string): number {
  return source.match(/^float field_fn_\d+\(/gm)?.length ?? 0;
}

/** The expression main() writes, from `float value = …;`. */
function mainValue(source: string): string | undefined {
  return /^ {2}float value = (.*);$/m.exec(source)?.[1];
}

// ─── Expressions ─────────────────────────────────────────────────
//
// The shapes the operators build, from the same builders: simplex- and
// perlin-noise, fbm, domain-warp, field-gradient, curl-angle and the
// field-remap modes, chained the way the gallery patches chain them.

const scale = u("noiseScale", 0.03);
const simplexNoise = mul(add(simplex(mul(X, scale), mul(Y, scale)), c(1)), c(0.5));
const perlinNoise = mul(add(perlin(mul(X, scale), mul(Y, scale)), c(1)), c(0.5));

function fbmOf(source: FieldExpr): FieldExpr {
  return fbmExpr(source, u("octaves", 6), u("lacunarity", 2), u("gain", 0.5), u("amplitude", 1));
}

function warpOf(source: FieldExpr, warp: FieldExpr): FieldExpr {
  return warpExpr(source, warp, u("warpAmount", 50), u("warpOffsetX", 100), u("warpOffsetY", 100));
}

function ridgeOf(source: FieldExpr): FieldExpr {
  return abs(sub(mul(c(2), source), c(1)));
}

/** field-gradient's dx: a central difference through apply. */
function gradientXOf(source: FieldExpr): FieldExpr {
  const eps = u("gradEps", 1);
  return mul(
    sub(apply(source, add(X, eps), Y), apply(source, sub(X, eps), Y)),
    u("gradInvEps2", 0.5),
  );
}

/** curl-angle: the angle of the rotated gradient, normalized to [0, 1]. */
function curlOf(source: FieldExpr): FieldExpr {
  const s = u("curlScale", 1);
  const eps = u("curlEps", 1);
  const inv = u("curlInvEps2", 0.5);
  const sx = mul(X, s);
  const sy = mul(Y, s);
  const dfdx = mul(sub(apply(source, add(sx, eps), sy), apply(source, sub(sx, eps), sy)), inv);
  const dfdy = mul(sub(apply(source, sx, add(sy, eps)), apply(source, sx, sub(sy, eps))), inv);
  return div(add(fatan2(neg(dfdx), dfdy), c(Math.PI)), c(2 * Math.PI));
}

const terrain = fbmOf(simplexNoise);

/** One expression rooted at each tag; the type makes sure no tag is missing. */
const BY_TAG: { [T in FieldExpr["tag"]]: FieldExpr } = {
  x: X,
  y: Y,
  const: c(1.75),
  uniform: u("k", -2.5),
  perlin: perlin(mul(X, c(0.37)), mul(Y, c(0.53))),
  simplex: simplex(mul(X, c(0.29)), mul(Y, c(0.41))),
  add: add(X, Y),
  sub: sub(X, Y),
  mul: mul(X, Y),
  div: div(X, Y),
  min: fmin(X, Y),
  max: fmax(X, Y),
  pow: fpow(X, c(1.5)),
  atan2: fatan2(Y, X),
  mix: mix(X, Y, c(0.25)),
  clamp: clamp(X, c(-1), c(2)),
  smoothstep: smoothstep(c(-1), c(4), X),
  abs: abs(Y),
  neg: neg(X),
  floor: floor(X),
  round: round(Y),
  apply: apply(sub(X, mul(Y, c(2))), Y, X),
  fbm: fbmExpr(perlinNoise, c(4), c(2), c(0.5), c(1.5)),
  warp: warpExpr(perlinNoise, simplexNoise, c(3), c(5.2), c(1.3)),
};

const CHAINS: Record<string, FieldExpr> = {
  "simplex-noise": simplexNoise,
  "perlin-noise": perlinNoise,
  "fbm of simplex (Terrain Heightmap's terrain)": terrain,
  "ridge of fbm (Terrain Heightmap's ridge)": ridgeOf(terrain),
  "power of fbm (Subscapes' height)": fpow(clamp(terrain, c(0), c(1)), u("power", 2)),
  "warp of fbm by simplex": warpOf(terrain, simplexNoise),
  "warp of simplex by fbm": warpOf(simplexNoise, terrain),
  "gradient of fbm": gradientXOf(terrain),
  "curl of simplex": curlOf(simplexNoise),
  "curl of ridge of fbm": curlOf(ridgeOf(terrain)),
  "apply of ridge of fbm": apply(ridgeOf(terrain), add(X, c(1)), Y),
  "fbm of fbm": fbmOf(fbmOf(perlinNoise)),
  "warp of warp": warpOf(warpOf(simplexNoise, perlinNoise), warpOf(perlinNoise, simplexNoise)),
  "fbm of a warp of a gradient": fbmOf(warpOf(gradientXOf(simplexNoise), terrain)),
  // The noise is a plain operand of apply's function first, and an fbm
  // source after: it must still be defined before that function.
  "a sub-tree inline in one function and a function of its own later": add(
    apply(add(simplexNoise, X), Y, X),
    fbmOf(simplexNoise),
  ),
  "field-math lerp of two fbms": mix(terrain, fbmOf(perlinNoise), u("mix", 0.5)),
  "field-remap quantize of a warp": div(
    round(mul(warpOf(terrain, perlinNoise), u("steps", 6))),
    u("stepsDiv", 6),
  ),
};

// ─── Tests ───────────────────────────────────────────────────────

describe("compileField terminates, with every field function defined before use", () => {
  const cases = [
    ...Object.entries(BY_TAG).map(([tag, expr]) => [`${tag} at the root`, expr] as const),
    ...Object.entries(CHAINS),
  ];
  for (const [name, expr] of cases) {
    test(name, () => {
      const { fragmentSource, vertexSource } = compile(expr);
      expect(fragmentSource.startsWith("#version 300 es\n")).toBe(true);
      expect(vertexSource.startsWith("#version 300 es\n")).toBe(true);
      expect(mainValue(fragmentSource)).toBeDefined();
      expect(functionOrderIssues(fragmentSource)).toEqual([]);
    });
  }
});

describe("field functions", () => {
  test("callees are numbered before their callers", () => {
    const { fragmentSource } = compile(warpOf(terrain, simplexNoise));
    // simplex (fbm's source and the warp field), fbm, then the warp
    expect(functionCount(fragmentSource)).toBe(3);
    expect(fragmentSource).toContain("sum += field_fn_0(x * freq, y * freq) * amp;");
    expect(fragmentSource).toContain("return field_fn_1(x + wx, y + wy);");
    expect(mainValue(fragmentSource)).toBe("field_fn_2(x, y)");
  });

  test("a sub-tree shared by several callers is defined once", () => {
    const { fragmentSource } = compile(curlOf(ridgeOf(terrain)));
    // simplex, fbm, and the ridge the four applies call
    expect(functionCount(fragmentSource)).toBe(3);
  });

  test("the fbm octave count is rounded as Math.round", () => {
    const { fragmentSource } = compile(terrain);
    expect(fragmentSource).toContain("for (int i = 0; i < int(floor(octaves + 0.5)); i++) {");
  });
});

describe("float literals", () => {
  const LITERALS: [number, string][] = [
    [0, "0.0"],
    [-0, "-0.0"],
    [5, "5.0"],
    [123456, "123456.0"],
    [0.5, "0.5"],
    [-0.25, "-0.25"],
    [1e-7, "1.0e-7"],
    [-2.5e-8, "-2.5e-8"],
    [1e21, "1.0e+21"],
    [3.4e38, "3.4e+38"],
  ];
  for (const [value, literal] of LITERALS) {
    test(`${Object.is(value, -0) ? "-0" : value} is written ${literal}`, () => {
      expect(mainValue(compile(c(value)).fragmentSource)).toBe(literal);
    });
  }

  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e39]) {
    test(`${value} has no literal and throws`, () => {
      expect(() => compile(mul(X, c(value)))).toThrow("has no GLSL float literal");
    });
  }

  test("unary minus is parenthesized, so a negative operand never forms --", () => {
    expect(mainValue(compile(neg(c(-5))).fragmentSource)).toBe("(-(-5.0))");
    expect(mainValue(compile(neg(X)).fragmentSource)).toBe("(-(x))");
  });
});

describe("noise library", () => {
  const library = (expr: FieldExpr) => {
    const { fragmentSource } = compile(expr);
    return {
      hashGrad: fragmentSource.includes("vec2 hashGrad("),
      perlin: fragmentSource.includes("float perlinNoise("),
      simplex: fragmentSource.includes("float simplexNoise("),
    };
  };

  test("no noise, no library", () => {
    expect(library(add(X, Y))).toEqual({ hashGrad: false, perlin: false, simplex: false });
  });

  test("simplex alone leaves out hashGrad, which only Perlin uses", () => {
    expect(library(terrain)).toEqual({ hashGrad: false, perlin: false, simplex: true });
  });

  test("Perlin brings hashGrad", () => {
    expect(library(perlinNoise)).toEqual({ hashGrad: true, perlin: true, simplex: false });
  });

  test("both noises", () => {
    expect(library(warpOf(simplexNoise, perlinNoise))).toEqual({
      hashGrad: true,
      perlin: true,
      simplex: true,
    });
  });
});

describe("shared operands are evaluated once", () => {
  test("div binds a computed denominator to a temporary", () => {
    const { fragmentSource } = compile(div(X, add(Y, c(1))));
    expect(fragmentSource).toContain("  float t_0 = (y + 1.0);\n");
    expect(mainValue(fragmentSource)).toBe("(t_0 == 0.0 ? 0.0 : x / t_0)");
    expect(fragmentSource.split("(y + 1.0)").length - 1).toBe(1);
  });

  test("div uses a leaf denominator as it is", () => {
    const { fragmentSource } = compile(div(X, u("d", 2)));
    expect(fragmentSource).not.toContain("t_0");
    expect(mainValue(fragmentSource)).toBe("(u_0 == 0.0 ? 0.0 : x / u_0)");
  });

  test("a temporary inside a field function is declared in that function", () => {
    const { fragmentSource } = compile(apply(div(X, add(Y, c(1))), Y, X));
    expect(fragmentSource).toContain(
      "float field_fn_0(float x, float y) {\n  float t_0 = (y + 1.0);\n  return (t_0 == 0.0 ? 0.0 : x / t_0);\n}",
    );
  });

  test("warp evaluates its amount once", () => {
    const amount = add(u("warpAmount", 50), c(1));
    const { fragmentSource } = compile(warpExpr(simplexNoise, perlinNoise, amount, c(100), c(100)));
    expect(fragmentSource.split("(u_1 + 1.0)").length - 1).toBe(1);
    expect(fragmentSource).toContain("  float amount = (u_1 + 1.0);\n");
  });
});

describe("uniforms", () => {
  test("a uniform node shared by several sub-trees is declared once", () => {
    const { fragmentSource, uniforms } = compile(simplexNoise);
    expect(uniforms).toEqual([{ glslName: "u_0", value: 0.03 }]);
    expect(fragmentSource.split("uniform float ").length - 1).toBe(1);
  });

  test("every uniform of a chain is declared and passed with its value", () => {
    const { fragmentSource, uniforms } = compile(warpOf(terrain, simplexNoise));
    // In the order analysis first meets them: noise scale, fbm, then warp
    expect(uniforms.map((uniform) => uniform.value)).toEqual([0.03, 6, 2, 0.5, 1, 50, 100, 100]);
    for (const { glslName } of uniforms) {
      expect(fragmentSource).toContain(`uniform float ${glslName};`);
    }
  });
});
