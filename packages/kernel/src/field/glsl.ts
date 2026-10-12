import type { FieldExpr } from "./expr";

// ─── GLSL Field Compiler ─────────────────────────────────────────
//
// Compiles a FieldExpr AST to a GLSL ES 3.00 fragment shader that evaluates
// the field at every pixel. Output is a single float written to
// gl_FragColor.r (grayscale).
//
// Architecture:
//   1. Analysis pass — one walk of the expression DAG, each node once.
//      Finds sub-expressions used as functions (fbm and warp, and the
//      fields they or apply call at varying coords) and lists every node
//      in post order, so a node comes after all of its sub-expressions
//   2. Codegen pass — emit a GLSL function per function node, in that
//      post order, so each is defined before any function that calls it;
//      then inline everything else into main()
//   3. Library injection — include Perlin/Simplex noise when needed
//   4. Uniform collection — param-driven values become GLSL uniforms
//      so the shader can be reused across parameter changes
//
// compileField is a pure function of the expression: it keeps all of its
// state in a context it creates per call, and never mutates the AST.

// ─── Compiled output ─────────────────────────────────────────────

export interface CompiledField {
  /** GLSL fragment shader source (version 300 es) */
  fragmentSource: string;
  /** GLSL vertex shader source (fullscreen quad) */
  vertexSource: string;
  /** Uniform values to set before drawing (name → value) */
  uniforms: ReadonlyArray<{ readonly glslName: string; readonly value: number }>;
}

// ─── Noise library (GLSL) ────────────────────────────────────────

const GLSL_HASH = `
// Hash for gradient noise (replaces lookup table)
vec2 hashGrad(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
`;

const GLSL_PERLIN = `
float perlinNoise(float px, float py) {
  vec2 p = vec2(px, py);
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Quintic fade (matches CPU)
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n00 = dot(hashGrad(i), f);
  float n10 = dot(hashGrad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float n01 = dot(hashGrad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float n11 = dot(hashGrad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}
`;

const GLSL_SIMPLEX = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float simplexNoise(float px, float py) {
  vec2 v = vec2(px, py);
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

const GLSL_VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// ─── Analysis ────────────────────────────────────────────────────

interface CompileCtx {
  needsPerlin: boolean;
  needsSimplex: boolean;
  /** Every node analysed so far: a FieldExpr is a DAG, so shared sub-trees are walked once */
  seen: Set<FieldExpr>;
  /** Every node, in post order: each after all of its sub-expressions */
  postOrder: FieldExpr[];
  /** Sub-expressions that need their own GLSL function (called at varying coords) */
  fnNodes: Set<FieldExpr>;
  /** Uniform nodes → GLSL variable names */
  uniforms: Map<FieldExpr, string>;
}

/** The direct sub-expressions of a node. */
function children(expr: FieldExpr): readonly FieldExpr[] {
  switch (expr.tag) {
    case "x":
    case "y":
    case "const":
    case "uniform":
      return [];
    case "perlin":
    case "simplex":
      return [expr.px, expr.py];
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "min":
    case "max":
      return [expr.a, expr.b];
    case "pow":
      return [expr.base, expr.exp];
    case "atan2":
      return [expr.y, expr.x];
    case "mix":
      return [expr.a, expr.b, expr.t];
    case "clamp":
      return [expr.a, expr.lo, expr.hi];
    case "smoothstep":
      return [expr.edge0, expr.edge1, expr.x];
    case "abs":
    case "neg":
    case "floor":
    case "round":
      return [expr.a];
    case "apply":
      return [expr.fn, expr.ax, expr.ay];
    case "fbm":
      return [expr.source, expr.octaves, expr.lacunarity, expr.gain, expr.amplitude];
    case "warp":
      return [expr.source, expr.warp, expr.amount, expr.offsetX, expr.offsetY];
  }
}

/**
 * Walk the expression once. Marks the sub-expressions that must be
 * emitted as GLSL functions because they're evaluated at varying
 * coordinates (inside fbm/warp/apply), collects uniform nodes and noise
 * library needs, and records every node in post order.
 */
function analyze(expr: FieldExpr, ctx: CompileCtx): void {
  if (ctx.seen.has(expr)) return;
  ctx.seen.add(expr);

  switch (expr.tag) {
    case "perlin":
      ctx.needsPerlin = true;
      break;
    case "simplex":
      ctx.needsSimplex = true;
      break;
    case "fbm":
      // source is called at (x*freq, y*freq); fbm itself is a loop,
      // which can't be inlined
      ctx.fnNodes.add(expr.source);
      ctx.fnNodes.add(expr);
      break;
    case "warp":
      // source and warp are called at offset coords; warp itself gets a
      // function so its amount is evaluated once
      ctx.fnNodes.add(expr.source);
      ctx.fnNodes.add(expr.warp);
      ctx.fnNodes.add(expr);
      break;
    case "apply":
      // fn is called at computed coords
      ctx.fnNodes.add(expr.fn);
      break;
    case "uniform":
      ctx.uniforms.set(expr, `u_${ctx.uniforms.size}`);
      break;
  }

  for (const child of children(expr)) analyze(child, ctx);
  ctx.postOrder.push(expr);
}

// ─── Code generation ─────────────────────────────────────────────

/** Format a number as a GLSL float literal: always a mantissa with '.', then any exponent. */
function glFloat(n: number): string {
  // A value that is not finite as a 32-bit float has no GLSL literal
  if (!Number.isFinite(Math.fround(n))) {
    throw new RangeError(`compileField: ${n} has no GLSL float literal`);
  }
  if (Object.is(n, -0)) return "-0.0";
  const s = n.toString(); // "5", "-0.25", "1e-7", "1.5e+21"
  const e = s.indexOf("e");
  const mantissa = e < 0 ? s : s.slice(0, e);
  const exponent = e < 0 ? "" : s.slice(e);
  return (mantissa.includes(".") ? mantissa : `${mantissa}.0`) + exponent;
}

interface GenCtx {
  /** Function nodes → GLSL function names */
  fnNames: ReadonlyMap<FieldExpr, string>;
  uniforms: ReadonlyMap<FieldExpr, string>;
}

/**
 * The statements of one function body (or main) being generated:
 * temporaries for values the body uses more than once.
 */
interface Scope {
  readonly gen: GenCtx;
  readonly temps: string[];
}

/** Bind a value to a fresh temporary of the scope, so it is evaluated once. */
function bind(value: string, scope: Scope): string {
  const name = `t_${scope.temps.length}`;
  scope.temps.push(`float ${name} = ${value};`);
  return name;
}

function isLeaf(expr: FieldExpr): boolean {
  return children(expr).length === 0;
}

/**
 * Generate a GLSL expression string for a FieldExpr.
 * Sub-expressions registered as functions are emitted as function calls.
 */
function genExpr(expr: FieldExpr, scope: Scope): string {
  const fnName = scope.gen.fnNames.get(expr);
  if (fnName) return `${fnName}(x, y)`;
  return genInline(expr, scope);
}

/**
 * Generate a FieldExpr in place, even when it is a function node itself:
 * a function's body is its own expression with the function excluded.
 */
function genInline(expr: FieldExpr, scope: Scope): string {
  switch (expr.tag) {
    case "x":
      return "x";
    case "y":
      return "y";
    case "const":
      return glFloat(expr.value);
    case "uniform": {
      const uName = scope.gen.uniforms.get(expr);
      if (!uName) throw new Error("uniform not registered during analysis");
      return uName;
    }

    case "perlin":
      return `perlinNoise(${genExpr(expr.px, scope)}, ${genExpr(expr.py, scope)})`;
    case "simplex":
      return `simplexNoise(${genExpr(expr.px, scope)}, ${genExpr(expr.py, scope)})`;

    case "add":
      return `(${genExpr(expr.a, scope)} + ${genExpr(expr.b, scope)})`;
    case "sub":
      return `(${genExpr(expr.a, scope)} - ${genExpr(expr.b, scope)})`;
    case "mul":
      return `(${genExpr(expr.a, scope)} * ${genExpr(expr.b, scope)})`;
    case "div": {
      // The denominator is used twice: bind it unless it is a leaf
      const d = genExpr(expr.b, scope);
      const den = isLeaf(expr.b) ? d : bind(d, scope);
      return `(${den} == 0.0 ? 0.0 : ${genExpr(expr.a, scope)} / ${den})`;
    }
    case "min":
      return `min(${genExpr(expr.a, scope)}, ${genExpr(expr.b, scope)})`;
    case "max":
      return `max(${genExpr(expr.a, scope)}, ${genExpr(expr.b, scope)})`;
    case "pow":
      return `pow(max(0.0, ${genExpr(expr.base, scope)}), ${genExpr(expr.exp, scope)})`;
    case "atan2":
      return `atan(${genExpr(expr.y, scope)}, ${genExpr(expr.x, scope)})`;

    case "mix":
      return `mix(${genExpr(expr.a, scope)}, ${genExpr(expr.b, scope)}, ${genExpr(expr.t, scope)})`;
    case "clamp":
      return `clamp(${genExpr(expr.a, scope)}, ${genExpr(expr.lo, scope)}, ${genExpr(expr.hi, scope)})`;
    case "smoothstep":
      return `smoothstep(${genExpr(expr.edge0, scope)}, ${genExpr(expr.edge1, scope)}, ${genExpr(expr.x, scope)})`;

    case "abs":
      return `abs(${genExpr(expr.a, scope)})`;
    // Parenthesized, so a negative operand never forms "--"
    case "neg":
      return `(-(${genExpr(expr.a, scope)}))`;
    case "floor":
      return `floor(${genExpr(expr.a, scope)})`;
    case "round":
      return `(floor(${genExpr(expr.a, scope)} + 0.5))`;

    case "apply": {
      const fnN = scope.gen.fnNames.get(expr.fn);
      if (!fnN) throw new Error("apply target not registered as function");
      return `${fnN}(${genExpr(expr.ax, scope)}, ${genExpr(expr.ay, scope)})`;
    }

    // fbm and warp are always function nodes: genFunction emits their bodies
    case "fbm":
    case "warp":
      throw new Error(`${expr.tag} is emitted as a function, never inline`);
  }
}

/** The name of a registered function node. */
function fnNameOf(expr: FieldExpr, gen: GenCtx): string {
  const name = gen.fnNames.get(expr);
  if (!name) throw new Error(`${expr.tag} not registered as function`);
  return name;
}

/** Generate the GLSL definition of one function node. */
function genFunction(expr: FieldExpr, name: string, gen: GenCtx): string[] {
  const scope: Scope = { gen, temps: [] };
  const body: string[] = [];

  if (expr.tag === "fbm") {
    // FBM loop — params may be uniforms or consts, evaluated once at
    // (x, y) as evalExpr does
    const srcFn = fnNameOf(expr.source, gen);
    const octExpr = genExpr(expr.octaves, scope);
    const lacExpr = genExpr(expr.lacunarity, scope);
    const gainExpr = genExpr(expr.gain, scope);
    const ampExpr = genExpr(expr.amplitude, scope);
    body.push(`  float octaves = ${octExpr};`);
    body.push(`  float lacunarity = ${lacExpr};`);
    body.push(`  float gain = ${gainExpr};`);
    body.push(`  float amplitude = ${ampExpr};`);
    body.push(`  float sum = 0.0;`);
    body.push(`  float freq = 1.0;`);
    body.push(`  float amp = 1.0;`);
    body.push(`  float maxAmp = 0.0;`);
    // Rounded as Math.round, as evalExpr rounds the octave count
    body.push(`  for (int i = 0; i < int(floor(octaves + 0.5)); i++) {`);
    body.push(`    sum += ${srcFn}(x * freq, y * freq) * amp;`);
    body.push(`    maxAmp += amp;`);
    body.push(`    freq *= lacunarity;`);
    body.push(`    amp *= gain;`);
    body.push(`  }`);
    body.push(`  return (sum / maxAmp) * amplitude;`);
  } else if (expr.tag === "warp") {
    // Warp — params may be uniforms or consts; amount is used twice
    const srcFn = fnNameOf(expr.source, gen);
    const warpFn = fnNameOf(expr.warp, gen);
    const amtExpr = genExpr(expr.amount, scope);
    const oxExpr = genExpr(expr.offsetX, scope);
    const oyExpr = genExpr(expr.offsetY, scope);
    body.push(`  float amount = ${amtExpr};`);
    body.push(`  float wx = (${warpFn}(x, y) - 0.5) * 2.0 * amount;`);
    body.push(`  float wy = (${warpFn}(x + ${oxExpr}, y + ${oyExpr}) - 0.5) * 2.0 * amount;`);
    body.push(`  return ${srcFn}(x + wx, y + wy);`);
  } else {
    // Regular function — its own expression, inlined
    body.push(`  return ${genInline(expr, scope)};`);
  }

  return [
    `float ${name}(float x, float y) {`,
    ...scope.temps.map((t) => `  ${t}`),
    ...body,
    `}`,
    ``,
  ];
}

// ─── Public API ──────────────────────────────────────────────────

/** Compile a FieldExpr to GLSL ES 3.00 shaders. */
export function compileField(expr: FieldExpr): CompiledField {
  const ctx: CompileCtx = {
    needsPerlin: false,
    needsSimplex: false,
    seen: new Set(),
    postOrder: [],
    fnNodes: new Set(),
    uniforms: new Map(),
  };

  // Analysis — collect function boundaries, library needs, and uniforms
  analyze(expr, ctx);

  // Function nodes in post order, named in that order: callees first
  const functions = ctx.postOrder.filter((node) => ctx.fnNodes.has(node));
  const fnNames = new Map(functions.map((node, i) => [node, `field_fn_${i}`] as const));
  const gen: GenCtx = { fnNames, uniforms: ctx.uniforms };

  // Build fragment shader
  const parts: string[] = [];
  parts.push(`#version 300 es`);
  parts.push(`precision highp float;`);
  parts.push(`uniform vec2 uResolution;`);

  // Uniform declarations
  for (const [, glslName] of ctx.uniforms) {
    parts.push(`uniform float ${glslName};`);
  }

  parts.push(`out vec4 fragColor;`);
  parts.push(``);

  // Library functions — hashGrad is Perlin's gradient table
  if (ctx.needsPerlin) {
    parts.push(GLSL_HASH);
    parts.push(GLSL_PERLIN);
  }
  if (ctx.needsSimplex) {
    parts.push(GLSL_SIMPLEX);
  }

  // Generated field functions
  for (const node of functions) {
    parts.push(...genFunction(node, fnNameOf(node, gen), gen));
  }

  // Main
  const scope: Scope = { gen, temps: [] };
  const value = genExpr(expr, scope);
  parts.push(`void main() {`);
  parts.push(`  float x = gl_FragCoord.x;`);
  parts.push(`  float y = uResolution.y - gl_FragCoord.y;`); // Flip Y to match Canvas2D
  for (const t of scope.temps) parts.push(`  ${t}`);
  parts.push(`  float value = ${value};`);
  parts.push(`  fragColor = vec4(value, value, value, 1.0);`);
  parts.push(`}`);

  // Collect uniform values for the renderer
  const uniforms: Array<{ glslName: string; value: number }> = [];
  for (const [uExpr, glslName] of ctx.uniforms) {
    if (uExpr.tag === "uniform") {
      uniforms.push({ glslName, value: uExpr.value });
    }
  }

  return {
    fragmentSource: parts.join("\n"),
    vertexSource: GLSL_VERTEX,
    uniforms,
  };
}
