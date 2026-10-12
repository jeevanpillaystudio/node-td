import { defineOperator } from "@node-td/kernel";

/**
 * Transform 2D — applies an affine transform (translate, rotate, scale)
 * to all vertex positions in the x-y plane. Produces a new Geometry, no
 * mutation; any coordinate past x and y is kept as it is.
 */
export const transform2d = defineOperator({
  id: "transform-2d",
  category: "sop",
  label: "Transform 2D",
  inputs: [{ name: "geometry", type: "geo2" }],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [
    { key: "translateX", label: "Translate X", min: -2000, max: 2000, step: 1, default: 0 },
    { key: "translateY", label: "Translate Y", min: -2000, max: 2000, step: 1, default: 0 },
    { key: "rotation", label: "Rotation (rad)", min: -Math.PI, max: Math.PI, step: 0.01, default: 0 },
    { key: "scaleX", label: "Scale X", min: 0.01, max: 10, step: 0.01, default: 1 },
    { key: "scaleY", label: "Scale Y", min: 0.01, max: 10, step: 0.01, default: 1 },
  ],

  evaluate({ geometry }, params) {
    const tx = params.translateX;
    const ty = params.translateY;
    const rot = params.rotation;
    const sx = params.scaleX;
    const sy = params.scaleY;

    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const { positions, vertexCount, dim } = geometry;
    // A 3D geometry keeps its z: the transform acts in the x-y plane
    const out = new Float32Array(positions);

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
});
