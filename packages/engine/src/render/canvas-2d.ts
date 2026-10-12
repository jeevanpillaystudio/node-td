import type { Geometry, Palette, Buffer2D } from "../kernel/types";

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

/**
 * Blit a Buffer2D onto a CanvasRenderingContext2D.
 *
 * Canvas-native fast path: when `buffer._canvas` is present, uses
 * `drawImage` — hardware-accelerated, zero CPU pixel conversion.
 *
 * CPU fallback: converts Float32 (0..1) → Uint8Clamped and uses putImageData.
 *
 * The buffer is usually a cached cook output, so it is never modified:
 * blitting it again takes the same path.
 */
export function blitBuffer2D(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  buffer: Buffer2D,
): void {
  const { width, height } = buffer;
  if (width === 0 || height === 0) return;

  // Canvas-native fast path — hardware-accelerated blit, no conversion
  if (buffer._canvas) {
    ctx.drawImage(buffer._canvas, 0, 0);
    return;
  }

  // CPU fallback
  const { data, channels } = buffer;
  const rgba = new Uint8ClampedArray(width * height * 4);

  if (channels === 4) {
    for (let i = 0; i < data.length; i++) {
      rgba[i] = Math.round((data[i] as number) * 255);
    }
  } else if (channels === 3) {
    const pixels = width * height;
    for (let i = 0; i < pixels; i++) {
      rgba[i * 4] = Math.round((data[i * 3] as number) * 255);
      rgba[i * 4 + 1] = Math.round((data[i * 3 + 1] as number) * 255);
      rgba[i * 4 + 2] = Math.round((data[i * 3 + 2] as number) * 255);
      rgba[i * 4 + 3] = 255;
    }
  } else if (channels === 1) {
    const pixels = width * height;
    for (let i = 0; i < pixels; i++) {
      const v = Math.round((data[i] as number) * 255);
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
  }

  const imageData = new ImageData(rgba, width, height);
  ctx.putImageData(imageData, 0, 0);
}
