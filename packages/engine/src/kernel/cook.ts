import type { Graph, Wire } from "./graph";
import type { Operator, GraphEnv, PortType } from "./types";
import { GPUBuffer2D } from "./types";
import { topoSort } from "./graph";

// ─── Registry interface (avoids circular import) ─────────────────

interface RegistryLike {
  resolve(id: string): Operator;
}

// ─── Cook Stats ──────────────────────────────────────────────────

export interface CookStats {
  /** Number of nodes that were re-evaluated */
  cooked: number;
  /** Number of nodes that were skipped (cache hit) */
  cached: number;
  /** Total nodes in the graph */
  total: number;
  /** Wall-clock time of the cook pass (ms) */
  elapsed: number;
  /** Per-node timing for nodes that cooked (ms) */
  timing: Map<string, number>;
}

// ─── CookEngine ──────────────────────────────────────────────────

/**
 * Incremental graph evaluation engine with dirty-flag propagation.
 *
 * Modelled after TouchDesigner's cook loop:
 * - Nodes only re-evaluate when an upstream dependency changed.
 * - Outputs are cached per node between cooks.
 * - Dirty flags propagate forward through the DAG.
 *
 * Usage:
 *   const engine = new CookEngine(graph, registry);
 *   engine.setParams(values);        // diff against previous — dirty only what changed
 *   engine.cook(env);                // evaluate dirty nodes, cache results
 *   const buf = engine.findTerminalOutput<Buffer2D>("buffer");
 *   console.log(engine.stats);       // { cooked: 3, cached: 12, total: 15, ... }
 */
export class CookEngine {
  private readonly graph: Graph;
  private readonly registry: RegistryLike;

  // ── Pre-computed topology ──────────────────────────────────────
  private readonly order: string[];
  private readonly downstream: Map<string, Set<string>>;
  /** Per-node inbound wires — O(1) lookup during cook */
  private readonly wiresTo: Map<string, Wire[]>;
  /** For each $env output name → node keys directly wired to it */
  private readonly envDependents: Map<string, Set<string>>;
  /** Node keys with no downstream consumers */
  private readonly terminalKeys: Set<string>;
  /** Pre-computed variadic port names per node — avoids rebuilding per cook */
  private readonly variadicPorts: Map<string, Set<string>>;

  // ── Mutable state ──────────────────────────────────────────────
  private readonly cache = new Map<string, Record<string, unknown>>();
  private readonly dirty = new Set<string>();
  private prevParams: Record<string, number> = {};
  private prevEnvWires: Record<string, unknown> = {};
  private _stats: CookStats = { cooked: 0, cached: 0, total: 0, elapsed: 0, timing: new Map() };

  // ── Incremental cook cursor ────────────────────────────────────
  private _cursor = 0;
  private _incrEnv: GraphEnv | null = null;
  private _incrCooked = 0;
  private _incrTiming = new Map<string, number>();
  private _incrT0 = 0;
  private _incrParamIndex: Map<string, Record<string, number>> | null = null;

  constructor(graph: Graph, registry: RegistryLike) {
    this.graph = graph;
    this.registry = registry;

    // Topological order (reused every cook)
    this.order = topoSort(Object.keys(graph.nodes), graph.wires);

    // Build downstream adjacency (unique edges)
    this.downstream = new Map();
    for (const key of this.order) this.downstream.set(key, new Set());
    for (const w of graph.wires) {
      if (w.from === "$env") continue;
      this.downstream.get(w.from)?.add(w.to);
    }

    // Build per-node inbound wire index
    this.wiresTo = new Map();
    for (const key of this.order) this.wiresTo.set(key, []);
    for (const w of graph.wires) {
      this.wiresTo.get(w.to)?.push(w);
    }

    // Build env-wire dependents
    this.envDependents = new Map();
    for (const w of graph.wires) {
      if (w.from !== "$env") continue;
      if (!this.envDependents.has(w.output)) {
        this.envDependents.set(w.output, new Set());
      }
      this.envDependents.get(w.output)!.add(w.to);
    }

    // Pre-compute terminal nodes (no downstream consumers)
    const hasConsumer = new Set<string>();
    for (const w of graph.wires) {
      if (w.from !== "$env") hasConsumer.add(w.from);
    }
    this.terminalKeys = new Set<string>();
    for (const key of this.order) {
      if (!hasConsumer.has(key)) this.terminalKeys.add(key);
    }

    // Pre-compute variadic port names per node (once per graph)
    this.variadicPorts = new Map();
    for (const [key, instance] of Object.entries(graph.nodes)) {
      const op = registry.resolve(instance.type);
      const ports = new Set<string>();
      for (const port of op.inputs) {
        if (port.variadic) ports.add(port.name);
      }
      this.variadicPorts.set(key, ports);
    }

    // First cook is always full — all nodes start dirty
    for (const key of this.order) this.dirty.add(key);
  }

  // ── Dirty propagation ──────────────────────────────────────────

  /** BFS forward from `start`, marking every reachable node dirty. */
  private propagate(start: string): void {
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
   * Keys use the `"nodeKey.paramKey"` convention.
   */
  setParams(params: Record<string, number>): void {
    let changed = false;
    // Detect changed or new keys
    for (const [prefixed, value] of Object.entries(params)) {
      if (this.prevParams[prefixed] === value) continue;
      const dot = prefixed.indexOf(".");
      if (dot === -1) continue;
      this.propagate(prefixed.slice(0, dot));
      changed = true;
    }
    // Detect removed keys
    for (const prefixed of Object.keys(this.prevParams)) {
      if (prefixed in params) continue;
      const dot = prefixed.indexOf(".");
      if (dot === -1) continue;
      this.propagate(prefixed.slice(0, dot));
      changed = true;
    }
    this.prevParams = params;

    // If params changed during an incremental cook, restart it —
    // nodes before the cursor used stale params.
    if (changed && this._incrEnv !== null) {
      this._incrEnv = null;
      this._cursor = 0;
    }
  }

  // ── Cook ───────────────────────────────────────────────────────

  /**
   * Evaluate the graph incrementally.
   *
   * 1. Diffs env wire values (width, height, dpr) — dirties dependents.
   * 2. Walks topological order, skipping clean nodes.
   * 3. For dirty nodes, gathers inputs from pre-indexed wire map.
   * 4. Caches outputs; clears dirty set; records stats.
   *
   * Returns the cache Map (same shape as the old evaluateGraph return).
   */
  cook(env: GraphEnv): Map<string, Record<string, unknown>> {
    const t0 = performance.now();

    // Diff env wire values against previous
    for (const [envKey, dependents] of this.envDependents) {
      if (this.prevEnvWires[envKey] !== env[envKey]) {
        for (const nodeKey of dependents) this.propagate(nodeKey);
      }
    }
    // Snapshot env wire values for next diff
    const snap: Record<string, unknown> = {};
    for (const envKey of this.envDependents.keys()) snap[envKey] = env[envKey];
    this.prevEnvWires = snap;

    // Nothing dirty → no-op
    if (this.dirty.size === 0) {
      this._stats = { cooked: 0, cached: this.order.length, total: this.order.length, elapsed: performance.now() - t0, timing: new Map() };
      return this.cache;
    }

    // Walk in topological order, skip clean nodes
    let cooked = 0;
    const timing = new Map<string, number>();

    // Build per-node param index once (O(P) total instead of O(P) per node)
    const paramsByNode = this._buildParamIndex();

    for (const key of this.order) {
      if (!this.dirty.has(key)) continue;

      const instance = this.graph.nodes[key]!;
      const op = this.registry.resolve(instance.type);
      if (!op.evaluate) continue;

      // Gather inputs from pre-indexed wire map
      const nodeVariadic = this.variadicPorts.get(key)!;
      const inputs: Record<string, unknown> = {};
      const wires = this.wiresTo.get(key)!;
      for (const w of wires) {
        let value: unknown;
        if (w.from === "$env") {
          value = env[w.output];
        } else {
          const src = this.cache.get(w.from);
          if (src) value = src[w.output];
        }

        if (nodeVariadic.has(w.input)) {
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
      const ext = paramsByNode.get(key);
      if (ext) {
        for (const [k, v] of Object.entries(ext)) resolved[k] = v;
      }

      const nt0 = performance.now();
      this.cache.set(
        key,
        op.evaluate(inputs, resolved, env) as Record<string, unknown>,
      );
      timing.set(key, performance.now() - nt0);
      cooked++;
    }

    const cached = this.order.length - cooked;
    this.dirty.clear();
    this._stats = { cooked, cached, total: this.order.length, elapsed: performance.now() - t0, timing };
    return this.cache;
  }

  // ── Budgeted incremental cook ────────────────────────────────────

  /**
   * Cook the graph incrementally, yielding after `budgetMs` milliseconds.
   *
   * Call this in a requestAnimationFrame loop:
   *   function draw() {
   *     const result = engine.cookIncremental(env, 8);
   *     if (!result.done) { rafId = requestAnimationFrame(draw); return; }
   *     // blit terminal output
   *   }
   *
   * On the first call (or after a new dirty cycle), performs env diffing
   * and starts walking from the top of topological order. Subsequent
   * calls resume from where the budget was exhausted.
   *
   * Returns { done, progress } where progress is 0..1.
   */
  cookIncremental(env: GraphEnv, budgetMs: number): { done: boolean; progress: number } {
    // Start a new incremental cook if not already in progress
    if (this._incrEnv === null) {
      this._incrT0 = performance.now();

      // Diff env wire values
      for (const [envKey, dependents] of this.envDependents) {
        if (this.prevEnvWires[envKey] !== env[envKey]) {
          for (const nodeKey of dependents) this.propagate(nodeKey);
        }
      }
      const snap: Record<string, unknown> = {};
      for (const envKey of this.envDependents.keys()) snap[envKey] = env[envKey];
      this.prevEnvWires = snap;

      // Nothing dirty → immediate completion
      if (this.dirty.size === 0) {
        this._stats = { cooked: 0, cached: this.order.length, total: this.order.length, elapsed: 0, timing: new Map() };
        return { done: true, progress: 1 };
      }

      this._incrEnv = env;
      this._cursor = 0;
      this._incrCooked = 0;
      this._incrTiming = new Map();
      this._incrParamIndex = this._buildParamIndex();
    }

    const deadline = performance.now() + budgetMs;
    const paramsByNode = this._incrParamIndex!;

    while (this._cursor < this.order.length) {
      const key = this.order[this._cursor]!;
      this._cursor++;

      if (!this.dirty.has(key)) continue;

      const instance = this.graph.nodes[key]!;
      const op = this.registry.resolve(instance.type);
      if (!op.evaluate) continue;

      // Gather inputs (same logic as cook())
      const nodeVariadic = this.variadicPorts.get(key)!;
      const inputs: Record<string, unknown> = {};
      const wires = this.wiresTo.get(key)!;
      for (const w of wires) {
        let value: unknown;
        if (w.from === "$env") {
          value = env[w.output];
        } else {
          const src = this.cache.get(w.from);
          if (src) value = src[w.output];
        }
        if (nodeVariadic.has(w.input)) {
          if (!Array.isArray(inputs[w.input])) inputs[w.input] = [];
          (inputs[w.input] as unknown[]).push(value);
        } else {
          inputs[w.input] = value;
        }
      }

      const resolved: Record<string, number> = {};
      for (const p of op.params) resolved[p.key] = p.default;
      if (instance.params) {
        for (const [k, v] of Object.entries(instance.params)) resolved[k] = v;
      }
      const ext = paramsByNode.get(key);
      if (ext) {
        for (const [k, v] of Object.entries(ext)) resolved[k] = v;
      }

      const nt0 = performance.now();
      this.cache.set(key, op.evaluate(inputs, resolved, env) as Record<string, unknown>);
      this._incrTiming.set(key, performance.now() - nt0);
      this._incrCooked++;

      // Check budget after each node
      if (performance.now() >= deadline && this._cursor < this.order.length) {
        return { done: false, progress: this._cursor / this.order.length };
      }
    }

    // Completed
    const cached = this.order.length - this._incrCooked;
    this.dirty.clear();
    this._stats = {
      cooked: this._incrCooked,
      cached,
      total: this.order.length,
      elapsed: performance.now() - this._incrT0,
      timing: this._incrTiming,
    };

    // Reset incremental state
    this._incrEnv = null;
    this._cursor = 0;
    this._incrParamIndex = null;

    return { done: true, progress: 1 };
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
    // Reset incremental cook state
    this._incrEnv = null;
    this._cursor = 0;
    this._incrParamIndex = null;
  }

  /**
   * Drop all cached node outputs and mark everything dirty.
   *
   * Prefer `dispose()` when tearing down the engine, or simply
   * let the incremental dirty-flag system avoid unnecessary re-cooks.
   * Only call this if you need to force a full re-evaluation.
   */
  clearCache(): void {
    this._disposeGPUResources();
    this.cache.clear();
    for (const key of this.order) this.dirty.add(key);
    // Reset incremental cook state
    this._incrEnv = null;
    this._cursor = 0;
    this._incrParamIndex = null;
  }

  /**
   * Release all GPU resources held by cached outputs.
   *
   * Call when the engine is no longer needed (component unmount,
   * graph change). GPU textures and framebuffers are NOT garbage
   * collected — they must be explicitly deleted.
   */
  dispose(): void {
    this._disposeGPUResources();
    this.cache.clear();
  }

  /** True if any node needs re-evaluation. */
  get needsCook(): boolean {
    return this.dirty.size > 0;
  }

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Build a per-node param index from prevParams.
   * O(P) total instead of O(P) per node during cook.
   */
  private _buildParamIndex(): Map<string, Record<string, number>> {
    const index = new Map<string, Record<string, number>>();
    for (const [prefixed, value] of Object.entries(this.prevParams)) {
      const dot = prefixed.indexOf(".");
      if (dot === -1) continue;
      const nodeKey = prefixed.slice(0, dot);
      let nodeParams = index.get(nodeKey);
      if (!nodeParams) {
        nodeParams = {};
        index.set(nodeKey, nodeParams);
      }
      nodeParams[prefixed.slice(dot + 1)] = value;
    }
    return index;
  }

  /** Walk all cached outputs and dispose any GPU resources. */
  private _disposeGPUResources(): void {
    for (const outputs of this.cache.values()) {
      for (const value of Object.values(outputs)) {
        if (value instanceof GPUBuffer2D) {
          value.dispose();
        }
      }
    }
  }
}
