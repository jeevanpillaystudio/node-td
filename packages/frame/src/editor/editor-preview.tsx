"use client";

import { useEffect, useRef } from "react";
import type { Composition } from "@repo/generative";
import { evaluateComposition, createDefaultRegistry } from "@repo/generative";
import { blitBuffer2D } from "@repo/generative/render";

const registry = createDefaultRegistry();

interface EditorPreviewProps {
  composition: Composition;
  patchValues: Record<string, Record<string, number>>;
}

export function EditorPreview({ composition, patchValues }: EditorPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const valuesKey = JSON.stringify(patchValues);

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

      const buf = evaluateComposition(
        composition,
        registry,
        {
          width: virtualW,
          height: virtualH,
          dpr: 1,
          createCanvas: (cw: number, ch: number) => new OffscreenCanvas(cw, ch),
        },
        patchValues,
      );

      if (buf) {
        // putImageData ignores canvas transforms, so blit to a temp canvas
        // then drawImage through the current transform (dpr/scale)
        const tmp = new OffscreenCanvas(buf.width, buf.height);
        const tmpCtx = tmp.getContext("2d")!;
        blitBuffer2D(tmpCtx, buf);
        ctx.drawImage(tmp, 0, 0);
      }
    }

    draw();

    const ro = new ResizeObserver(draw);
    ro.observe(wrapper);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, composition]);

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
