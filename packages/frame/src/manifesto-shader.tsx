"use client";

import { useEffect, useRef } from "react";
import type { Graph } from "../../_lib/generative/graph";
import { collectParams, evaluateGraph } from "../../_lib/generative/graph";
import { flowFieldGraph } from "../../_lib/generative/patches";

export function ManifestoShader({
  graph = flowFieldGraph,
  config,
}: {
  graph?: Graph;
  config?: Record<string, number>;
}) {
  const defaults = Object.fromEntries(
    collectParams(graph).map((p) => [p.key, p.default]),
  );
  const params = config ? { ...defaults, ...config } : defaults;
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

      evaluateGraph(graph, { width: w, height: h, ctx }, params);
    }

    draw();

    const ro = new ResizeObserver(draw);
    ro.observe(wrapper);

    return () => {
      clearTimeout(revealTimer);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, graph]);

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
