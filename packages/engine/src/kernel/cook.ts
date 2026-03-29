import type { Graph, Wire } from "./graph";
import type { Operator, GraphEnv, PortType } from "./types";
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

  // ── Mutable state ──────────────────────────────────────────────
  private readonly cache = new Map<string, Record<string, unknown>>();
  private readonly dirty = new Set<string>();
  private prevParams: Record<string, number> = {};
  private prevEnvWires: Record<string, unknown> = {};
  private _stats: CookStats = { cooked: 0, cached: 0, total: 0, elapsed: 0, timing: new Map() };

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
    this.prevParams = params;
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

    for (const key of this.order) {
      if (!this.dirty.has(key)) continue;

      const instance = this.graph.nodes[key]!;
      const op = this.registry.resolve(instance.type);
      if (!op.evaluate) continue;

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
        if (w.from === "$env") {
          value = env[w.output];
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
   * Float32Array buffers and OffscreenCanvases. Essential when many
   * Frame components coexist (e.g., debug page with 10 panels) —
   * without this, cached buffers from all panels persist simultaneously,
   * easily reaching 600 MB+ at 2× DPR and crashing the browser tab.
   *
   * The next cook() will be a full re-evaluation (identical to first cook).
   */
  clearCache(): void {
    this.cache.clear();
    for (const key of this.order) this.dirty.add(key);
  }

  /** True if any node needs re-evaluation. */
  get needsCook(): boolean {
    return this.dirty.size > 0;
  }
}
