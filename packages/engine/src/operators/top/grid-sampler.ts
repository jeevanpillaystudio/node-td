import type { Operator, Field2D, Buffer2D, GraphEnv } from "../../kernel/types";
import { getFieldExpr } from "../../kernel/field-expr";
import { compileField } from "../../kernel/field-compiler";
import { createWebGL2, renderFieldToBuffer } from "../../render/webgl";

type Inputs = { field: Field2D; width: number; height: number };
type Outputs = { buffer: Buffer2D };

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
        const createCanvas = (env as GraphEnv | undefined)?.createCanvas;
        if (createCanvas) {
          const canvas = createCanvas(cols, rows);
          const gl = createWebGL2(canvas);
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
        }
      } catch {
        // GPU failed — fall through to CPU
      }
    }

    // CPU path (original)
    const data = new Float32Array(cols * rows);
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        data[col + row * cols] = field(col, row) * Math.PI * 2;
      }
    }

    return { buffer: { data, width: cols, height: rows, channels: 1 } };
  },
};
