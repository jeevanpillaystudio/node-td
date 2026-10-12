import { describe, expect, test } from "bun:test";
import type { Buffer2D, Graph } from "../src/index";
import { CookEngine, createDefaultRegistry, OperatorRegistry, SeededRNG } from "../src/index";
import {
  flowFieldGraph,
  meridianGraph,
  simplexFieldGraph,
  subscapesTerrain3dGraph,
  terrainHeightmapGraph,
} from "../src/patches/index";
import { blitBuffer2D } from "../src/render/canvas-2d";
import {
  createRecordingCanvasFactory,
  type Digest,
  digest,
  digestLog,
  withImageData,
} from "./support";

/**
 * Cook outputs are immutable. Neither a downstream operator nor a host
 * blitting the terminal may change what a node returned, so a re-blit or
 * a re-composite takes the same path as the first one, whatever happened
 * in between.
 *
 * Each gallery patch is cooked with every evaluate wrapped to fingerprint
 * its outputs on return. After the cook and a blit of the terminal, every
 * cached output must fingerprint the same.
 */

const GALLERY: readonly Graph[] = [
  meridianGraph,
  flowFieldGraph,
  terrainHeightmapGraph,
  simplexFieldGraph,
  subscapesTerrain3dGraph,
];

const SIZE = { width: 256, height: 256, dpr: 1 };
const SEED = 42;
const TIMEOUT_MS = 60_000;

/** One output port, as it was when evaluate returned it. */
interface Fingerprint {
  digest: Digest;
  /**
   * An object's own properties by identity (an accessor by its getter).
   * A digest ignores fields such as `_canvas`; this catches one set or cleared.
   */
  props: [string, unknown][] | null;
}

function ownProps(value: unknown): [string, unknown][] | null {
  if (value === null || typeof value !== "object") return null;
  return Object.entries(Object.getOwnPropertyDescriptors(value)).map(([key, d]) => [
    key,
    "value" in d ? d.value : d.get,
  ]);
}

function fingerprint(outputs: Record<string, unknown>): Map<string, Fingerprint> {
  const ports = new Map<string, Fingerprint>();
  for (const [port, value] of Object.entries(outputs)) {
    ports.set(port, { digest: digest(value, SIZE), props: ownProps(value) });
  }
  return ports;
}

/** What differs between two fingerprints of a node's outputs, one line per change. */
function changes(
  key: string,
  before: Map<string, Fingerprint>,
  after: Map<string, Fingerprint>,
): string[] {
  const out: string[] = [];
  for (const port of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(port);
    const b = after.get(port);
    if (!a || !b) {
      out.push(`${key}.${port}: port ${a ? "removed" : "added"}`);
      continue;
    }
    if (JSON.stringify(a.digest) !== JSON.stringify(b.digest)) {
      out.push(`${key}.${port}: contents changed`);
    }
    const aProps = new Map(a.props ?? []);
    const bProps = new Map(b.props ?? []);
    for (const prop of new Set([...aProps.keys(), ...bProps.keys()])) {
      if (!Object.is(aProps.get(prop), bProps.get(prop))) {
        out.push(`${key}.${port}.${prop}: changed`);
      }
    }
  }
  return out;
}

/** The default operators, each evaluate wrapped to record a fingerprint of what it returns. */
function fingerprintingRegistry(seen: Map<object, Map<string, Fingerprint>>): OperatorRegistry {
  const registry = new OperatorRegistry();
  for (const op of createDefaultRegistry().list()) {
    const evaluate = op.evaluate;
    if (!evaluate) {
      registry.register(op);
      continue;
    }
    registry.register({
      ...op,
      evaluate(inputs, params, env) {
        const outputs = evaluate(inputs, params, env);
        seen.set(outputs, fingerprint(outputs));
        return outputs;
      },
    });
  }
  return registry;
}

function cookEnv() {
  return {
    ...SIZE,
    rng: new SeededRNG(SEED),
    createCanvas: createRecordingCanvasFactory().createCanvas,
  };
}

/** Blit a buffer onto a fresh display canvas, the way Frame does, and digest the commands. */
function blit(buffer: Buffer2D): { hash: string; length: number } {
  const { createCanvas, log } = createRecordingCanvasFactory();
  const ctx = createCanvas(SIZE.width * SIZE.dpr, SIZE.height * SIZE.dpr).getContext("2d");
  if (!ctx) throw new Error("blit: the recording canvas gave no 2d context");
  withImageData(() => blitBuffer2D(ctx, buffer));
  return digestLog(log);
}

describe("cook outputs are immutable", () => {
  for (const graph of GALLERY) {
    test(
      graph.id,
      () => {
        const seen = new Map<object, Map<string, Fingerprint>>();
        const engine = new CookEngine(graph, fingerprintingRegistry(seen));
        const first = new Map(engine.cook(cookEnv()));

        const terminal = engine.findTerminalOutput<Buffer2D>("buffer");
        if (!terminal) throw new Error(`${graph.id}: no terminal buffer`);
        const firstBlit = blit(terminal);

        // Every cached output is what evaluate returned, unchanged
        const changed: string[] = [];
        for (const [key, outputs] of first) {
          const returned = seen.get(outputs);
          if (returned) changed.push(...changes(key, returned, fingerprint(outputs)));
          else changed.push(`${key}: the cache holds outputs evaluate never returned`);
        }
        expect(changed).toEqual([]);

        // A no-op second cook returns the same objects, and they blit the same way
        const second = engine.cook(cookEnv());
        expect(engine.stats.cooked).toBe(0);
        for (const [key, outputs] of first) expect(second.get(key)).toBe(outputs);
        expect(engine.findTerminalOutput<Buffer2D>("buffer")).toBe(terminal);
        expect(blit(terminal)).toEqual(firstBlit);

        // Re-cooking a composite alone takes the path its first cook took
        for (const [key, instance] of Object.entries(graph.nodes)) {
          if (instance.type !== "composite") continue;
          const before = seen.get(first.get(key) as object);
          if (!before) throw new Error(`${graph.id}: ${key} was never fingerprinted`);
          engine.setParams({ [`${key}.mode`]: instance.params?.mode ?? 0 });
          const outputs = engine.cook(cookEnv()).get(key);
          if (!outputs) throw new Error(`${graph.id}: ${key} did not re-cook`);
          expect(outputs).not.toBe(first.get(key));
          const after = fingerprint(outputs);
          const shape = (f: Map<string, Fingerprint>) =>
            [...f].map(([port, fp]) => [port, fp.digest, fp.props?.map(([prop]) => prop)]);
          expect(shape(after)).toEqual(shape(before));
        }
      },
      TIMEOUT_MS,
    );
  }
});
