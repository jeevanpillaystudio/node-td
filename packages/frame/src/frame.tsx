import {
  Component,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Graph, Buffer2D, NodeError, OperatorRegistry, ParamDef } from "@node-td/kernel";
import { collectParams, CookEngine, GraphValidationError, SeededRNG } from "@node-td/kernel";
import { defaultRegistry } from "@node-td/operators";
import { blitBuffer2D } from "@node-td/render-web";
import { FrameHostContext } from "./frame-host";

/** The seed every gallery artwork was tuned with. */
const DEFAULT_SEED = 42;

interface FrameProps {
  graph: Graph;
  id?: string;
  className?: string;
  /** Inline styles for the outer element, which is `position: relative` unless this says otherwise. */
  style?: CSSProperties;
  /** Operators the graph's node types resolve against. Defaults to the built-in operators. */
  registry?: OperatorRegistry;
  /** Seed for the random stream the graph's operators draw from. */
  seed?: number | string;
}

export function Frame({
  graph,
  id: explicitId,
  className,
  style,
  registry = defaultRegistry(),
  seed = DEFAULT_SEED,
}: FrameProps) {
  const autoId = useId();
  const frameId = explicitId ?? `frame-${autoId}`;

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <FrameErrorBoundary graph={graph} registry={registry}>
        <FrameView graph={graph} frameId={frameId} registry={registry} seed={seed} />
      </FrameErrorBoundary>
    </div>
  );
}

interface FrameViewProps {
  graph: Graph;
  frameId: string;
  registry: OperatorRegistry;
  seed: number | string;
}

function FrameView({ graph, frameId, registry, seed }: FrameViewProps) {
  const host = useContext(FrameHostContext);

  const params = useMemo(() => collectParams(graph, registry), [graph, registry]);
  const [values, setValues] = useState(() => defaultValues(params));

  // Param overrides belong to the graph they were made on: a new graph (or
  // registry) starts again from its own defaults.
  const [valuesParams, setValuesParams] = useState(params);
  if (valuesParams !== params) {
    setValuesParams(params);
    setValues(defaultValues(params));
  }

  const set = useCallback(
    (key: string, v: number) => setValues((prev) => ({ ...prev, [key]: v })),
    [],
  );

  // Register with the host (the dev editor) when one is mounted
  useEffect(() => {
    host?.register({ id: frameId, name: graph.name, graph, registry, seed, params, values, set });
  }, [host, frameId, graph, registry, seed, params, values, set]);

  useEffect(() => {
    if (!host) return;
    return () => host.unregister(frameId);
  }, [host, frameId]);

  // ── Visibility gating via IntersectionObserver ───────────────
  // Off-screen frames don't cook at all; a frame cooks when it scrolls
  // into view. This is the most impactful optimization for pages with
  // many panels.
  const [isVisible, setVisible] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry) setVisible(entry.isIntersecting); },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ── Drawing ───────────────────────────────────────────────────
  // Every draw is one full cook in a requestAnimationFrame callback, and a
  // new request replaces a pending one. Two things request draws: the
  // effect below, once per change of what the frame shows, and one
  // ResizeObserver per mount, when the size or dpr changes.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  /** What the next draw cooks; the effect below keeps it current. */
  const inputsRef = useRef({ graph, registry, seed, values, isVisible });
  /** The size and dpr of the last draw, or of the last resize seen since. */
  const sizeRef = useRef<Size | null>(null);
  const engineRef = useRef<{ graph: Graph; registry: OperatorRegistry; engine: CookEngine } | null>(
    null,
  );
  const rafRef = useRef(0);
  const hasDrawnRef = useRef(false);

  const draw = useCallback(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    const inputs = inputsRef.current;
    if (!wrapper || !canvas || !inputs.isVisible) return;

    const size = measure(wrapper);
    sizeRef.current = size;
    const { width, height, dpr } = size;
    // A collapsed or hidden container has no pixels to draw, and the
    // rasterisers cannot read back an empty canvas.
    if (width === 0 || height === 0) return;

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

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      engine.cook({
        width,
        height,
        dpr,
        rng: new SeededRNG(inputs.seed),
        createCanvas: (cw: number, ch: number) => new OffscreenCanvas(cw, ch),
      });

      // A node that threw leaves the artwork incomplete: show the error
      // instead, even if another branch still produced an image.
      const failure = reportNodeErrors(graph.name, engine.stats.errors);
      // The buffer is already at full pixel resolution (DPR-aware)
      const buf = engine.findTerminalOutput<Buffer2D>("buffer");
      const ctx = canvas.getContext("2d");
      if (failure) message = failure;
      else if (!buf) message = "Nothing to draw: the graph has no image output.";
      else if (!ctx) message = "This browser gave the canvas no 2D context.";
      else blitBuffer2D(ctx, buf);
    } catch (err) {
      console.error(err);
      message =
        err instanceof GraphValidationError
          ? `Invalid graph: ${err.issues.join("; ")}`
          : `Cook failed: ${errorMessage(err)}`;
    } finally {
      // Free intermediate buffers — critical for multi-panel pages.
      // Without this, cached Float32Arrays from all panels persist
      // simultaneously (~100 MB per panel at 2× DPR), crashing the tab.
      // The next draw is a full re-cook, which is fine for static graphs.
      engineRef.current?.engine.clearCache();
    }
    setError(message);

    // Reveal after the first successful draw
    const cover = coverRef.current;
    if (message === null && !hasDrawnRef.current && cover) {
      hasDrawnRef.current = true;
      cover.style.transition = "opacity 1.5s ease-in-out";
      cover.style.opacity = "0";
    }
  }, []);

  const scheduleDraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // One observer for the life of the frame. It requests a draw only when
  // the size or dpr differs from the last one recorded (by a draw or by
  // itself), so the notification observe() sends adds no second cook.
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

  // One draw per change of the graph, its params or seed, or visibility
  useEffect(() => {
    inputsRef.current = { graph, registry, seed, values, isVisible };
    if (isVisible) scheduleDraw();
  }, [graph, registry, seed, values, isVisible, scheduleDraw]);

  return (
    <>
      <div
        ref={wrapperRef}
        style={{ position: "absolute", inset: 0, overflow: "clip", pointerEvents: "none" }}
      >
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
        <div
          aria-hidden="true"
          ref={coverRef}
          style={{ position: "absolute", inset: 0, background: "#1a1a1a", pointerEvents: "none", zIndex: 3 }}
        />
      </div>
      {error !== null && <FrameError message={error} />}
      {host?.renderOverlay?.(frameId)}
    </>
  );
}

interface BoundaryProps {
  graph: Graph;
  registry: OperatorRegistry;
  children: ReactNode;
}

interface BoundaryState {
  graph: Graph;
  registry: OperatorRegistry;
  error: Error | null;
}

/**
 * Keeps an error thrown while rendering a Frame, such as a graph naming an
 * operator the registry lacks, inside the Frame instead of unmounting the
 * page. A new graph or registry gets a fresh try.
 */
class FrameErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { graph: this.props.graph, registry: this.props.registry, error: null };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState,
  ): Partial<BoundaryState> | null {
    if (props.graph === state.graph && props.registry === state.registry) return null;
    return { graph: props.graph, registry: props.registry, error: null };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return <FrameError message={`Cannot render ${this.props.graph.name}: ${error.message}`} />;
    }
    return this.props.children;
  }
}

function FrameError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "#1a1a1a",
        color: "#a3a3a3",
        font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
        textAlign: "center",
        overflowWrap: "anywhere",
      }}
    >
      {message}
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

function defaultValues(params: ParamDef[]): Record<string, number> {
  return Object.fromEntries(params.map((p) => [p.key, p.default]));
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
