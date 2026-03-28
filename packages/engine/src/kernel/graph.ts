import type { Operator, NodeInstance, ParamDef, PortType, GraphEnv } from "./types";

// ─── Graph Types ─────────────────────────────────────────────────

/** A directed edge connecting an output port to an input port */
export interface Wire {
  /** Source node key, or "$env" for environment inputs */
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
}

// ─── Registry interface (avoids circular import) ─────────────────

interface RegistryLike {
  has(id: string): boolean;
  resolve(id: string): Operator;
}

// ─── Validation ──────────────────────────────────────────────────

export function validateGraph(graph: Graph, registry: RegistryLike): void {
  const errors: string[] = [];

  // Pass 1 — node type existence
  for (const [key, instance] of Object.entries(graph.nodes)) {
    if (!registry.has(instance.type)) {
      errors.push(`Node "${key}" references unknown type "${instance.type}"`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));

  // Pass 2 — wire validity
  const wired = new Set<string>();

  for (const w of graph.wires) {
    // Target must exist
    const targetInstance = graph.nodes[w.to];
    if (!targetInstance) {
      errors.push(`Wire: target node "${w.to}" not found`);
      continue;
    }

    // Target input port must exist
    const targetOp = registry.resolve(targetInstance.type);
    const targetPort = targetOp.inputs.find((p) => p.name === w.input);
    if (!targetPort) {
      errors.push(`Wire: "${w.to}" has no input "${w.input}"`);
      continue;
    }

    // No duplicate wiring to the same slot (unless variadic)
    const slot = `${w.to}.${w.input}`;
    if (wired.has(slot) && !targetPort.variadic) {
      errors.push(`Wire: duplicate wire to ${slot}`);
      continue;
    }
    wired.add(slot);

    // Source validation (skip $env)
    if (w.from !== "$env") {
      const sourceInstance = graph.nodes[w.from];
      if (!sourceInstance) {
        errors.push(`Wire: source node "${w.from}" not found`);
        continue;
      }
      const sourceOp = registry.resolve(sourceInstance.type);
      const sourcePort = sourceOp.outputs.find((p) => p.name === w.output);
      if (!sourcePort) {
        errors.push(`Wire: "${w.from}" has no output "${w.output}"`);
        continue;
      }
      if (sourcePort.type !== targetPort.type) {
        errors.push(
          `Wire: type mismatch — "${w.from}.${w.output}" (${sourcePort.type}) → "${w.to}.${w.input}" (${targetPort.type})`,
        );
      }
    }
  }

  // Pass 3 — required inputs must be wired
  for (const [key, instance] of Object.entries(graph.nodes)) {
    const op = registry.resolve(instance.type);
    for (const port of op.inputs) {
      if (port.optional) continue;
      if (!wired.has(`${key}.${port.name}`)) {
        errors.push(
          `Node "${key}": required input "${port.name}" is not wired`,
        );
      }
    }
  }

  if (errors.length) throw new Error(errors.join("\n"));
}

// ─── Topological Sort ────────────────────────────────────────────

export function topoSort(nodeKeys: string[], wires: Wire[]): string[] {
  const inDegree = new Map<string, number>();
  const downstream = new Map<string, string[]>();

  for (const key of nodeKeys) {
    inDegree.set(key, 0);
    downstream.set(key, []);
  }

  const seen = new Set<string>();
  for (const w of wires) {
    if (w.from === "$env") continue;
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

  if (sorted.length !== nodeKeys.length) {
    throw new Error("Graph contains a cycle");
  }

  return sorted;
}

// ─── Evaluation ──────────────────────────────────────────────────

/**
 * Evaluate a graph, executing each node in topological order.
 *
 * Each node's `evaluate` returns `Record<outputPortName, value>`.
 * Returns a Map of every node key → its output record.
 */
export function evaluateGraph(
  graph: Graph,
  registry: RegistryLike,
  env: GraphEnv,
  params: Record<string, number> = {},
): Map<string, Record<string, unknown>> {
  const order = topoSort(Object.keys(graph.nodes), graph.wires);
  const outputs = new Map<string, Record<string, unknown>>();

  for (const key of order) {
    const instance = graph.nodes[key]!;
    const op = registry.resolve(instance.type);

    if (!op.evaluate) continue;

    // Build a set of variadic port names for this operator
    const variadicPorts = new Set<string>();
    for (const port of op.inputs) {
      if (port.variadic) variadicPorts.add(port.name);
    }

    // Gather inputs from wires
    const inputs: Record<string, unknown> = {};
    for (const w of graph.wires) {
      if (w.to !== key) continue;

      let value: unknown;
      if (w.from === "$env") {
        value = env[w.output];
      } else {
        const src = outputs.get(w.from);
        if (src) value = src[w.output];
      }

      if (variadicPorts.has(w.input)) {
        // Variadic: collect into array
        if (!Array.isArray(inputs[w.input])) {
          inputs[w.input] = [];
        }
        (inputs[w.input] as unknown[]).push(value);
      } else {
        inputs[w.input] = value;
      }
    }

    // Resolve params: type defaults → instance overrides → external overrides
    const resolved: Record<string, number> = {};
    for (const p of op.params) {
      resolved[p.key] = p.default;
    }
    if (instance.params) {
      for (const [k, v] of Object.entries(instance.params)) {
        resolved[k] = v;
      }
    }
    const prefix = `${key}.`;
    for (const [k, v] of Object.entries(params)) {
      if (k.startsWith(prefix)) {
        resolved[k.slice(prefix.length)] = v;
      }
    }

    outputs.set(key, op.evaluate(inputs, resolved, env) as Record<string, unknown>);
  }

  return outputs;
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

/**
 * Find the terminal outputs of a graph — nodes with no downstream consumers.
 */
export function terminalOutputs(
  graph: Graph,
  outputs: Map<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const hasConsumer = new Set<string>();
  for (const w of graph.wires) {
    if (w.from !== "$env") hasConsumer.add(w.from);
  }
  const terminals: Record<string, Record<string, unknown>> = {};
  for (const [key, out] of outputs) {
    if (!hasConsumer.has(key)) terminals[key] = out;
  }
  return terminals;
}

/**
 * Find the first output value matching a given port type across terminal nodes.
 */
export function findTerminalOutput<T>(
  graph: Graph,
  registry: RegistryLike,
  outputs: Map<string, Record<string, unknown>>,
  portType: PortType,
): T | undefined {
  const terminals = terminalOutputs(graph, outputs);
  for (const [nodeKey, nodeOutputs] of Object.entries(terminals)) {
    const instance = graph.nodes[nodeKey];
    if (!instance) continue;
    const op = registry.resolve(instance.type);
    for (const port of op.outputs) {
      if (port.type === portType && nodeOutputs[port.name] != null) {
        return nodeOutputs[port.name] as T;
      }
    }
  }
  return undefined;
}
