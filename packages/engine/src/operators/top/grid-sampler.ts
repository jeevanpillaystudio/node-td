import type { Operator, Field2D, Buffer2D, GraphEnv } from "../../kernel/types";
import { getFieldExpr } from "../../kernel/field-expr";
import { compileField } from "../../kernel/field-compiler";
import { renderFieldToBuffer } from "../../render/webgl";

type Inputs = { field: Field2D; width: number; height: number };
type Outputs = { buffer: Buffer2D };

// ─── Shared GL context via env ────────────────────────────────
// Reuses the caller's GL context (same pattern as field-render.ts).
// Avoids creating a new WebGL context per evaluation, which would
// exhaust the browser's ~8-16 context limit.

function getGL(env: GraphEnv | undefined, w: number, h: number): WebGL2RenderingContext | null {
  const existing = (env as Record<string, unknown> | undefined)?._gl as WebGL2RenderingContext | undefined;
  if (existing) {
    const canvas = existing.canvas as OffscreenCanvas;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return existing;
  }
  return null;
}

/** Discretizes a continuous Field2D into a Buffer2D of angles (0..2π). */
export const gridSampler: Operator<Inputs, Outputs> = {
  id: "grid-sampler",
  category: "top",
  label: "Grid Sampler",
  inputs: [
    { name: "field", type: "field" },
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "buffer", type: "buffer" }],
  params: [
    { key: "resolution", label: "Resolution (px)", min: 5, max: 60, step: 1, default: 20 },
  ],
  evaluate({ field, width, height }, params, env) {
    const resolution = params.resolution ?? 20;
    const cols = Math.ceil(width / resolution);
    const rows = Math.ceil(height / resolution);

    // Try GPU path for large grids
    const expr = getFieldExpr(field);
    if (expr && cols * rows > 500) {
      try {
        const gl = getGL(env as GraphEnv | undefined, cols, rows);
        if (gl) {
          const compiled = compileField(expr);
          const rawBuf = renderFieldToBuffer(gl, compiled, cols, rows);
          // Convert field values to angles (0..2π)
          const data = new Float32Array(cols * rows);
          for (let i = 0; i < rawBuf.data.length; i++) {
            data[i] = rawBuf.data[i]! * Math.PI * 2;
          }
          return { buffer: { data, width: cols, height: rows, channels: 1 } };
        }
      } catch {
        // GPU failed — fall through to CPU
      }
    }

    // CPU path — sample at pixel coordinates (not grid indices)
    const data = new Float32Array(cols * rows);
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        data[col + row * cols] = field(col * resolution, row * resolution) * Math.PI * 2;
      }
    }

    return { buffer: { data, width: cols, height: rows, channels: 1 } };
  },
};
