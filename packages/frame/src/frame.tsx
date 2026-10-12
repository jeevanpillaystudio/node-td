import {
  type CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Graph, Geometry, Buffer2D, OperatorRegistry } from "@node-td/kernel";
import { collectParams, CookEngine, SeededRNG } from "@node-td/kernel";
import { defaultRegistry } from "@node-td/operators";
import { drawCanvas2D, blitBuffer2D } from "@node-td/render-web";
import { FrameHostContext } from "./frame-host";

/** The seed every gallery artwork was tuned with. */
const DEFAULT_SEED = 42;

// ── Staggered cook scheduler ──────────────────────────────────
// When many Frames mount simultaneously (e.g., debug page with 10
// panels), each frame gets an increasing delay so cooks spread across
// animation frames instead of all blocking the same tick.
let _mountOrder = 0;

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
  const host = useContext(FrameHostContext);

  const params = useMemo(() => collectParams(graph, registry), [graph, registry]);
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(params.map((p) => [p.key, p.default])),
  );

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
  // Off-screen frames don't cook at all. When the frame scrolls into
  // view, it enters the cook queue. This is the most impactful
  // optimization for pages with many panels.
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

  // Canvas rendering — persistent CookEngine for incremental evaluation
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CookEngine | null>(null);
  const engineGraphRef = useRef<Graph | null>(null);
  const engineRegistryRef = useRef<OperatorRegistry | null>(null);
  const staggerRef = useRef(-1);
  const hasDrawnRef = useRef(false);
  if (staggerRef.current === -1) staggerRef.current = _mountOrder++;

  useEffect(() => {
    // Don't cook until visible
    if (!isVisible) return;

    // Create or replace engine when graph or registry identity changes
    if (engineGraphRef.current !== graph || engineRegistryRef.current !== registry) {
      engineRef.current = new CookEngine(graph, registry);
      engineGraphRef.current = graph;
      engineRegistryRef.current = registry;
    }
    const engine = engineRef.current!;

    // Diff params — only marks changed nodes dirty
    engine.setParams(values);

    const canvas = canvasRef.current!;
    const wrapper = wrapperRef.current!;
    const overlay = overlayRef.current!;
    const canvasCtx = canvas.getContext("2d")!;

    let rafId = 0;
    let staggerTimer: ReturnType<typeof setTimeout> | undefined;

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;

      canvas.width = w * dpr;
      canvas.height = h * dpr;

      // Cook — env diff auto-dirties on resize
      engine.cook({
        width: w,
        height: h,
        dpr,
        rng: new SeededRNG(seed),
        createCanvas: (cw: number, ch: number) => new OffscreenCanvas(cw, ch),
      });

      // ROP path: buffer is already at full pixel resolution (DPR-aware)
      const buf = engine.findTerminalOutput<Buffer2D>("buffer");
      if (buf) {
        blitBuffer2D(canvasCtx, buf);
      } else {
        // Legacy fallback: apply DPR transform for direct geometry drawing
        canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const geo = engine.findTerminalOutput<Geometry<2>>("geometry");
        if (geo) {
          drawCanvas2D(canvasCtx, w, h, geo);
        }
      }

      // Free intermediate buffers — critical for multi-panel pages.
      // Without this, cached Float32Arrays from all panels persist
      // simultaneously (~100 MB per panel at 2× DPR), crashing the tab.
      // Next resize triggers a full re-cook which is fine for static graphs.
      engine.clearCache();

      // Reveal after first draw
      if (!hasDrawnRef.current) {
        hasDrawnRef.current = true;
        overlay.style.transition = "opacity 1.5s ease-in-out";
        overlay.style.opacity = "0";
      }
    }

    function scheduleDraw() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(draw);
    }

    // First render: stagger by mount order (~32ms between each frame)
    // Subsequent renders (resize, param change): immediate
    if (!hasDrawnRef.current) {
      const delay = staggerRef.current * 32;
      staggerTimer = setTimeout(scheduleDraw, delay);
    } else {
      scheduleDraw();
    }

    const ro = new ResizeObserver(scheduleDraw);
    ro.observe(wrapper);

    return () => {
      cancelAnimationFrame(rafId);
      if (staggerTimer !== undefined) clearTimeout(staggerTimer);
      ro.disconnect();
    };
  }, [values, graph, registry, seed, isVisible]);

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <div
        ref={wrapperRef}
        style={{ position: "absolute", inset: 0, overflow: "clip", pointerEvents: "none" }}
      >
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
        <div
          aria-hidden="true"
          ref={overlayRef}
          style={{ position: "absolute", inset: 0, background: "#1a1a1a", pointerEvents: "none", zIndex: 3 }}
        />
      </div>
      {host?.renderOverlay?.(frameId)}
    </div>
  );
}
