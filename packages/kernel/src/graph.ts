import { ENV_SOURCE, envOutputType, isEnvSource } from "./env";
import {
  isEnumParam,
  type NodeInstance,
  type Operator,
  type ParamDef,
  type PortType,
} from "./types";

// ─── Graph Types ─────────────────────────────────────────────────

/** A directed edge connecting an output port to an input port */
export interface Wire {
  /** Source node key, or ENV_SOURCE ("$env") for an environment output */
  from: string;
  /** Source port name */
  output: string;
  /** Target node key */
  to: string;
  /** Target port name */
  input: string;
}

/** A DAG of node instances connected by typed wires */
export interface Graph {
  id: string;
  name: string;
  nodes: Record<string, NodeInstance>;
  wires: Wire[];
  /**
   * The seed the graph's random stream was tuned with. Hosts cook with it
   * (EnvValues.seed) unless told to use another.
   */
  seed?: number | string;
}

// ─── Registry interface (avoids circular import) ─────────────────

interface RegistryLike {
  has(id: string): boolean;
  resolve(id: string): Operator;
}

// ─── Validation ──────────────────────────────────────────────────

/** A graph that failed validateGraph. `issues` lists every problem found. */
export class GraphValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues.join("\n"));
    this.name = "GraphValidationError";
    this.issues = issues;
  }
}

/**
 * Check a graph against the operators it names, and throw a
 * GraphValidationError listing every issue, one per line. A graph that
 * passes has only well-formed node keys and known operator types, wires
 * only between existing ports (or from a declared $env output) of the same
 * type, every required input wired, no cycle, and only declared, legal
 * params (lintParams), so topoSort and a cook can rely on it.
 */
export function validateGraph(graph: Graph, registry: RegistryLike): void {
  const errors: string[] = [];
  const hasNode = (key: string) => Object.hasOwn(graph.nodes, key);
  /** A node's operator, or undefined when its type is unknown (reported in pass 1). */
  const opOf = (key: string): Operator | undefined => {
    const type = graph.nodes[key]!.type;
    return registry.has(type) ? registry.resolve(type) : undefined;
  };

  // Pass 1 — node keys and type existence
  for (const [key, instance] of Object.entries(graph.nodes)) {
    if (key.includes(".")) {
      errors.push(`Node "${key}": a node key cannot contain "."`);
    }
    if (key.startsWith("$")) {
      errors.push(`Node "${key}": a node key cannot start with "$"`);
    }
    if (!registry.has(instance.type)) {
      errors.push(`Node "${key}" references unknown type "${instance.type}"`);
    }
  }

  // Pass 2 — wire validity
  const wired = new Set<string>();

  for (const w of graph.wires) {
    // Target must exist
    if (isEnvSource(w.to)) {
      errors.push(`Wire: "${ENV_SOURCE}" is a source and cannot be a wire target`);
      continue;
    }
    if (!hasNode(w.to)) {
      errors.push(`Wire: target node "${w.to}" not found`);
      continue;
    }

    // Target input port must exist (unless the target's type is unknown)
    const targetOp = opOf(w.to);
    const targetPort = targetOp?.inputs.find((p) => p.name === w.input);
    if (targetOp && !targetPort) {
      errors.push(`Wire: "${w.to}" has no input "${w.input}"`);
      continue;
    }

    // No duplicate wiring to the same slot (unless variadic)
    if (targetPort) {
      const slot = `${w.to}.${w.input}`;
      if (wired.has(slot) && !targetPort.variadic) {
        errors.push(`Wire: duplicate wire to ${slot}`);
        continue;
      }
      wired.add(slot);
    }

    // Source must be a declared $env output, or an output of an existing node
    let sourceType: PortType | undefined;
    if (isEnvSource(w.from)) {
      sourceType = envOutputType(w.output);
      if (!sourceType) {
        errors.push(`Wire: "${ENV_SOURCE}" has no output "${w.output}"`);
        continue;
      }
    } else {
      if (!hasNode(w.from)) {
        errors.push(`Wire: source node "${w.from}" not found`);
        continue;
      }
      const sourceOp = opOf(w.from);
      if (!sourceOp) continue;
      const sourcePort = sourceOp.outputs.find((p) => p.name === w.output);
      if (!sourcePort) {
        errors.push(`Wire: "${w.from}" has no output "${w.output}"`);
        continue;
      }
      sourceType = sourcePort.type;
    }

    if (targetPort && sourceType !== targetPort.type) {
      errors.push(
        `Wire: type mismatch — "${w.from}.${w.output}" (${sourceType}) → "${w.to}.${w.input}" (${targetPort.type})`,
      );
    }
  }

  // Pass 3 — required inputs must be wired
  for (const key of Object.keys(graph.nodes)) {
    const op = opOf(key);
    if (!op) continue;
    for (const port of op.inputs) {
      if (port.optional) continue;
      if (!wired.has(`${key}.${port.name}`)) {
        errors.push(
          `Node "${key}": required input "${port.name}" is not wired`,
        );
      }
    }
  }

  // Pass 4 — no cycles among the wires between existing nodes
  const nodeKeys = Object.keys(graph.nodes);
  const nodeWires = graph.wires.filter((w) => hasNode(w.from) && hasNode(w.to));
  const cycle = cycleNodes(nodeKeys, nodeWires);
  if (cycle.length) errors.push(cycleMessage(cycle));

  // Pass 5 — params
  errors.push(...lintParams(graph, registry));

  if (errors.length) throw new GraphValidationError(errors);
}

// ─── Param lint ──────────────────────────────────────────────────

/**
 * The issues with a graph's params, one per line: a node param its
 * operator does not declare, a number outside its param's [min, max], an
 * enum value that is not one of its options, and, once per operator, a
 * declared default that is not legal for its own param (lintParamDefs).
 * Nodes of an unknown type are skipped; validateGraph reports them.
 */
export function lintParams(graph: Graph, registry: RegistryLike): string[] {
  const issues: string[] = [];
  const linted = new Set<string>();
  for (const [key, instance] of Object.entries(graph.nodes)) {
    if (!registry.has(instance.type)) continue;
    const op = registry.resolve(instance.type);
    if (!linted.has(op.id)) {
      linted.add(op.id);
      issues.push(...lintParamDefs(op));
    }
    for (const [paramKey, value] of Object.entries(instance.params ?? {})) {
      const def = op.params.find((p) => p.key === paramKey);
      if (!def) {
        issues.push(`Node "${key}": "${op.id}" has no param "${paramKey}"`);
        continue;
      }
      const problem = illegalValue(def, value);
      if (problem) issues.push(`Node "${key}": param "${paramKey}" ${problem}`);
    }
  }
  return issues;
}

/**
 * The issues with an operator's own param declarations: a default outside
 * its [min, max], or an enum default that is not one of its options.
 */
export function lintParamDefs(op: Operator): string[] {
  const issues: string[] = [];
  for (const def of op.params) {
    const problem = illegalValue(def, def.default);
    if (problem) issues.push(`Operator "${op.id}": the default of param "${def.key}" ${problem}`);
  }
  return issues;
}

/** Why `value` is not a legal value of the param, or undefined when it is. */
function illegalValue(def: ParamDef, value: unknown): string | undefined {
  if (typeof value !== "number") return `is ${JSON.stringify(value)}, not a number`;
  if (isEnumParam(def)) {
    if (def.options.some((o) => o.value === value)) return undefined;
    return `is ${value}, not one of its options (${def.options.map((o) => o.value).join(", ")})`;
  }
  if (value >= def.min && value <= def.max) return undefined;
  return `is ${value}, outside [${def.min}, ${def.max}]`;
}

// ─── Topological Sort ────────────────────────────────────────────

/**
 * Order node keys so every node comes after its sources (Kahn's
 * algorithm; ties keep key order, then wire order). Every wire must run
 * between keys in `nodeKeys` or come from $env: validateGraph checks that.
 */
export function topoSort(nodeKeys: string[], wires: Wire[]): string[] {
  const { sorted, downstream } = kahn(nodeKeys, wires);
  if (sorted.length !== nodeKeys.length) {
    throw new Error(cycleMessage(onCycles(nodeKeys, sorted, downstream)));
  }
  return sorted;
}

/** The keys that lie on a cycle (or between two cycles), in `nodeKeys` order. */
function cycleNodes(nodeKeys: string[], wires: Wire[]): string[] {
  const { sorted, downstream } = kahn(nodeKeys, wires);
  return onCycles(nodeKeys, sorted, downstream);
}

function kahn(
  nodeKeys: string[],
  wires: Wire[],
): { sorted: string[]; downstream: Map<string, string[]> } {
  const inDegree = new Map<string, number>();
  const downstream = new Map<string, string[]>();

  for (const key of nodeKeys) {
    inDegree.set(key, 0);
    downstream.set(key, []);
  }

  const seen = new Set<string>();
  for (const w of wires) {
    if (isEnvSource(w.from)) continue;
    const edge = `${w.from}\0${w.to}`;
    if (seen.has(edge)) continue;
    seen.add(edge);
    inDegree.set(w.to, (inDegree.get(w.to) ?? 0) + 1);
    downstream.get(w.from)!.push(w.to);
  }

  const queue: string[] = [];
  for (const [key, deg] of inDegree) {
    if (deg === 0) queue.push(key);
  }

  const sorted: string[] = [];
  while (queue.length) {
    const key = queue.shift()!;
    sorted.push(key);
    for (const next of downstream.get(key)!) {
      const d = inDegree.get(next)! - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  return { sorted, downstream };
}

/**
 * Of the nodes Kahn's algorithm could not order, keep those on a cycle:
 * drop, until none is left, each node with no successor among them (the
 * nodes merely downstream of a cycle).
 */
function onCycles(
  nodeKeys: string[],
  sorted: string[],
  downstream: Map<string, string[]>,
): string[] {
  const done = new Set(sorted);
  const left = new Set(nodeKeys.filter((key) => !done.has(key)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of left) {
      if (!downstream.get(key)!.some((next) => left.has(next))) {
        left.delete(key);
        changed = true;
      }
    }
  }
  return nodeKeys.filter((key) => left.has(key));
}

function cycleMessage(cycle: string[]): string {
  return `Graph contains a cycle through ${cycle.map((key) => `"${key}"`).join(", ")}`;
}

// ─── Convenience ─────────────────────────────────────────────────

/**
 * Collect every exposed parameter from a graph,
 * prefixed by instance key (e.g. "noise.noiseScale").
 */
export function collectParams(
  graph: Graph,
  registry: RegistryLike,
): ParamDef[] {
  const result: ParamDef[] = [];
  for (const [key, instance] of Object.entries(graph.nodes)) {
    const op = registry.resolve(instance.type);
    for (const p of op.params) {
      result.push({
        ...p,
        key: `${key}.${p.key}`,
        label: `${key} / ${p.label}`,
        default: instance.params?.[p.key] ?? p.default,
      });
    }
  }
  return result;
}
