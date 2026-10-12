import type { Graph, OperatorRegistry } from "../../src/index";
import { CookEngine, createDefaultRegistry, SeededRNG } from "../../src/index";
import { type Digest, digest, digestLog } from "./digest";
import { createRecordingCanvasFactory, type LogEntry } from "./recording-canvas";

export interface CookOptions {
  width: number;
  height: number;
  dpr: number;
  seed: number | string;
  /** Operators to resolve node types with; a fresh default registry when omitted */
  registry?: OperatorRegistry;
}

export interface CookResult {
  /** Node key → output port → digest, in cook (topological) order */
  nodes: Record<string, Record<string, Digest>>;
  /** Digest of the canvas command stream the cook recorded */
  render: { hash: string; length: number };
  /** The raw cook result: node key → output record */
  cooked: Map<string, Record<string, unknown>>;
  /** The recorded canvas log itself, for debugging a render mismatch */
  log: LogEntry[];
  /** The engine that cooked, for host-side lookups such as findTerminalOutput */
  engine: CookEngine;
}

/**
 * Cook a graph headless, the way Frame does (frame.tsx draw()): a fresh
 * default registry and CookEngine, setParams, then one full cook with
 * env {width, height, dpr, rng, createCanvas}. Canvases are
 * RecordingCanvases.
 *
 * The render digest is taken before the node digests, because digesting
 * a lazily read-back buffer calls getImageData and would extend the log.
 */
export function cookGraph(graph: Graph, opts: CookOptions): CookResult {
  const registry = opts.registry ?? createDefaultRegistry();
  const engine = new CookEngine(graph, registry);
  engine.setParams({});

  const { createCanvas, log } = createRecordingCanvasFactory();
  const cooked = engine.cook({
    width: opts.width,
    height: opts.height,
    dpr: opts.dpr,
    rng: new SeededRNG(opts.seed),
    createCanvas,
  });

  const render = digestLog(log);
  const recorded = log.slice();

  const extent = { width: opts.width, height: opts.height };
  const nodes: Record<string, Record<string, Digest>> = {};
  for (const [key, outputs] of cooked) {
    const ports: Record<string, Digest> = {};
    for (const [port, value] of Object.entries(outputs)) ports[port] = digest(value, extent);
    nodes[key] = ports;
  }

  return { nodes, render, cooked, log: recorded, engine };
}
