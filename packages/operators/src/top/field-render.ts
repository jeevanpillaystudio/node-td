import type { Operator, Field2D, Buffer2D } from "@node-td/kernel";

type Inputs = { field: Field2D; width: number; height: number };
type Outputs = { buffer: Buffer2D };

/**
 * Field Render — rasterizes a Field2D into a Buffer2D.
 *
 * Evaluates the field at every device pixel on the CPU, so a browser
 * cook gives the same buffer as a headless one.
 *
 * Output is a single-channel Buffer2D at full resolution.
 */
export const fieldRender: Operator<Inputs, Outputs> = {
  id: "field-render",
  category: "top",
  label: "Field Render",
  inputs: [
    { name: "field", type: "field" },
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "buffer", type: "buffer" }],
  params: [
    { key: "scale", label: "Resolution Scale", min: 0.25, max: 2, step: 0.25, default: 1 },
  ],
  envReads: ["dpr"],

  evaluate({ field, width, height }, params, env) {
    const scale = params.scale ?? 1;
    const dpr = env.dpr;
    const bufW = Math.round(width * scale * dpr);
    const bufH = Math.round(height * scale * dpr);

    // Evaluate the field at every pixel
    const data = new Float32Array(bufW * bufH);
    const invScale = 1 / (scale * dpr);
    for (let row = 0; row < bufH; row++) {
      for (let col = 0; col < bufW; col++) {
        data[row * bufW + col] = field(col * invScale, row * invScale);
      }
    }

    return { buffer: { data, width: bufW, height: bufH, channels: 1 } };
  },
};
