import { useCallback, useEffect, useRef, useState } from "react";
import type { Graph, Buffer2D, NodeError, OperatorRegistry } from "@node-td/kernel";
import { CookEngine, GraphValidationError, SeededRNG } from "@node-td/kernel";
import { blitBuffer2D } from "@node-td/render-web";

interface EditorPreviewProps {
  graph: Graph;
  registry: OperatorRegistry;
  /** The Frame's seed, so the preview shows the same artwork. */
  seed: number | string;
  values: Record<string, number>;
}

/**
 * Draws the same way Frame does: one full cook per rAF draw, requested once
 * per change of graph or values, and by one ResizeObserver per mount when the
 * size or dpr changes.
 */
export function EditorPreview({ graph, registry, seed, values }: EditorPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  /** What the next draw cooks; the effect below keeps it current. */
  const inputsRef = useRef({ graph, registry, seed, values });
  /** The size and dpr of the last draw, or of the last resize seen since. */
  const sizeRef = useRef<Size | null>(null);
  const engineRef = useRef<{ graph: Graph; registry: OperatorRegistry; engine: CookEngine } | null>(
    null,
  );
  const rafRef = useRef(0);

  const draw = useCallback(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const size = measure(wrapper);
    sizeRef.current = size;
    const { width: displayW, height: displayH, dpr } = size;
    // A collapsed panel has no pixels to draw, and the rasterisers cannot
    // read back an empty canvas.
    if (displayW === 0 || displayH === 0) return;

    // Render at a larger virtual size so the art looks like a miniature,
    // not a zoomed-in crop of a tiny canvas.
    const scale = 4;
    const virtualW = displayW * scale;
    const virtualH = displayH * scale;

    const inputs = inputsRef.current;
    let message: string | null = null;
    try {
      const { graph, registry } = inputs;
      const prev = engineRef.current;
      const engine =
        prev && prev.graph === graph && prev.registry === registry
          ? prev.engine
          : new CookEngine(graph, registry);
      engineRef.current = { graph, registry, engine };
      engine.setParams(inputs.values);

      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr / scale, 0, 0, dpr / scale, 0, 0);

      engine.cook({
        width: virtualW,
        height: virtualH,
        dpr: 1, // Preview handles its own scaling via canvas transform
        rng: new SeededRNG(inputs.seed),
        createCanvas: (cw: number, ch: number) => new OffscreenCanvas(cw, ch),
      });

      // As in Frame: a node that threw shows as an error, not a partial image
      const failure = reportNodeErrors(graph.name, engine.stats.errors);
      const buf = engine.findTerminalOutput<Buffer2D>("buffer");
      if (failure) {
        message = failure;
      } else if (!buf) {
        message = "No image output";
      } else {
        // putImageData ignores canvas transforms, so we blit to a temp canvas
        // then drawImage it through the current transform (dpr/scale)
        const tmp = new OffscreenCanvas(buf.width, buf.height);
        const tmpCtx = tmp.getContext("2d");
        if (!ctx || !tmpCtx) {
          message = "No 2D canvas context";
        } else {
          blitBuffer2D(tmpCtx, buf);
          ctx.drawImage(tmp, 0, 0);
        }
      }
    } catch (err) {
      console.error(err);
      message =
        err instanceof GraphValidationError
          ? `Invalid graph: ${err.issues.join("; ")}`
          : `Cook failed: ${errorMessage(err)}`;
    } finally {
      // As in Frame: every draw is a full cook, since a partial re-cook
      // replays the shared random stream differently.
      engineRef.current?.engine.clearCache();
    }
    setError(message);
  }, []);

  const scheduleDraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // One observer per mount: it requests a draw only when the size or dpr
  // differs from the last one recorded.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => {
      const next = measure(wrapper);
      if (sameSize(sizeRef.current, next)) return;
      sizeRef.current = next;
      scheduleDraw();
    });
    ro.observe(wrapper);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [scheduleDraw]);

  // One draw per change of the graph, its params or seed
  useEffect(() => {
    inputsRef.current = { graph, registry, seed, values };
    scheduleDraw();
  }, [graph, registry, seed, values, scheduleDraw]);

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full overflow-hidden rounded-md border border-border/50"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {error !== null && (
        <div
          role="alert"
          className="absolute inset-0 flex items-center justify-center bg-card p-2 text-center font-mono text-xs text-muted-foreground"
        >
          {error}
        </div>
      )}
    </div>
  );
}

interface Size {
  width: number;
  height: number;
  dpr: number;
}

function measure(el: HTMLElement): Size {
  return { width: el.clientWidth, height: el.clientHeight, dpr: window.devicePixelRatio || 1 };
}

function sameSize(a: Size | null, b: Size): boolean {
  return a !== null && a.width === b.width && a.height === b.height && a.dpr === b.dpr;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Log each node that threw in the last cook, and describe the first for
 * the error state. Null when no node threw.
 */
function reportNodeErrors(
  graphName: string,
  errors: ReadonlyMap<string, NodeError>,
): string | null {
  const thrown: string[] = [];
  for (const [key, failure] of errors) {
    if (failure.kind !== "error") continue;
    console.error(`${graphName}: node "${key}" failed`, failure.error);
    thrown.push(`Cook failed in node "${key}": ${errorMessage(failure.error)}`);
  }
  const [first] = thrown;
  if (first === undefined) return null;
  return thrown.length > 1 ? `${first} (and ${thrown.length - 1} more)` : first;
}
