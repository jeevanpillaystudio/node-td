import type { Graph, Wire } from "../graph";
import type { PortDef } from "../types";

/** Position of a node in the visual editor. */
export interface NodeLayout {
  x: number;
  y: number;
}

/**
 * A Graph combined with visual layout data for the editor.
 * Keeps the runtime Graph type lean — positions are editor-only concerns.
 */
export interface EditorGraph {
  graph: Graph;
  layout: Record<string, NodeLayout>;
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
    ports.push({ name: w.output, type: inferEnvPortType(w, graph.wires) });
  }

  return ports;
}

/** Best-effort type inference for env ports by looking at what they connect to. */
function inferEnvPortType(envWire: Wire, _wires: Wire[]): string {
  // Env ports are untyped in the graph — infer from the port name convention
  if (envWire.output === "ctx") return "context";
  if (envWire.output === "width" || envWire.output === "height") return "number";
  return "unknown";
}
