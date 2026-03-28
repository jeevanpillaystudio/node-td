"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@repo/ui/lib/utils";
import type { Graph, Composition, BlendMode, ParamDef } from "@repo/generative";
import {
  collectParams,
  createDefaultRegistry,
  graphToComposition,
  evaluateComposition,
} from "@repo/generative";
import { blitBuffer2D } from "@repo/generative/render";
import { useOptionalFrameContext } from "./frame-provider";

const registry = createDefaultRegistry();

interface FrameProps {
  composition?: Composition;
  /** Convenience: wraps a single Graph into a one-patch Composition */
  graph?: Graph;
  id?: string;
  className?: string;
}

export function Frame({ composition: compProp, graph: graphProp, id: explicitId, className }: FrameProps) {
  const autoId = useId();
  const frameId = explicitId ?? `frame-${autoId}`;
  const ctx = useOptionalFrameContext();

  const ctxRegister = ctx?.register;
  const ctxUnregister = ctx?.unregister;
  const ctxSetActive = ctx?.setActive;
  const ctxSetEditing = ctx?.setEditing;
  const isActive = ctx?.activeId === frameId;

  // Resolve composition from props
  const initialComp = useMemo(
    () => compProp ?? (graphProp ? graphToComposition(graphProp) : undefined),
    [compProp, graphProp],
  );

  if (!initialComp) throw new Error("Frame requires either composition or graph prop");

  // Mutable composition state (blend/opacity/visible can change via editor)
  const [composition, setComposition] = useState(initialComp);
  const [activePatchId, setActivePatchId] = useState(composition.patches[0]?.id ?? "");

  // Per-patch params (derived from graphs) and values (mutable state)
  const patchParams = useMemo(() => {
    const result: Record<string, ParamDef[]> = {};
    for (const patch of composition.patches) {
      result[patch.id] = collectParams(patch.graph, registry);
    }
    return result;
  }, [composition]);

  const [patchValues, setPatchValues] = useState<Record<string, Record<string, number>>>(() => {
    const init: Record<string, Record<string, number>> = {};
    for (const [patchId, params] of Object.entries(patchParams)) {
      init[patchId] = Object.fromEntries(params.map((p) => [p.key, p.default]));
    }
    return init;
  });

  // Mutation callbacks
  const setParam = useCallback((patchId: string, key: string, v: number) => {
    setPatchValues((prev) => ({
      ...prev,
      [patchId]: { ...prev[patchId], [key]: v },
    }));
  }, []);

  const updatePatch = useCallback((patchId: string, updates: { blend?: BlendMode; opacity?: number; visible?: boolean }) => {
    setComposition((prev) => ({
      ...prev,
      patches: prev.patches.map((p) => (p.id === patchId ? { ...p, ...updates } : p)),
    }));
  }, []);

  // Stable refs for registration callbacks
  const setParamRef = useRef(setParam);
  setParamRef.current = setParam;
  const updatePatchRef = useRef(updatePatch);
  updatePatchRef.current = updatePatch;
  const setActivePatchRef = useRef(setActivePatchId);
  setActivePatchRef.current = setActivePatchId;

  // Register with inspector context when available (dev only)
  useEffect(() => {
    if (!ctxRegister) return;
    ctxRegister({
      id: frameId,
      name: composition.name,
      composition,
      activePatchId,
      patchParams,
      patchValues,
      setParam: (pid: string, k: string, v: number) => setParamRef.current(pid, k, v),
      updatePatch: (pid: string, u: { blend?: BlendMode; opacity?: number; visible?: boolean }) => updatePatchRef.current(pid, u),
      setActivePatch: (id: string) => setActivePatchRef.current(id),
    });
  }, [ctxRegister, frameId, composition, activePatchId, patchParams, patchValues]);

  useEffect(() => {
    if (!ctxUnregister) return;
    return () => ctxUnregister(frameId);
  }, [ctxUnregister, frameId]);

  // Canvas rendering
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const valuesKey = JSON.stringify(patchValues);

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

      const buf = evaluateComposition(
        composition,
        registry,
        {
          width: w,
          height: h,
          dpr,
          createCanvas: (cw: number, ch: number) => new OffscreenCanvas(cw, ch),
        },
        patchValues,
      );

      if (buf) {
        blitBuffer2D(canvasCtx, buf);
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
  }, [valuesKey, composition]);

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
