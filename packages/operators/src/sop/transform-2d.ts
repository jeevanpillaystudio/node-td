import type { Operator, Geometry } from "@node-td/kernel";

type Inputs = { geometry: Geometry<2> };
type Outputs = { geometry: Geometry<2> };

/**
 * Transform 2D — applies an affine transform (translate, rotate, scale)
 * to all vertex positions. Produces a new Geometry, no mutation.
 */
export const transform2d: Operator<Inputs, Outputs> = {
  id: "transform-2d",
  category: "sop",
  label: "Transform 2D",
  inputs: [{ name: "geometry", type: "geometry" }],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [
    { key: "translateX", label: "Translate X", min: -2000, max: 2000, step: 1, default: 0 },
    { key: "translateY", label: "Translate Y", min: -2000, max: 2000, step: 1, default: 0 },
    { key: "rotation", label: "Rotation (rad)", min: -Math.PI, max: Math.PI, step: 0.01, default: 0 },
    { key: "scaleX", label: "Scale X", min: 0.01, max: 10, step: 0.01, default: 1 },
    { key: "scaleY", label: "Scale Y", min: 0.01, max: 10, step: 0.01, default: 1 },
  ],

  evaluate({ geometry }, params) {
    const tx = params.translateX ?? 0;
    const ty = params.translateY ?? 0;
    const rot = params.rotation ?? 0;
    const sx = params.scaleX ?? 1;
    const sy = params.scaleY ?? 1;

    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const { positions, vertexCount, dim } = geometry;
    const out = new Float32Array(positions.length);

    for (let i = 0; i < vertexCount; i++) {
      const base = i * dim;
      const x = positions[base] as number;
      const y = positions[base + 1] as number;

      // Scale → Rotate → Translate
      const rx = x * sx;
      const ry = y * sy;
      out[base] = rx * cos - ry * sin + tx;
      out[base + 1] = rx * sin + ry * cos + ty;
    }

    return {
      geometry: {
        ...geometry,
        positions: out,
      },
    };
  },
};
