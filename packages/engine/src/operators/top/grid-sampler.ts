import type { Operator, Field2D, Buffer2D } from "../../core/types";

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
  evaluate({ field, width, height }, params) {
    const resolution = params.resolution ?? 20;
    const cols = Math.ceil(width / resolution);
    const rows = Math.ceil(height / resolution);
    const data = new Float32Array(cols * rows);

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        data[col + row * cols] = field(col, row) * Math.PI * 2;
      }
    }

    return { buffer: { data, width: cols, height: rows, channels: 1 } };
  },
};
