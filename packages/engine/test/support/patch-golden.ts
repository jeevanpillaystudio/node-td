import { describe, expect, test } from "bun:test";
import type { Buffer2D, Graph, OperatorRegistry } from "../../src/index";
import { cookGraph } from "./cook";
import { type Digest, digest, digestLog } from "./digest";
import { createRecordingCanvasFactory } from "./recording-canvas";

/**
 * Patch goldens — each gallery patch is pinned in two tiers, one test file
 * per tier, so a change that re-pins one tier never edits the other's
 * snapshot file.
 *
 * - Render tier (<id>.render.golden.test.ts): what the gallery shows. The
 *   canvas command stream of the cook, the terminal image Frame displays,
 *   and the command stream of blitting that image onto a display canvas.
 * - Node tier (<id>.nodes.golden.test.ts): every node's resolved params,
 *   and a digest of every node output.
 *
 * Every size is cooked from scratch with seed 42, the way Frame draws.
 */

/**
 * What the patch goldens take from the packages under test. The helpers
 * take these as arguments so they can live in a package of their own:
 * that package cannot depend on the packages it tests, because they
 * depend on it for their tests and turbo rejects the cycle.
 */
export interface PatchGoldenDeps {
  /** A fresh registry holding every operator the patches use, as Frame makes one */
  createRegistry: () => OperatorRegistry;
  /** Draws a buffer onto a 2d context the way Frame displays it (blitBuffer2D) */
  blit: (ctx: OffscreenCanvasRenderingContext2D, buffer: Buffer2D) => void;
}

export interface GoldenSize {
  width: number;
  height: number;
  dpr: number;
}

/** Three squares, one landscape, and the 400 px square again at dpr 2. */
export const GOLDEN_SIZES: readonly GoldenSize[] = [
  { width: 256, height: 256, dpr: 1 },
  { width: 400, height: 400, dpr: 1 },
  { width: 800, height: 800, dpr: 1 },
  { width: 640, height: 400, dpr: 1 },
  { width: 400, height: 400, dpr: 2 },
];

export const GOLDEN_SEED = 42;

/** Generous: the largest Subscapes cook takes a few seconds. */
const TIMEOUT_MS = 60_000;

function sizeLabel({ width, height, dpr }: GoldenSize): string {
  return `${width}x${height} dpr${dpr}`;
}

// ─── Render tier ─────────────────────────────────────────────────

export interface RenderDigest {
  /** The canvas command stream the cook recorded */
  cook: { hash: string; length: number };
  /** The terminal image: CookEngine.findTerminalOutput("buffer"), as Frame reads it */
  terminal: Digest;
  /** The command stream of blitBuffer2D drawing the terminal onto a w·dpr × h·dpr canvas */
  blit: { hash: string; length: number };
}

/**
 * Cook a patch and digest what Frame would put on screen. The terminal
 * is digested and blitted after the cook's own log is digested, so
 * neither can extend it.
 */
export function renderDigest(graph: Graph, size: GoldenSize, deps: PatchGoldenDeps): RenderDigest {
  const result = cookGraph(graph, { ...size, seed: GOLDEN_SEED, registry: deps.createRegistry() });
  const terminal = result.engine.findTerminalOutput<Buffer2D>("buffer");
  if (!terminal) throw new Error(`${graph.id}: no terminal buffer at ${sizeLabel(size)}`);
  return {
    cook: result.render,
    terminal: digest(terminal, size),
    blit: blitDigest(terminal, size, deps.blit),
  };
}

/**
 * Minimal ImageData for blitBuffer2D's CPU path; bun has no DOM.
 * RecordingContext2D records it by shape (data, width, height).
 */
class StubImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

/** Run fn with a global ImageData, installing the stub only for the call. */
export function withImageData<T>(fn: () => T): T {
  const g = globalThis as { ImageData?: unknown };
  const installed = !("ImageData" in g);
  if (installed) g.ImageData = StubImageData;
  try {
    return fn();
  } finally {
    if (installed) delete g.ImageData;
  }
}

/** Blit a buffer onto a fresh recording canvas sized like Frame's, and digest the log. */
function blitDigest(
  buffer: Buffer2D,
  size: GoldenSize,
  blit: PatchGoldenDeps["blit"],
): { hash: string; length: number } {
  const { createCanvas, log } = createRecordingCanvasFactory();
  const canvas = createCanvas(size.width * size.dpr, size.height * size.dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("blitDigest: the recording canvas gave no 2d context");
  withImageData(() => blit(ctx, buffer));
  return digestLog(log);
}

function renderGolden(graph: Graph, deps: PatchGoldenDeps): void {
  describe(`${graph.id} render`, () => {
    for (const size of GOLDEN_SIZES) {
      test(
        sizeLabel(size),
        () => {
          expect(renderDigest(graph, size, deps)).toMatchSnapshot();
        },
        TIMEOUT_MS,
      );
    }
  });
}

// ─── Node tier ───────────────────────────────────────────────────

export interface ResolvedNode {
  type: string;
  /** Operator defaults overlaid with the node's own params, as the cook resolves them */
  params: Record<string, number>;
}

/**
 * Every node's fully resolved params, so a change to an operator default
 * that a patch relies on shows up as a reviewable diff.
 */
export function resolvedParams(
  graph: Graph,
  registry: OperatorRegistry,
): Record<string, ResolvedNode> {
  const out: Record<string, ResolvedNode> = {};
  for (const [key, instance] of Object.entries(graph.nodes)) {
    const op = registry.resolve(instance.type);
    const params: Record<string, number> = {};
    for (const p of op.params) params[p.key] = p.default;
    if (instance.params) {
      for (const [k, v] of Object.entries(instance.params)) params[k] = v;
    }
    out[key] = { type: instance.type, params };
  }
  return out;
}

function nodesGolden(graph: Graph, deps: PatchGoldenDeps): void {
  describe(`${graph.id} nodes`, () => {
    test("resolved params", () => {
      expect(resolvedParams(graph, deps.createRegistry())).toMatchSnapshot();
    });
    for (const size of GOLDEN_SIZES) {
      test(
        sizeLabel(size),
        () => {
          const registry = deps.createRegistry();
          expect(cookGraph(graph, { ...size, seed: GOLDEN_SEED, registry }).nodes).toMatchSnapshot();
        },
        TIMEOUT_MS,
      );
    }
  });
}

// ─── Binding ─────────────────────────────────────────────────────

export interface PatchGoldens {
  /** Register one render-tier golden test per size for a patch. */
  renderGolden(graph: Graph): void;
  /** Register the node-tier golden tests for a patch: resolved params, then one per size. */
  nodesGolden(graph: Graph): void;
}

/** Bind the patch goldens to the packages under test. */
export function patchGoldens(deps: PatchGoldenDeps): PatchGoldens {
  return {
    renderGolden: (graph) => renderGolden(graph, deps),
    nodesGolden: (graph) => nodesGolden(graph, deps),
  };
}
