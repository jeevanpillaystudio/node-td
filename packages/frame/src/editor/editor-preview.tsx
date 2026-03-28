"use client";

import { useEffect, useRef } from "react";
import type { Graph, Geometry } from "@repo/generative";
import { evaluateGraph, createDefaultRegistry, findTerminalOutput } from "@repo/generative";
import { drawCanvas2D } from "@repo/generative/render";

const registry = createDefaultRegistry();

interface EditorPreviewProps {
  graph: Graph;
  values: Record<string, number>;
}

export function EditorPreview({ graph, values }: EditorPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const valuesKey = JSON.stringify(values);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrapper = wrapperRef.current!;
    const ctx = canvas.getContext("2d")!;

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const displayW = wrapper.clientWidth;
      const displayH = wrapper.clientHeight;

      // Render at a larger virtual size so the art looks like a miniature,
      // not a zoomed-in crop of a tiny canvas.
      const scale = 4;
      const virtualW = displayW * scale;
      const virtualH = displayH * scale;

      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      ctx.setTransform(dpr / scale, 0, 0, dpr / scale, 0, 0);

      const outputs = evaluateGraph(graph, registry, { width: virtualW, height: virtualH }, values);
      const geo = findTerminalOutput<Geometry<2>>(graph, registry, outputs, "geometry");
      if (geo) {
        drawCanvas2D(ctx, virtualW, virtualH, geo);
      }
    }

    draw();

    const ro = new ResizeObserver(draw);
    ro.observe(wrapper);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, graph]);

  return (
    <div
      ref={wrapperRef}
      className="h-full w-full overflow-hidden rounded-md border border-border/50"
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
      />
    </div>
  );
}
