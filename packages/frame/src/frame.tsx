"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@repo/ui/lib/utils";
import type { Graph, Geometry, Buffer2D } from "@repo/generative";
import { collectParams, evaluateGraph, createDefaultRegistry, findTerminalOutput } from "@repo/generative";
import { drawCanvas2D, blitBuffer2D } from "@repo/generative/render";
import { useOptionalFrameContext } from "./frame-provider";

const registry = createDefaultRegistry();

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
      set: (k, v) => setRef.current(k, v),
    });
  }, [ctxRegister, frameId, graph.name, params, values]);

  useEffect(() => {
    if (!ctxUnregister) return;
    return () => ctxUnregister(frameId);
  }, [ctxUnregister, frameId]);

  // Canvas rendering
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const valuesKey = JSON.stringify(values);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrapper = wrapperRef.current!;
    const overlay = overlayRef.current!;
    const canvasCtx = canvas.getContext("2d")!;

    const revealTimer = setTimeout(() => {
      overlay.style.transition = "opacity 2s ease-in-out";
      overlay.style.opacity = "0";
    }, 300);

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;

      canvas.width = w * dpr;
      canvas.height = h * dpr;

      // Evaluate graph — pure computation, no side effects
      // DPR is passed via env so ROPs can render at full pixel resolution
      const outputs = evaluateGraph(
        graph,
        registry,
        {
          width: w,
          height: h,
          dpr,
          createCanvas: (cw: number, ch: number) => new OffscreenCanvas(cw, ch),
        },
        values,
      );

      // ROP path: buffer is already at full pixel resolution (DPR-aware)
      const buf = findTerminalOutput<Buffer2D>(graph, registry, outputs, "buffer");
      if (buf) {
        blitBuffer2D(canvasCtx, buf);
      } else {
        // Legacy fallback: apply DPR transform for direct geometry drawing
        canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const geo = findTerminalOutput<Geometry<2>>(graph, registry, outputs, "geometry");
        if (geo) {
          drawCanvas2D(canvasCtx, w, h, geo);
        }
      }
    }

    draw();

    const ro = new ResizeObserver(draw);
    ro.observe(wrapper);

    return () => {
      clearTimeout(revealTimer);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, graph]);

  const canvas = (
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
    return <div className={className}>{canvas}</div>;
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
      {canvas}
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
