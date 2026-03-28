import type { Buffer2D, GraphEnv, Operator, ParamDef } from "./types";
import type { Graph } from "./graph";
import { evaluateGraph, findTerminalOutput, collectParams } from "./graph";

// ─── Blend Modes ─────────────────────────────────────────────────

export type BlendMode = "over" | "add" | "multiply" | "screen";

// ─── Composition Types ──────────────────────────────────────────

/** A single patch in a composition — one Graph producing a Buffer2D layer */
export interface PatchEntry {
  id: string;
  name: string;
  graph: Graph;
  blend: BlendMode;
  opacity: number;
  visible: boolean;
}

/** An ordered stack of patches, composited back-to-front into a single Buffer2D */
export interface Composition {
  id: string;
  name: string;
  patches: PatchEntry[];
}

// ─── Registry (avoids circular import) ──────────────────────────

interface RegistryLike {
  has(id: string): boolean;
  resolve(id: string): Operator;
}

// ─── Factories ──────────────────────────────────────────────────

/** Wrap a single Graph into a one-patch Composition */
export function graphToComposition(graph: Graph): Composition {
  return {
    id: graph.id,
    name: graph.name,
    patches: [
      {
        id: graph.id,
        name: graph.name,
        graph,
        blend: "over",
        opacity: 1,
        visible: true,
      },
    ],
  };
}

/** Create a PatchEntry from a Graph with optional overrides */
export function createPatch(
  graph: Graph,
  overrides?: Partial<Omit<PatchEntry, "graph">>,
): PatchEntry {
  return {
    id: overrides?.id ?? graph.id,
    name: overrides?.name ?? graph.name,
    graph,
    blend: overrides?.blend ?? "over",
    opacity: overrides?.opacity ?? 1,
    visible: overrides?.visible ?? true,
  };
}

// ─── Param Collection ───────────────────────────────────────────

/** Collect params for all patches, keyed by patch id */
export function collectCompositionParams(
  composition: Composition,
  registry: RegistryLike,
): Record<string, ParamDef[]> {
  const result: Record<string, ParamDef[]> = {};
  for (const patch of composition.patches) {
    result[patch.id] = collectParams(patch.graph, registry);
  }
  return result;
}

// ─── Evaluation ─────────────────────────────────────────────────

/**
 * Evaluate a composition: each visible patch → Buffer2D → composite.
 * Patches are blended back-to-front (index 0 = bottom layer).
 */
export function evaluateComposition(
  composition: Composition,
  registry: RegistryLike,
  env: GraphEnv,
  patchValues: Record<string, Record<string, number>>,
): Buffer2D | undefined {
  let result: Buffer2D | undefined;
  for (const patch of composition.patches) {
    if (!patch.visible) continue;

    const values = patchValues[patch.id] ?? {};
    const outputs = evaluateGraph(patch.graph, registry, env, values);
    const buf = findTerminalOutput<Buffer2D>(
      patch.graph,
      registry,
      outputs,
      "buffer",
    );
    if (!buf) continue;

    const layer = patch.opacity < 1 ? applyOpacity(buf, patch.opacity) : buf;

    if (!result) {
      result = layer;
      continue;
    }

    result = blendPair(result, layer, patch.blend);
  }

  return result;
}

// ─── Internal Blending ──────────────────────────────────────────

function applyOpacity(buf: Buffer2D, opacity: number): Buffer2D {
  const data = new Float32Array(buf.data);
  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i]! * opacity;
  }
  return { data, width: buf.width, height: buf.height, channels: buf.channels };
}

function blendPair(dst: Buffer2D, src: Buffer2D, mode: BlendMode): Buffer2D {
  const { width, height } = dst;
  const len = width * height * 4;
  const result = new Float32Array(dst.data);
  const sd = src.data;

  for (let i = 0; i < len; i += 4) {
    const sr = sd[i]!;
    const sg = sd[i + 1]!;
    const sb = sd[i + 2]!;
    const sa = sd[i + 3]!;
    const dr = result[i]!;
    const dg = result[i + 1]!;
    const db = result[i + 2]!;
    const da = result[i + 3]!;

    switch (mode) {
      case "over": {
        const outA = sa + da * (1 - sa);
        if (outA > 0) {
          result[i] = (sr * sa + dr * da * (1 - sa)) / outA;
          result[i + 1] = (sg * sa + dg * da * (1 - sa)) / outA;
          result[i + 2] = (sb * sa + db * da * (1 - sa)) / outA;
        }
        result[i + 3] = outA;
        break;
      }
      case "add": {
        result[i] = Math.min(1, dr + sr);
        result[i + 1] = Math.min(1, dg + sg);
        result[i + 2] = Math.min(1, db + sb);
        result[i + 3] = Math.min(1, da + sa);
        break;
      }
      case "multiply": {
        result[i] = dr * sr;
        result[i + 1] = dg * sg;
        result[i + 2] = db * sb;
        result[i + 3] = Math.min(1, da + sa * (1 - da));
        break;
      }
      case "screen": {
        result[i] = 1 - (1 - dr) * (1 - sr);
        result[i + 1] = 1 - (1 - dg) * (1 - sg);
        result[i + 2] = 1 - (1 - db) * (1 - sb);
        result[i + 3] = Math.min(1, da + sa * (1 - da));
        break;
      }
    }
  }

  return { data: result, width, height, channels: 4 };
}
