import type { FlowGrid, GenNode, Sampler2D } from "../types";

/** Bridge node: samples a continuous Sampler2D onto a discrete FlowGrid. */
export const gridSampler: GenNode<
  { sampler: Sampler2D; width: number; height: number },
  FlowGrid
> = {
  id: "grid-sampler",
  family: "field",
  inputs: [
    { name: "sampler", type: "sampler" },
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  output: { name: "field", type: "field" },
  params: [
    { key: "resolution", label: "Resolution (px)", min: 5, max: 60, step: 1, default: 20 },
  ],
  evaluate({ sampler, width, height }, params) {
    const resolution = params.resolution ?? 20;
    const cols = Math.ceil(width / resolution);
    const rows = Math.ceil(height / resolution);
    const data = new Float32Array(cols * rows);
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        data[col + row * cols] = sampler(col, row) * Math.PI * 2;
      }
    }
    return { data, cols, rows, resolution };
  },
};
