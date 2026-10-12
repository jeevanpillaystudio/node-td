import type { Buffer2D } from "@node-td/kernel";
import { asOffscreen } from "./canvas-handle";

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
    ctx.drawImage(asOffscreen(buffer._canvas), 0, 0);
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
