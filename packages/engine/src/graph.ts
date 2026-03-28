import type { NodeInstance, ParamDef } from "./types";
import type { NodeRegistry } from "./registry";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Connection between nodes. Use `from: "$env"` for environment inputs. */
export interface Wire {
  from: string;
  output: string;
  to: string;
  input: string;
}

/** Declarative DAG of connected generative node instances. */
export interface Graph {
  id: string;
  name: string;
  nodes: Record<string, NodeInstance>;
  wires: Wire[];
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/** Validate all wires in a graph against the registry. Throws if invalid. */
export function validateGraph(graph: Graph, registry: NodeRegistry): void {
  const errors: string[] = [];
  const wired = new Set<string>();

  for (const [key, instance] of Object.entries(graph.nodes)) {
    if (!registry.has(instance.type)) {
      errors.push(`node "${key}": unknown type "${instance.type}"`);
    }
  }
  if (errors.length) {
    throw new Error(
      `Graph "${graph.id}" has errors:\n  ${errors.join("\n  ")}`,
    );
  }

  for (let i = 0; i < graph.wires.length; i++) {
    const w = graph.wires[i]!;
    const label = `wire[${i}] ${w.from}.${w.output} → ${w.to}.${w.input}`;

    if (w.from !== "$env" && !(w.from in graph.nodes)) {
      errors.push(`${label}: unknown source node "${w.from}"`);
      continue;
    }

    if (!(w.to in graph.nodes)) {
      errors.push(`${label}: unknown target node "${w.to}"`);
      continue;
    }

    const targetType = registry.resolve(graph.nodes[w.to]!.type);
    const targetPort = targetType.inputs.find((p) => p.name === w.input);

    if (!targetPort) {
      errors.push(
        `${label}: type "${targetType.id}" has no input "${w.input}"`,
      );
      continue;
    }

    const slot = `${w.to}.${w.input}`;
    if (wired.has(slot)) {
      errors.push(`${label}: duplicate wire to "${slot}"`);
    }
    wired.add(slot);

    if (w.from !== "$env") {
      const sourceType = registry.resolve(graph.nodes[w.from]!.type);
      if (sourceType.output.name !== w.output) {
        errors.push(
          `${label}: type "${sourceType.id}" output is "${sourceType.output.name}", not "${w.output}"`,
        );
      } else if (sourceType.output.type !== targetPort.type) {
        errors.push(
          `${label}: type mismatch — "${sourceType.id}" outputs "${sourceType.output.type}", "${targetType.id}.${w.input}" expects "${targetPort.type}"`,
        );
      }
    }
  }

  for (const [key, instance] of Object.entries(graph.nodes)) {
    const nodeType = registry.resolve(instance.type);
    for (const port of nodeType.inputs) {
      if (!wired.has(`${key}.${port.name}`)) {
        errors.push(`node "${key}": input "${port.name}" is not wired`);
      }
    }
  }

  if (errors.length) {
    throw new Error(
      `Graph "${graph.id}" has invalid wires:\n  ${errors.join("\n  ")}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Topological sort (Kahn's algorithm)                                */
/* ------------------------------------------------------------------ */

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
    downstream.get(w.from)!.push(w.to);
    inDegree.set(w.to, inDegree.get(w.to)! + 1);
  }

  const queue: string[] = [];
  for (const [key, deg] of inDegree) {
    if (deg === 0) queue.push(key);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    sorted.push(key);
    for (const dep of downstream.get(key)!) {
      const next = inDegree.get(dep)! - 1;
      inDegree.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }

  if (sorted.length !== nodeKeys.length) {
    throw new Error("Graph contains a cycle");
  }

  return sorted;
}

/* ------------------------------------------------------------------ */
/*  Evaluation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Execute every node in dependency order, wiring outputs to inputs.
 *
 * Param resolution per instance (highest priority wins):
 *   1. External `params` (keyed as "instanceKey.paramKey")
 *   2. Instance-level overrides (`NodeInstance.params`)
 *   3. Type defaults (`GenNode.params[].default`)
 */
export function evaluateGraph(
  graph: Graph,
  registry: NodeRegistry,
  env: Record<string, unknown>,
  params: Record<string, number>,
): void {
  const order = topoSort(Object.keys(graph.nodes), graph.wires);
  const outputs = new Map<string, unknown>();

  for (const key of order) {
    const instance = graph.nodes[key]!;
    const nodeType = registry.resolve(instance.type);
    const inputs: Record<string, unknown> = {};

    for (const w of graph.wires) {
      if (w.to !== key) continue;
      inputs[w.input] =
        w.from === "$env" ? env[w.output] : outputs.get(w.from);
    }

    // Resolve params: type defaults → instance overrides → external overrides
    const resolved: Record<string, number> = {};
    for (const p of nodeType.params) {
      resolved[p.key] = p.default;
    }
    if (instance.params) {
      Object.assign(resolved, instance.params);
    }
    const prefix = `${key}.`;
    for (const [k, v] of Object.entries(params)) {
      if (k.startsWith(prefix)) {
        resolved[k.slice(prefix.length)] = v;
      }
    }

    const result = nodeType.evaluate(inputs, resolved);
    outputs.set(key, result);
  }
}

/* ------------------------------------------------------------------ */
/*  Params                                                             */
/* ------------------------------------------------------------------ */

/**
 * Collect all params from a graph's node instances, scoped by instance key.
 * Keys are formatted as "instanceKey.paramKey" for external param dicts.
 */
export function collectParams(
  graph: Graph,
  registry: NodeRegistry,
): ParamDef[] {
  const out: ParamDef[] = [];
  for (const [key, instance] of Object.entries(graph.nodes)) {
    const nodeType = registry.resolve(instance.type);
    for (const p of nodeType.params) {
      out.push({
        ...p,
        key: `${key}.${p.key}`,
        label: `${key} / ${p.label}`,
        default: instance.params?.[p.key] ?? p.default,
      });
    }
  }
  return out;
}
