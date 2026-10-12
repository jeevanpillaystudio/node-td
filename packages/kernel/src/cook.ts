import { type EnvOutput, isEnvSource } from "./env";
import type { Graph, Wire } from "./graph";
import { type RngState, SeededRNG } from "./rng";
import type {
  Capabilities,
  EnvKey,
  EnvValues,
  NodeEnv,
  NodeRng,
  Operator,
  PortType,
} from "./types";
import { topoSort, validateGraph } from "./graph";

// ─── Registry interface (avoids circular import) ─────────────────

interface RegistryLike {
  has(id: string): boolean;
  resolve(id: string): Operator;
}

// ─── Host clock ──────────────────────────────────────────────────

/**
 * The monotonic clock every host runtime provides (browsers, bun, node).
 * The kernel compiles with lib ES2022 and no DOM or node types, so it
 * declares only the part of the global it reads.
 */
declare const performance: { now(): number };

// ─── Environment ─────────────────────────────────────────────────

/** Every env value setEnv diffs; the Record type keeps the list complete. */
const ENV_KEYS = Object.keys({
  width: true,
  height: true,
  dpr: true,
  seed: true,
} satisfies Record<EnvKey, true>) as EnvKey[];

/** Where the random stream stood when a node last cooked, and where the node left it. */
interface StreamSpan {
  start: RngState;
  end: RngState;
}

function sameState(a: RngState, b: RngState): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

// ─── Cook Stats ──────────────────────────────────────────────────

/** Why a node has no output after a cook. */
export type NodeError =
  /** Its operator threw while evaluating it */
  | { kind: "error"; error: unknown }
  /** It was not evaluated, because `cause`, a node upstream of it, threw */
  | { kind: "skipped"; cause: string };

export interface CookStats {
  /** Number of nodes that were re-evaluated */
  cooked: number;
  /** Number of clean nodes, whose cached outputs were reused */
  cached: number;
  /** Total nodes in the graph: cooked + cached + errors.size */
  total: number;
  /** Wall-clock time of the cook pass (ms) */
  elapsed: number;
  /** Per-node timing for nodes that cooked (ms) */
  timing: Map<string, number>;
  /** Nodes that threw, and the nodes downstream of them that were skipped, in cook order */
  errors: Map<string, NodeError>;
}

// ─── CookEngine ──────────────────────────────────────────────────

/**
 * Incremental graph evaluation engine with dirty-flag propagation.
 *
 * Modelled after TouchDesigner's cook loop:
 * - Nodes only re-evaluate when an upstream dependency changed: a param
 *   (setParams), an env value they read (setEnv), or the random stream.
 * - Outputs are cached per node between cooks.
 * - Dirty flags propagate forward through the DAG.
 * - An incremental cook gives every node the output a full cook would,
 *   random draws included (see run).
 * - A node that throws is flagged with its error, and so are the nodes
 *   downstream of it, which are skipped; independent branches still cook.
 *   They stay dirty and keep no output, so the next cook tries them again.
 *
 * The constructor runs validateGraph and throws its GraphValidationError,
 * so a cook only ever sees a well-formed graph.
 *
 * Usage:
 *   const engine = new CookEngine(graph, registry);
 *   engine.setParams(values);        // diff against previous — dirty only what changed
 *   engine.cook(env);                // setEnv(values, capabilities), then run()
 *   const buf = engine.findTerminalOutput<Buffer2D>("buffer");
 *   console.log(engine.stats);       // { cooked: 3, cached: 12, total: 15, errors, ... }
 */
export class CookEngine {
  private readonly graph: Graph;
  private readonly registry: RegistryLike;

  // ── Pre-computed topology ──────────────────────────────────────
  private readonly order: string[];
  private readonly downstream: Map<string, Set<string>>;
  /** Per-node inbound wires — O(1) lookup during cook */
  private readonly wiresTo: Map<string, Wire[]>;
  /** For each env key → nodes that read it, through a $env wire or their operator's envReads */
  private readonly envReaders: Map<EnvKey, Set<string>>;
  /** Node keys with no downstream consumers */
  private readonly terminalKeys: Set<string>;

  // ── Mutable state ──────────────────────────────────────────────
  private readonly cache = new Map<string, Record<string, unknown>>();
  private readonly dirty = new Set<string>();
  private prevParams: Record<string, number> = {};
  /** The env values of the last setEnv; undefined before the first */
  private values: EnvValues | undefined;
  private capabilities: Capabilities = {};
  /** Node key → the random stream around its last successful cook */
  private readonly streamAt = new Map<string, StreamSpan>();
  private _stats: CookStats = {
    cooked: 0,
    cached: 0,
    total: 0,
    elapsed: 0,
    timing: new Map(),
    errors: new Map(),
  };

  constructor(graph: Graph, registry: RegistryLike) {
    validateGraph(graph, registry);
    this.graph = graph;
    this.registry = registry;

    // Topological order (reused every cook)
    this.order = topoSort(Object.keys(graph.nodes), graph.wires);

    // Build downstream adjacency (unique edges)
    this.downstream = new Map();
    for (const key of this.order) this.downstream.set(key, new Set());
    for (const w of graph.wires) {
      if (isEnvSource(w.from)) continue;
      this.downstream.get(w.from)?.add(w.to);
    }

    // Build per-node inbound wire index
    this.wiresTo = new Map();
    for (const key of this.order) this.wiresTo.set(key, []);
    for (const w of graph.wires) {
      this.wiresTo.get(w.to)?.push(w);
    }

    // Build env readers: $env wires, then each operator's envReads
    this.envReaders = new Map(ENV_KEYS.map((envKey) => [envKey, new Set<string>()]));
    for (const w of graph.wires) {
      if (isEnvSource(w.from)) this.envReaders.get(w.output as EnvOutput)!.add(w.to);
    }
    for (const key of this.order) {
      const op = registry.resolve(graph.nodes[key]!.type);
      for (const envKey of op.envReads ?? []) this.envReaders.get(envKey)?.add(key);
    }

    // Pre-compute terminal nodes (no downstream consumers)
    const hasConsumer = new Set<string>();
    for (const w of graph.wires) {
      if (!isEnvSource(w.from)) hasConsumer.add(w.from);
    }
    this.terminalKeys = new Set<string>();
    for (const key of this.order) {
      if (!hasConsumer.has(key)) this.terminalKeys.add(key);
    }

    // First cook is always full — all nodes start dirty
    for (const key of this.order) this.dirty.add(key);
  }

  // ── Dirty propagation ──────────────────────────────────────────

  /** BFS forward from `start`, marking every reachable node dirty. */
  private propagate(start: string): void {
    // A param key naming no node dirties nothing
    if (!this.downstream.has(start)) return;
    if (this.dirty.has(start)) return;
    const queue = [start];
    while (queue.length) {
      const key = queue.pop()!;
      if (this.dirty.has(key)) continue;
      this.dirty.add(key);
      const children = this.downstream.get(key);
      if (!children) continue;
      for (const child of children) {
        if (!this.dirty.has(child)) queue.push(child);
      }
    }
  }

  // ── Parameter & env diffing ────────────────────────────────────

  /**
   * Set the full params record, diffing against previous values.
   * Only nodes whose params actually changed are marked dirty.
   * Keys use the `"nodeKey.paramKey"` convention. The record is copied,
   * so a caller that edits it in place and passes it again is diffed
   * correctly.
   */
  setParams(params: Record<string, number>): void {
    // Detect changed or new keys
    for (const [prefixed, value] of Object.entries(params)) {
      if (this.prevParams[prefixed] === value) continue;
      const dot = prefixed.indexOf(".");
      if (dot === -1) continue;
      this.propagate(prefixed.slice(0, dot));
    }
    // Detect removed keys
    for (const prefixed of Object.keys(this.prevParams)) {
      if (prefixed in params) continue;
      const dot = prefixed.indexOf(".");
      if (dot === -1) continue;
      this.propagate(prefixed.slice(0, dot));
    }
    this.prevParams = { ...params };
  }

  /**
   * Set the env values and capabilities the next run cooks with, diffing
   * the values against the previous ones. A changed value dirties the
   * nodes that read it, through a $env wire or their operator's envReads,
   * and everything downstream. A changed seed also dirties every node
   * that drew from the random stream. Capabilities are never diffed. Both
   * are copied, so needsCook is accurate as soon as this returns.
   */
  setEnv(values: EnvValues, capabilities: Capabilities = {}): void {
    const prev = this.values;
    const next: EnvValues = {
      width: values.width,
      height: values.height,
      dpr: values.dpr,
      seed: values.seed,
    };
    this.values = next;
    this.capabilities = { ...capabilities };
    // Nothing has cooked before the first setEnv, so every node is dirty
    if (!prev) return;

    for (const envKey of ENV_KEYS) {
      if (Object.is(prev[envKey], next[envKey])) continue;
      for (const nodeKey of this.envReaders.get(envKey)!) this.propagate(nodeKey);
      if (envKey !== "seed") continue;
      for (const [nodeKey, span] of this.streamAt) {
        if (!sameState(span.start, span.end)) this.propagate(nodeKey);
      }
    }
  }

  // ── Cook ───────────────────────────────────────────────────────

  /**
   * setEnv, then run: the env values are diffed, the capabilities
   * replaced, and the dirty nodes cooked. Returns what run returns.
   */
  cook(env: EnvValues & Capabilities): ReadonlyMap<string, Record<string, unknown>> {
    const { width, height, dpr, seed, ...capabilities } = env;
    this.setEnv({ width, height, dpr, seed }, capabilities);
    return this.run();
  }

  /**
   * Evaluate the graph incrementally, with the env of the last setEnv.
   *
   * 1. Walks topological order, skipping clean nodes.
   * 2. Cooks each dirty node (cookNode), unless a node upstream of it
   *    failed in this run, and caches its outputs.
   * 3. Clears the dirty flag of every node that cooked; records stats,
   *    with any failures in stats.errors.
   *
   * Every run draws from a fresh SeededRNG(seed), as a full cook does,
   * and records the stream's state before and after each node cooks. A
   * clean node that drew nothing is skipped. A clean node that drew is
   * skipped when the stream reaches it in the state it last cooked from,
   * and the stream jumps to where the node left it. Otherwise a node
   * before it now draws a different amount, so it and everything
   * downstream cook again. Either way every node draws what it would in a
   * full cook, so an incremental run gives a full cook's outputs.
   *
   * Never throws for a failing node. A failed node keeps no output and
   * stays dirty, so the next run cooks it again from where the stream
   * then stands. Returns a read-only view of the cache: node key →
   * outputs keyed by port name. A node that failed or was skipped has no
   * entry. Throws if setEnv was never called.
   */
  run(): ReadonlyMap<string, Record<string, unknown>> {
    const values = this.values;
    if (!values) throw new Error("CookEngine.run: call setEnv (or cook) first");
    const t0 = performance.now();

    // Nothing dirty → no-op: every clean node would replay its own span
    if (this.dirty.size === 0) {
      this._stats = {
        cooked: 0,
        cached: this.order.length,
        total: this.order.length,
        elapsed: performance.now() - t0,
        timing: new Map(),
        errors: new Map(),
      };
      return this.cache;
    }

    // One stream per run, shared by every node in cook order
    const stream = new SeededRNG(values.seed);
    const rng: NodeRng = { random: () => stream.random() };
    const env: NodeEnv = Object.freeze({ ...this.capabilities, ...values, rng });

    // Walk in topological order, skip clean nodes
    let cooked = 0;
    const timing = new Map<string, number>();
    const errors = new Map<string, NodeError>();

    for (const key of this.order) {
      if (!this.dirty.has(key)) {
        const span = this.streamAt.get(key);
        // It drew nothing, so its output does not depend on the stream
        if (span && sameState(span.start, span.end)) continue;
        // The stream reaches it where it last cooked from: replay its draws
        if (span && sameState(span.start, stream.getState())) {
          stream.setState(span.end);
          continue;
        }
        // A node before it drew a different amount: cook it and its descendants again
        this.propagate(key);
      }

      // Downstream of a failure: keep no stale output, and stay dirty
      const cause = this.failedUpstream(key, errors);
      if (cause !== undefined) {
        this.cache.delete(key);
        this.streamAt.delete(key);
        errors.set(key, { kind: "skipped", cause });
        continue;
      }

      const start = stream.getState();
      const nt0 = performance.now();
      try {
        this.cache.set(key, this.cookNode(key, env));
      } catch (error) {
        this.cache.delete(key);
        this.streamAt.delete(key);
        errors.set(key, { kind: "error", error });
        continue;
      }
      timing.set(key, performance.now() - nt0);
      this.streamAt.set(key, { start, end: stream.getState() });
      this.dirty.delete(key);
      cooked++;
    }

    const cached = this.order.length - cooked - errors.size;
    this._stats = {
      cooked,
      cached,
      total: this.order.length,
      elapsed: performance.now() - t0,
      timing,
      errors,
    };
    return this.cache;
  }

  /**
   * Evaluate one node from the current cache: gather its inputs from its
   * sources' cached outputs and the env, resolve its params, and call its
   * operator. Throws whatever the operator throws.
   */
  private cookNode(key: string, env: NodeEnv): Record<string, unknown> {
    const instance = this.graph.nodes[key]!;
    const op = this.registry.resolve(instance.type);
    if (!op.evaluate) throw new Error(`Operator "${op.id}" has no evaluate`);

    // Variadic port lookup
    const variadicPorts = new Set<string>();
    for (const port of op.inputs) {
      if (port.variadic) variadicPorts.add(port.name);
    }

    // Gather inputs from pre-indexed wire map
    const inputs: Record<string, unknown> = {};
    const wires = this.wiresTo.get(key)!;
    for (const w of wires) {
      let value: unknown;
      if (isEnvSource(w.from)) {
        value = env[w.output as EnvOutput];
      } else {
        const src = this.cache.get(w.from);
        if (src) value = src[w.output];
      }

      if (variadicPorts.has(w.input)) {
        if (!Array.isArray(inputs[w.input])) inputs[w.input] = [];
        (inputs[w.input] as unknown[]).push(value);
      } else {
        inputs[w.input] = value;
      }
    }

    // Resolve params: op defaults → instance overrides → external overrides
    const resolved: Record<string, number> = {};
    for (const p of op.params) resolved[p.key] = p.default;
    if (instance.params) {
      for (const [k, v] of Object.entries(instance.params)) resolved[k] = v;
    }
    const prefix = `${key}.`;
    for (const [k, v] of Object.entries(this.prevParams)) {
      if (k.startsWith(prefix)) resolved[k.slice(prefix.length)] = v;
    }

    return op.evaluate(inputs, resolved, env) as Record<string, unknown>;
  }

  /**
   * The node that threw upstream of `key` in this cook, found through
   * `key`'s first failed or skipped source, or undefined if none failed.
   */
  private failedUpstream(key: string, errors: Map<string, NodeError>): string | undefined {
    for (const w of this.wiresTo.get(key)!) {
      const failure = errors.get(w.from);
      if (failure) return failure.kind === "error" ? w.from : failure.cause;
    }
    return undefined;
  }

  // ── Accessors ──────────────────────────────────────────────────

  /** Stats from the most recent cook() call. */
  get stats(): Readonly<CookStats> {
    return this._stats;
  }

  /** Read the cached output record for a node (undefined if never cooked). */
  getOutput(nodeKey: string): Record<string, unknown> | undefined {
    return this.cache.get(nodeKey);
  }

  /** Find the first terminal output matching a port type. */
  findTerminalOutput<T>(portType: PortType): T | undefined {
    for (const nodeKey of this.terminalKeys) {
      const outputs = this.cache.get(nodeKey);
      if (!outputs) continue;
      const instance = this.graph.nodes[nodeKey];
      if (!instance) continue;
      const op = this.registry.resolve(instance.type);
      for (const port of op.outputs) {
        if (port.type === portType && outputs[port.name] != null) {
          return outputs[port.name] as T;
        }
      }
    }
    return undefined;
  }

  /** Force all nodes dirty — next cook() will be a full re-evaluation. */
  invalidateAll(): void {
    for (const key of this.order) this.dirty.add(key);
  }

  /**
   * Drop all cached node outputs and mark everything dirty.
   *
   * Call after blitting the terminal output to free intermediate
   * Float32Array buffers and canvases. Essential when many Frame
   * components coexist, as on the gallery page — without this, the
   * cached buffers of every panel persist at once, which at 2× DPR can
   * exhaust the browser tab's memory.
   *
   * The next cook() will be a full re-evaluation (identical to first cook).
   */
  clearCache(): void {
    this.cache.clear();
    this.streamAt.clear();
    for (const key of this.order) this.dirty.add(key);
  }

  /** True if any node needs re-evaluation. */
  get needsCook(): boolean {
    return this.dirty.size > 0;
  }
}
