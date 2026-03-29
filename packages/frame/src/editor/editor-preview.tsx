"use client";

import { useEffect, useRef } from "react";
import type { Graph, Geometry, Buffer2D } from "@repo/generative";
import { createDefaultRegistry, CookEngine, SeededRNG } from "@repo/generative";
import { drawCanvas2D, blitBuffer2D, createWebGL2 } from "@repo/generative/render";

const registry = createDefaultRegistry();

function makeGL() {
  const canvas = new OffscreenCanvas(1, 1);
  return createWebGL2(canvas);
}

interface EditorPreviewProps {
  graph: Graph;
  values: Record<string, number>;
}

export function EditorPreview({ graph, values }: EditorPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CookEngine | null>(null);
  const engineGraphRef = useRef<Graph | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  if (!glRef.current) glRef.current = makeGL();

  useEffect(() => {
    // Create or replace engine when graph identity changes
    if (engineGraphRef.current !== graph) {
      engineRef.current = new CookEngine(graph, registry);
      engineGraphRef.current = graph;
    }
    const engine = engineRef.current!;
    engine.setParams(values);

    const canvas = canvasRef.current!;
    const wrapper = wrapperRef.current!;
    const ctx = canvas.getContext("2d")!;

    let rafId = 0;

    function scheduleDraw() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(draw);
    }

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

      // Cook — env diff auto-dirties dependents on resize
      engine.cook({
        width: virtualW,
        height: virtualH,
        dpr: 1, // Preview handles its own scaling via canvas transform
        rng: new SeededRNG(149149941),
        _gl: glRef.current,
        createCanvas: (cw: number, ch: number) => new OffscreenCanvas(cw, ch),
      });

      // ROP path: graph terminates with Buffer2D
      const buf = engine.findTerminalOutput<Buffer2D>("buffer");
      if (buf) {
        // putImageData ignores canvas transforms, so we blit to a temp canvas
        // then drawImage it through the current transform (dpr/scale)
        const tmp = new OffscreenCanvas(buf.width, buf.height);
        const tmpCtx = tmp.getContext("2d")!;
        blitBuffer2D(tmpCtx, buf);
        ctx.drawImage(tmp, 0, 0);
      } else {
        // Legacy fallback: graph terminates with Geometry
        const geo = engine.findTerminalOutput<Geometry<2>>("geometry");
        if (geo) {
          drawCanvas2D(ctx, virtualW, virtualH, geo);
        }
      }
    }

    scheduleDraw();

    const ro = new ResizeObserver(scheduleDraw);
    ro.observe(wrapper);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, graph]);

  return (
    <div
      ref={wrapperRef}
      className="h-full w-full overflow-hidden rounded-md border border-border/50"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
