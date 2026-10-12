import type { Graph } from "@node-td/kernel";
import type { Operator, PortDef } from "@node-td/kernel";
import type { OperatorRegistry } from "@node-td/kernel";
import { topoSort } from "@node-td/kernel";

/** Position of a node in the visual editor. */
export interface NodeLayout {
  x: number;
  y: number;
}

/** Data attached to a React Flow node representing an Operator instance. */
export interface GenNodeData {
  [key: string]: unknown;
  instanceKey: string;
  nodeType: Operator;
  params: Record<string, number>;
  isEnv?: boolean;
  envPorts?: PortDef[];
}

/** Data attached to a React Flow edge representing a Wire. */
export interface GenEdgeData {
  [key: string]: unknown;
  sourcePort: string;
  targetPort: string;
  portType: string;
}

/**
 * Infer the environment ports used by a graph.
 * Scans wires for `from: "$env"` and returns deduplicated port definitions,
 * allowing the editor to render $env as a visible node with output handles.
 */
export function inferEnvPorts(graph: Graph): PortDef[] {
  const seen = new Set<string>();
  const ports: PortDef[] = [];

  for (const w of graph.wires) {
    if (w.from !== "$env") continue;
    if (seen.has(w.output)) continue;
    seen.add(w.output);
    ports.push({ name: w.output, type: "number" });
  }

  return ports;
}

/**
 * Compute auto-layout positions for a graph using topological depth.
 * Nodes are arranged left-to-right by dependency depth, spread vertically.
 */
export function autoLayout(graph: Graph): Record<string, NodeLayout> {
  const nodeKeys = Object.keys(graph.nodes);
  const sorted = topoSort(nodeKeys, graph.wires);

  // Each node's sources, from the wires between nodes
  const sources = new Map<string, string[]>();
  for (const w of graph.wires) {
    if (w.from === "$env") continue;
    const from = sources.get(w.to);
    if (from) from.push(w.from);
    else sources.set(w.to, [w.from]);
  }

  // Depth: longest path from any root to this node. Visiting nodes in
  // topological order places every source before the nodes it feeds,
  // whatever order the wires are listed in.
  const depth = new Map<string, number>();
  for (const key of sorted) {
    let d = 0;
    for (const from of sources.get(key) ?? []) {
      d = Math.max(d, (depth.get(from) ?? 0) + 1);
    }
    depth.set(key, d);
  }

  // Group by depth column
  const columns = new Map<number, string[]>();
  for (const key of sorted) {
    const d = depth.get(key) ?? 0;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d)!.push(key);
  }

  // $env node sits at column -1
  const hasEnv = graph.wires.some((w) => w.from === "$env");

  const COL_GAP = 280;
  const ROW_GAP = 120;
  const layout: Record<string, NodeLayout> = {};

  if (hasEnv) {
    layout.$env = { x: 0, y: ROW_GAP };
  }

  const offsetX = hasEnv ? COL_GAP : 0;

  for (const [col, keys] of columns) {
    const x = offsetX + col * COL_GAP;
    const startY = ((keys.length - 1) * ROW_GAP) / -2 + ROW_GAP * 2;
    for (let i = 0; i < keys.length; i++) {
      layout[keys[i]!] = { x, y: startY + i * ROW_GAP };
    }
  }

  return layout;
}

/**
 * Convert a Graph + layout into React Flow-compatible node and edge arrays.
 * Returns plain objects — the consumer wraps them with RF types.
 */
export function toReactFlowElements(
  graph: Graph,
  registry: OperatorRegistry,
  layout?: Record<string, NodeLayout>,
) {
  const positions = layout ?? autoLayout(graph);
  const envPorts = inferEnvPorts(graph);

  const nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: GenNodeData;
  }> = [];

  const edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
    data: GenEdgeData;
  }> = [];

  // $env node
  if (envPorts.length > 0) {
    const pos = positions.$env ?? { x: 0, y: 120 };
    nodes.push({
      id: "$env",
      type: "env",
      position: pos,
      data: {
        instanceKey: "$env",
        nodeType: {
          id: "$env",
          category: "top",
          label: "Environment",
          inputs: [],
          outputs: envPorts,
          params: [],
          evaluate: () => ({}),
        },
        params: {},
        isEnv: true,
        envPorts,
      },
    });
  }

  // Graph nodes
  for (const [key, instance] of Object.entries(graph.nodes)) {
    const nodeType = registry.resolve(instance.type);
    const pos = positions[key] ?? { x: 0, y: 0 };
    nodes.push({
      id: key,
      type: "gen",
      position: pos,
      data: {
        instanceKey: key,
        nodeType,
        params: instance.params ?? {},
      },
    });
  }

  // Wires → edges
  for (let i = 0; i < graph.wires.length; i++) {
    const w = graph.wires[i]!;
    edges.push({
      id: `e-${i}`,
      source: w.from,
      target: w.to,
      sourceHandle: `${w.from}-out-${w.output}`,
      targetHandle: `${w.to}-in-${w.input}`,
      data: {
        sourcePort: w.output,
        targetPort: w.input,
        portType: w.from === "$env" ? "number" : "",
      },
    });
  }

  return { nodes, edges };
}
