/// <reference lib="dom" />
import type { GenNode, Path } from "../types";

export const canvasRenderer: GenNode<
  {
    geometry: Path[];
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
  },
  void
> = {
  id: "canvas-renderer",
  family: "render",
  inputs: [
    { name: "geometry", type: "geometry" },
    { name: "ctx", type: "context" },
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  output: { name: "frame", type: "void" },
  params: [
    { key: "lineWidth", label: "Line Width", min: 0.5, max: 5, step: 0.1, default: 1.8 },
  ],
  evaluate({ geometry, ctx, width, height }, params) {
    const lineWidth = params.lineWidth ?? 1.8;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(217,217,217,0.65)";
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    for (const dash of geometry) {
      ctx.moveTo(dash[0]![0], dash[0]![1]);
      for (let j = 1; j < dash.length; j++) {
        ctx.lineTo(dash[j]![0], dash[j]![1]);
      }
    }

    ctx.stroke();
  },
};
