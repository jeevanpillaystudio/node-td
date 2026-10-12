import {
  ENV_OUTPUTS,
  ENV_SOURCE,
  type EnvOutput,
  type Graph,
  isEnvSource,
  type Operator,
  type OperatorRegistry,
  type PortDef,
  topoSort,
} from "@node-td/kernel";

/** Data attached to a React Flow node representing an Operator instance. */
export interface GenNodeData {
  [key: string]: unknown;
  instanceKey: string;
  nodeType: Operator;
  params: Record<string, number>;
}

/** Data attached to the React Flow node representing the environment source. */
export interface EnvNodeData {
  [key: string]: unknown;
  /** The declared environment outputs the graph reads. */
  outputs: PortDef[];
}

type Position = { x: number; y: number };

/**
 * The id of the React Flow handle for one of a node's ports, e.g.
 * `src-out-geometry` or `out-in-a`. The adapter's edges and the handles
 * gen-node.tsx renders both use it, so an edge always finds its handle.
 */
export function handleId(nodeKey: string, side: "in" | "out", port: string): string {
  return `${nodeKey}-${side}-${port}`;
}

/**
 * The environment outputs a graph reads, with the port types the kernel
 * declares for them (ENV_OUTPUTS), in declaration order. The editor renders
 * them as the output handles of the environment node.
 */
export function envPorts(graph: Graph): PortDef[] {
  const read = new Set(graph.wires.filter((w) => isEnvSource(w.from)).map((w) => w.output));
  return (Object.keys(ENV_OUTPUTS) as EnvOutput[])
    .filter((name) => read.has(name))
    .map((name) => ({ name, type: ENV_OUTPUTS[name] }));
}

/**
 * Compute auto-layout positions for a graph using topological depth.
 * Nodes are arranged left-to-right by dependency depth, spread vertically.
 */
export function autoLayout(graph: Graph): Record<string, Position> {
  const nodeKeys = Object.keys(graph.nodes);
  const sorted = topoSort(nodeKeys, graph.wires);

  // Each node's sources, from the wires between nodes
  const sources = new Map<string, string[]>();
  for (const w of graph.wires) {
    if (isEnvSource(w.from)) continue;
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
    const column = columns.get(d);
    if (column) column.push(key);
    else columns.set(d, [key]);
  }

  // The environment node sits in a column of its own, left of the roots
  const hasEnv = envPorts(graph).length > 0;

  const COL_GAP = 280;
  const ROW_GAP = 120;
  const layout: Record<string, Position> = {};

  if (hasEnv) {
    layout[ENV_SOURCE] = { x: 0, y: ROW_GAP };
  }

  const offsetX = hasEnv ? COL_GAP : 0;

  for (const [col, keys] of columns) {
    const x = offsetX + col * COL_GAP;
    const startY = ((keys.length - 1) * ROW_GAP) / -2 + ROW_GAP * 2;
    keys.forEach((key, i) => {
      layout[key] = { x, y: startY + i * ROW_GAP };
    });
  }

  return layout;
}

/**
 * Convert a Graph into React Flow-compatible node and edge arrays, laid out
 * by autoLayout. Returns plain objects — the consumer wraps them with RF types.
 */
export function toReactFlowElements(graph: Graph, registry: OperatorRegistry) {
  const positions = autoLayout(graph);
  const outputs = envPorts(graph);

  const nodes: Array<
    | { id: string; type: "env"; position: Position; data: EnvNodeData }
    | { id: string; type: "gen"; position: Position; data: GenNodeData }
  > = [];

  // The environment source, when the graph reads it
  if (outputs.length > 0) {
    nodes.push({
      id: ENV_SOURCE,
      type: "env",
      position: positions[ENV_SOURCE] ?? { x: 0, y: 120 },
      data: { outputs },
    });
  }

  // Graph nodes
  for (const [key, instance] of Object.entries(graph.nodes)) {
    nodes.push({
      id: key,
      type: "gen",
      position: positions[key] ?? { x: 0, y: 0 },
      data: {
        instanceKey: key,
        nodeType: registry.resolve(instance.type),
        params: instance.params ?? {},
      },
    });
  }

  // Wires → edges
  const edges = graph.wires.map((w, i) => ({
    id: `e-${i}`,
    source: w.from,
    target: w.to,
    sourceHandle: handleId(w.from, "out", w.output),
    targetHandle: handleId(w.to, "in", w.input),
  }));

  return { nodes, edges };
}
