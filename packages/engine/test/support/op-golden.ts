import { describe, expect, test } from "bun:test";
import type {
  Buffer2D,
  Field2D,
  Geometry,
  Graph,
  NodeInstance,
  Operator,
  OperatorRegistry,
  Wire,
} from "../../src/index";
import { isEnumParam, validateGraph } from "../../src/index";
import { cookGraph } from "./cook";

/**
 * Operator goldens — one colocated <op>.golden.test.ts per registered
 * operator. Each fixture is the smallest graph that exercises the
 * operator (or one code path of it), cooked once at seed 42; the snapshot
 * holds a digest of every node output plus the canvas log digest.
 *
 * Fixtures must stay valid graphs with declared, in-range params, so
 * they keep cooking when the engine starts validating on construction.
 */

export interface OpFixture {
  nodes: Record<string, NodeInstance>;
  wires: Wire[];
  /** Cook size; 256 × 256 at dpr 1 unless given */
  width?: number;
  height?: number;
  dpr?: number;
}

/** The nodes and wires of a fixture: the fragment fixtures are assembled from. */
export type FixtureGraph = Pick<OpFixture, "nodes" | "wires">;

export type { NodeInstance };

export const OP_GOLDEN_SEED = 42;

/** `w("noise.field", "fbm.field")` is the wire noise.field → fbm.field; `$env.width` names an env output. */
export function w(from: string, to: string): Wire {
  const [fromKey, output] = splitPort(from);
  const [toKey, input] = splitPort(to);
  return { from: fromKey, output, to: toKey, input };
}

function splitPort(ref: string): [string, string] {
  const dot = ref.indexOf(".");
  if (dot <= 0 || dot === ref.length - 1) throw new Error(`w: expected "node.port", got "${ref}"`);
  return [ref.slice(0, dot), ref.slice(dot + 1)];
}

// ─── Fixture-only operators ──────────────────────────────────────
//
// They reach code paths that no registered operator can feed today.
// They are registered only for op goldens, never in the default registry.

/** Wraps a field in a plain closure, dropping its FieldExpr, so consumers take their closure path. */
const opaqueField: Operator<{ field: Field2D }, { field: Field2D }> = {
  id: "fixture-opaque-field",
  category: "top",
  label: "Opaque Field (fixture)",
  inputs: [{ name: "field", type: "field" }],
  outputs: [{ name: "field", type: "field" }],
  params: [],
  evaluate({ field }) {
    return { field: (x: number, y: number) => field(x, y) };
  },
};

/**
 * A deterministic RGBA image with no backing canvas, so composite takes its
 * CPU path. Base: opaque red/green ramps. Overlay: alpha ramps from 0 at the
 * left edge to 1 at the right, so it has transparent and translucent pixels.
 */
const fixtureImage: Operator<{ width: number; height: number }, { buffer: Buffer2D }> = {
  id: "fixture-image",
  category: "top",
  label: "Image (fixture)",
  inputs: [
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "buffer", type: "buffer" }],
  params: [
    {
      key: "pattern",
      label: "Pattern",
      kind: "enum",
      options: [
        { label: "Base", value: 0 },
        { label: "Overlay", value: 1 },
      ],
      default: 0,
    },
  ],
  evaluate({ width, height }, params) {
    const data = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = width > 1 ? x / (width - 1) : 0;
        const v = height > 1 ? y / (height - 1) : 0;
        const i = (y * width + x) * 4;
        if (params.pattern === 1) {
          data[i] = 1 - v;
          data[i + 1] = 0.25;
          data[i + 2] = u;
          data[i + 3] = u;
        } else {
          data[i] = u;
          data[i + 1] = v;
          data[i + 2] = 0.5;
          data[i + 3] = 1;
        }
      }
    }
    return { buffer: { data, width, height, channels: 4 } };
  },
};

/** One zig-zag line strip with no stripOffsets: an implicit single strip. */
const fixturePolyline: Operator<{ width: number; height: number }, { geometry: Geometry<2> }> = {
  id: "fixture-polyline",
  category: "sop",
  label: "Polyline (fixture)",
  inputs: [
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [],
  evaluate({ width, height }) {
    const n = 12;
    const positions = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      positions[i * 2] = (i / (n - 1)) * width;
      positions[i * 2 + 1] = height * (i % 2 === 0 ? 0.25 : 0.75);
    }
    return { geometry: { positions, vertexCount: n, dim: 2, topology: "line-strip" } };
  },
};

export const fixtureOperators: readonly Operator[] = [opaqueField, fixtureImage, fixturePolyline];

/** A registry from the package under test plus the fixture-only operators. */
export function fixtureRegistry(createRegistry: () => OperatorRegistry): OperatorRegistry {
  const registry = createRegistry();
  for (const op of fixtureOperators) registry.register(op);
  return registry;
}

// ─── Fixture checks ──────────────────────────────────────────────

/** Instance params that are undeclared or outside their declared range. */
function paramIssues(graph: Graph, registry: OperatorRegistry): string[] {
  const issues: string[] = [];
  for (const [key, instance] of Object.entries(graph.nodes)) {
    const op = registry.resolve(instance.type);
    for (const [k, v] of Object.entries(instance.params ?? {})) {
      const def = op.params.find((p) => p.key === k);
      if (!def) {
        issues.push(`${key}.${k}: not a param of ${op.id}`);
      } else if (isEnumParam(def)) {
        if (!def.options.some((o) => o.value === v))
          issues.push(`${key}.${k}: ${v} is not an option`);
      } else if (v < def.min || v > def.max) {
        issues.push(`${key}.${k}: ${v} is outside [${def.min}, ${def.max}]`);
      }
    }
  }
  return issues;
}

// ─── Golden registration ─────────────────────────────────────────

export interface OpGoldens {
  /**
   * Register golden tests for one operator: a check that it is the
   * operator the default registry resolves, then one snapshot per fixture.
   */
  opGolden(op: Operator, fixtures: Record<string, OpFixture>): void;
}

/**
 * Bind the op goldens to the package under test, which passes in its
 * default registry. The helpers take it as an argument so they can live
 * in a package of their own: that package cannot depend on the operators
 * it tests, because they depend on it for their tests and turbo rejects
 * the cycle.
 */
export function opGoldens(createRegistry: () => OperatorRegistry): OpGoldens {
  return { opGolden: (op, fixtures) => opGolden(createRegistry, op, fixtures) };
}

function opGolden(
  createRegistry: () => OperatorRegistry,
  op: Operator,
  fixtures: Record<string, OpFixture>,
): void {
  describe(`${op.id} golden`, () => {
    test("is the registered operator", () => {
      expect(createRegistry().resolve(op.id)).toBe(op);
    });

    for (const [name, fixture] of Object.entries(fixtures)) {
      test(name, () => {
        const registry = fixtureRegistry(createRegistry);
        const graph: Graph = {
          id: `${op.id} ${name}`,
          name,
          nodes: fixture.nodes,
          wires: fixture.wires,
        };
        expect(Object.values(graph.nodes).some((n) => n.type === op.id)).toBe(true);
        validateGraph(graph, registry);
        expect(paramIssues(graph, registry)).toEqual([]);

        const { nodes, render } = cookGraph(graph, {
          width: fixture.width ?? 256,
          height: fixture.height ?? 256,
          dpr: fixture.dpr ?? 1,
          seed: OP_GOLDEN_SEED,
          registry,
        });
        expect({ nodes, render }).toMatchSnapshot();
      });
    }
  });
}
