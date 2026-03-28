"use client";

import { useEffect, useRef } from "react";
import {
  perlinNoiseGrid,
  circlePackSeeds,
  flowTracer,
  dashStroke,
  canvasRenderer,
} from "../../_lib/generative/nodes";
import type { ParamDef, GenNode } from "../../_lib/generative/types";

/** All nodes in evaluation order */
export const FLOW_FIELD_NODES: GenNode[] = [
  perlinNoiseGrid,
  circlePackSeeds,
  flowTracer,
  dashStroke,
  canvasRenderer,
];

/** Flattened params for the DevTuner */
export const FLOW_FIELD_PARAMS: ParamDef[] = FLOW_FIELD_NODES.flatMap(
  (n) => n.params,
);

const DEFAULTS: Record<string, number> = Object.fromEntries(
  FLOW_FIELD_PARAMS.map((p) => [p.key, p.default]),
);

export function ManifestoShader({
  config,
}: {
  config?: Record<string, number>;
}) {
  const params = config ? { ...DEFAULTS, ...config } : DEFAULTS;
  const paramsKey = JSON.stringify(params);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrapper = wrapperRef.current!;
    const overlay = overlayRef.current!;
    const ctx = canvas.getContext("2d")!;

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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Evaluate the node graph
      const grid = perlinNoiseGrid.evaluate({ width: w, height: h }, params);
      const seeds = circlePackSeeds.evaluate({ width: w, height: h }, params);
      const paths = flowTracer.evaluate({ grid, points: seeds }, params);
      const segments = dashStroke.evaluate({ paths }, params);
      canvasRenderer.evaluate({ segments, ctx, width: w, height: h }, params);
    }

    draw();

    const ro = new ResizeObserver(draw);
    ro.observe(wrapper);

    return () => {
      clearTimeout(revealTimer);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "clip",
        pointerEvents: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {/* Reveal overlay: starts opaque, fades to transparent */}
      <div
        aria-hidden="true"
        ref={overlayRef}
        style={{
          position: "absolute",
          inset: 0,
          background: "#1a1a1a",
          pointerEvents: "none",
          zIndex: 3,
        }}
      />
    </div>
  );
}
