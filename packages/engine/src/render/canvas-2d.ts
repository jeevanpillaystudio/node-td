import type { Geometry, Palette } from "../core/types";

export interface Canvas2DOptions {
  background?: string;
  strokeColor?: string;
  strokeAlpha?: number;
  lineWidth?: number;
}

/**
 * Draw a Geometry<2> onto a CanvasRenderingContext2D.
 *
 * This is the first render backend — pure Canvas2D, no WebGL.
 * The graph produces data; this function produces pixels.
 */
export function drawCanvas2D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  geometry: Geometry<2>,
  _palette?: Palette,
  options: Canvas2DOptions = {},
): void {
  const {
    background = "#1a1a1a",
    strokeColor = "217,217,217",
    strokeAlpha = 0.65,
    lineWidth = 1.8,
  } = options;

  // Background
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const { positions, dim, topology, stripOffsets, vertexCount, indices } =
    geometry;

  if (topology === "points") {
    ctx.fillStyle = `rgba(${strokeColor},${strokeAlpha})`;
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * dim] as number;
      const y = positions[i * dim + 1] as number;
      ctx.beginPath();
      ctx.arc(x, y, lineWidth, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  ctx.strokeStyle = `rgba(${strokeColor},${strokeAlpha})`;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (topology === "line-strip") {
    ctx.beginPath();

    if (stripOffsets) {
      for (let s = 0; s < stripOffsets.length; s++) {
        const start = stripOffsets[s] as number;
        const end =
          s < stripOffsets.length - 1
            ? (stripOffsets[s + 1] as number)
            : vertexCount;
        if (end - start < 2) continue;

        ctx.moveTo(
          positions[start * dim] as number,
          positions[start * dim + 1] as number,
        );
        for (let i = start + 1; i < end; i++) {
          ctx.lineTo(
            positions[i * dim] as number,
            positions[i * dim + 1] as number,
          );
        }
      }
    } else if (vertexCount >= 2) {
      ctx.moveTo(positions[0] as number, positions[1] as number);
      for (let i = 1; i < vertexCount; i++) {
        ctx.lineTo(
          positions[i * dim] as number,
          positions[i * dim + 1] as number,
        );
      }
    }

    ctx.stroke();
    return;
  }

  if (topology === "triangles") {
    // Wireframe rendering
    ctx.beginPath();
    if (indices) {
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] as number;
        const b = indices[i + 1] as number;
        const c = indices[i + 2] as number;
        ctx.moveTo(
          positions[a * dim] as number,
          positions[a * dim + 1] as number,
        );
        ctx.lineTo(
          positions[b * dim] as number,
          positions[b * dim + 1] as number,
        );
        ctx.lineTo(
          positions[c * dim] as number,
          positions[c * dim + 1] as number,
        );
        ctx.closePath();
      }
    }
    ctx.stroke();
  }
}
