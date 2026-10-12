import { defineOperator, withPositions } from "@node-td/kernel";

/**
 * Geometric Normal — computes per-vertex surface normals from a heightfield.
 *
 * For each 3D vertex at (x, y, z), samples the height field one epsilon
 * step along x and along z, and returns the normal of the surface
 * y = amplitude * field(x, z):
 *
 *   n ∝ (-∂h/∂x, 1, -∂h/∂z)
 *
 * which points up, and away from the slope, at every vertex, the grid's
 * x = 0 and z = 0 edges included. The derivatives are one-sided: backward,
 * or forward at an edge, as the Subscapes algorithm samples them.
 *
 * The output geometry keeps its positions, strips, colours and attributes,
 * with `normals` populated — a Float32Array of 3 floats per vertex
 * (nx, ny, nz).
 *
 * Read by diffuse-shade (N dot L).
 */
export const geometricNormal = defineOperator({
  id: "geometric-normal",
  category: "sop",
  label: "Geometric Normal",
  inputs: [
    { name: "geometry", type: "geo3" },
    { name: "field", type: "field" },
  ],
  outputs: [{ name: "geometry", type: "geo3" }],
  params: [
    { key: "epsilon", label: "Epsilon", min: 0.000001, max: 10, step: 0.000001, default: 0.00001 },
    { key: "amplitude", label: "Height Scale", min: 0, max: 500, step: 1, default: 120 },
  ],
  evaluate({ geometry: geo, field }, params) {
    const eps = params.epsilon;
    const amp = params.amplitude;
    const src = geo.positions;
    const normals = new Float32Array(geo.vertexCount * 3);

    for (let i = 0; i < geo.vertexCount; i++) {
      const px = src[i * 3] as number;
      // y is the height axis (not used for sampling — derived from field)
      const pz = src[i * 3 + 2] as number;

      const hCenter = field(px, pz) * amp;

      // The rise over one eps step along +x and along +z: a backward
      // difference, or a forward one where the step back would leave the
      // grid at x or z = 0
      const dx =
        px >= eps ? hCenter - field(px - eps, pz) * amp : field(px + eps, pz) * amp - hCenter;
      const dz =
        pz >= eps ? hCenter - field(px, pz - eps) * amp : field(px, pz + eps) * amp - hCenter;

      // The surface y = h(x, z) has normal (-∂h/∂x, 1, -∂h/∂z): up, and
      // tilted away from the slope. Here scaled by eps², as the cross
      // product (0, dz, eps) × (eps, dx, 0) of the two eps-step tangents.
      let nx = -(eps * dx);
      let ny = eps * eps;
      let nz = -(eps * dz);

      // Normalize
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0) {
        const inv = 1 / len;
        nx *= inv;
        ny *= inv;
        nz *= inv;
      } else {
        // Degenerate — default to up
        nx = 0;
        ny = 1;
        nz = 0;
      }

      normals[i * 3] = nx;
      normals[i * 3 + 1] = ny;
      normals[i * 3 + 2] = nz;
    }

    return { geometry: { ...withPositions(geo, geo.positions, 3), normals } };
  },
});
