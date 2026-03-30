import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "./ui/utils";
import type { Graph, Geometry, Buffer2D } from "@node-td/engine";
import { collectParams, createDefaultRegistry, CookEngine, SeededRNG } from "@node-td/engine";
import { drawCanvas2D, blitBuffer2D, createWebGL2 } from "@node-td/engine/render";
import { useOptionalFrameContext } from "./frame-provider";

const registry = createDefaultRegistry();

// ── Shared WebGL2 context (lazy singleton) ────────────────────
// One GL context shared across ALL Frame instances. Eliminates the
// browser's ~8-16 context limit issue. The field-render shader cache
// is keyed by GL context, so sharing also shares the cache.
let _sharedGL: WebGL2RenderingContext | null | undefined;
function getSharedGL(): WebGL2RenderingContext | null {
  if (_sharedGL !== undefined) return _sharedGL;
  if (typeof OffscreenCanvas === "undefined") {
    _sharedGL = null;
    return null;
  }
  _sharedGL = createWebGL2(new OffscreenCanvas(1, 1));
  return _sharedGL;
}

// ── Frame budget target ──────────────────────────────────────────
// Target 8ms per cook pass to stay under 16ms frame budget (60fps).
const COOK_BUDGET_MS = 8;

interface FrameProps {
  graph: Graph;
  id?: string;
  className?: string;
}

export function Frame({ graph, id: explicitId, className }: FrameProps) {
  const autoId = useId();
  const frameId = explicitId ?? `frame-${autoId}`;
  const ctx = useOptionalFrameContext();

  const ctxRegister = ctx?.register;
  const ctxUnregister = ctx?.unregister;
  const ctxSetActive = ctx?.setActive;
  const ctxSetEditing = ctx?.setEditing;
  const isActive = ctx?.activeId === frameId;

  const params = useMemo(() => collectParams(graph, registry), [graph]);
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(params.map((p) => [p.key, p.default])),
  );

  const set = useCallback(
    (key: string, v: number) => setValues((prev) => ({ ...prev, [key]: v })),
    [],
  );

  const setRef = useRef(set);
  setRef.current = set;

  // Register with inspector context when available (dev only)
  useEffect(() => {
    if (!ctxRegister) return;
    ctxRegister({
      id: frameId,
      name: graph.name,
      graph,
      params,
      values,
      set: (k: string, v: number) => setRef.current(k, v),
    });
  }, [ctxRegister, frameId, graph, graph.name, params, values]);

  useEffect(() => {
    if (!ctxUnregister) return;
    return () => ctxUnregister(frameId);
  }, [ctxUnregister, frameId]);

  // ── Visibility gating via IntersectionObserver ──��────────────
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
  const hasDrawnRef = useRef(false);

  useEffect(() => {
    // Don't cook until visible
    if (!isVisible) return;

    // Create or replace engine when graph identity changes
    if (engineGraphRef.current !== graph) {
      // Dispose old engine's GPU resources before replacing
      engineRef.current?.dispose();
      engineRef.current = new CookEngine(graph, registry);
      engineGraphRef.current = graph;
    }
    const engine = engineRef.current!;

    // Diff params — only marks changed nodes dirty
    engine.setParams(values);

    const canvas = canvasRef.current!;
    const wrapper = wrapperRef.current!;
    const overlay = overlayRef.current!;
    const canvasCtx = canvas.getContext("2d")!;

    let rafId = 0;
    let cancelled = false;

    function getEnv() {
      const dpr = window.devicePixelRatio || 1;
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      return {
        width: w,
        height: h,
        dpr,
        rng: new SeededRNG(42),
        _gl: getSharedGL(),
        createCanvas: (cw: number, ch: number) => new OffscreenCanvas(cw, ch),
      };
    }

    function draw() {
      if (cancelled) return;

      const env = getEnv();
      const dpr = env.dpr as number;
      const w = env.width as number;
      const h = env.height as number;

      canvas.width = w * dpr;
      canvas.height = h * dpr;

      // Budgeted cook — yields if over budget, resumes next frame
      const result = engine.cookIncremental(env, COOK_BUDGET_MS);

      if (!result.done) {
        // Cook not finished — continue next frame
        rafId = requestAnimationFrame(draw);
        return;
      }

      // Cook complete — blit terminal output
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

      // Cache is preserved across frames — the dirty-flag system ensures
      // only changed nodes re-evaluate. Static graphs skip cooking entirely
      // after first render. GPU resources are cleaned up on unmount/graph change.

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

    scheduleDraw();

    const ro = new ResizeObserver(scheduleDraw);
    ro.observe(wrapper);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      // Dispose GPU resources when unmounting
      engineRef.current?.dispose();
      engineRef.current = null;
      engineGraphRef.current = null;
    };
  }, [values, graph, isVisible]);

  const canvasEl = (
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
  );

  if (!ctx) {
    return <div className={className}>{canvasEl}</div>;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => ctxSetActive?.(frameId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") ctxSetActive?.(frameId);
      }}
      className={cn(
        "relative cursor-pointer outline-2 outline-dashed outline-transparent transition-[outline-color]",
        isActive ? "outline-ring" : "hover:outline-ring/50",
        className,
      )}
    >
      {canvasEl}
      {/* Edit button — visible when frame is active */}
      {isActive && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            ctxSetEditing?.(frameId);
          }}
          className="absolute top-2 right-2 z-10 rounded-md border border-border/50 bg-card/80 px-2.5 py-1 font-mono text-xs text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
        >
          Edit Graph
        </button>
      )}
    </div>
  );
}
