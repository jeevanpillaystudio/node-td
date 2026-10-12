import type { Graph, OperatorRegistry } from "@node-td/kernel";
import { CookEngine } from "@node-td/kernel";
import { type Digest, digest, digestLog } from "./digest";
import { createRecordingCanvasFactory, type LogEntry } from "./recording-canvas";

export interface CookOptions {
  width: number;
  height: number;
  dpr: number;
  seed: number | string;
  /** Operators to resolve node types with, from the package under test */
  registry: OperatorRegistry;
}

export interface CookResult {
  /** Node key → output port → digest, in cook (topological) order */
  nodes: Record<string, Record<string, Digest>>;
  /** Digest of the canvas command stream the cook recorded */
  render: { hash: string; length: number };
  /** The raw cook result: node key → output record */
  cooked: ReadonlyMap<string, Record<string, unknown>>;
  /** The recorded canvas log itself, for debugging a render mismatch */
  log: LogEntry[];
  /** The engine that cooked, for host-side lookups such as findTerminalOutput */
  engine: CookEngine;
}

/**
 * Cook a graph headless, the way Frame does (frame.tsx draw()): a fresh
 * CookEngine over the given registry, setParams, then one full cook with
 * env {width, height, dpr, seed, createCanvas}. Canvases are
 * RecordingCanvases.
 *
 * A node that throws fails the cook loudly, with the first error as the
 * cause: the engine itself records it and carries on, which would leave
 * a golden to fail later on a missing node.
 *
 * The render digest is taken before the node digests, because digesting
 * a lazily read-back buffer calls getImageData and would extend the log.
 */
export function cookGraph(graph: Graph, opts: CookOptions): CookResult {
  const engine = new CookEngine(graph, opts.registry);
  engine.setParams({});

  const { createCanvas, log } = createRecordingCanvasFactory();
  const cooked = engine.cook({
    width: opts.width,
    height: opts.height,
    dpr: opts.dpr,
    seed: opts.seed,
    createCanvas,
  });

  const thrown = [...engine.stats.errors].flatMap(([key, failure]) =>
    failure.kind === "error" ? [{ key, error: failure.error }] : [],
  );
  if (thrown[0]) {
    const lines = thrown.map(({ key, error }) => `node "${key}": ${errorMessage(error)}`);
    throw new Error(`${graph.id}: the cook failed\n${lines.join("\n")}`, {
      cause: thrown[0].error,
    });
  }

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
