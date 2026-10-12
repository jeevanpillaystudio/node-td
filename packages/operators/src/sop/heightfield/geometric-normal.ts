import type { Operator, Field2D, Geometry } from "@node-td/kernel";

type Inputs = { geometry: Geometry<3>; field: Field2D };
type Outputs = { geometry: Geometry<3> };

/**
 * Geometric Normal — computes per-vertex surface normals from a heightfield.
 *
 * For each 3D vertex at (x, y, z), samples the height field at nearby
 * offsets to estimate the surface tangent vectors via finite differences,
 * then takes the cross product to get the surface normal.
 *
 * This matches the Subscapes algorithm's normal computation (lines 305-324):
 * sample the parametric function at (u +/- eps) and (v +/- eps), subtract
 * to get tangent vectors along each axis, then cross product for the normal.
 *
 * The output geometry has the same positions/topology but with `normals`
 * populated — a Float32Array of 3 floats per vertex (nx, ny, nz).
 *
 * Needed by: visibility-cull (back-face test), diffuse-shade (N dot L).
 */
export const geometricNormal: Operator<Inputs, Outputs> = {
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
    const eps = params.epsilon ?? 0.00001;
    const amp = params.amplitude ?? 120;
    const src = geo.positions;
    const normals = new Float32Array(geo.vertexCount * 3);

    for (let i = 0; i < geo.vertexCount; i++) {
      const px = src[i * 3] as number;
      // y is the height axis (not used for sampling — derived from field)
      const pz = src[i * 3 + 2] as number;

      // Sample the parametric terrain function at the vertex's XZ position
      // and at finite-difference offsets to get tangent vectors.
      //
      // The actual Subscapes code computes:
      //   tangentU = parametricTerrain(u - eps, v) - parametricTerrain(u, v)
      //   tangentV = parametricTerrain(u, v - eps) - parametricTerrain(u, v)
      //   normal = cross(tangentV, tangentU), then normalize
      //
      // In our coordinate space: X = px, Z = pz, Y = field(px, pz) * amp

      const hCenter = field(px, pz) * amp;

      // Tangent along X axis (du)
      let tx: number, ty: number, tz: number;
      if (px >= eps) {
        const hBack = field(px - eps, pz) * amp;
        tx = -eps;
        ty = hCenter - hBack;
        tz = 0;
      } else {
        const hFwd = field(px + eps, pz) * amp;
        tx = eps;
        ty = hFwd - hCenter;
        tz = 0;
      }

      // Tangent along Z axis (dv)
      let ux: number, uy: number, uz: number;
      if (pz >= eps) {
        const hBack = field(px, pz - eps) * amp;
        ux = 0;
        uy = hCenter - hBack;
        uz = -eps;
      } else {
        const hFwd = field(px, pz + eps) * amp;
        ux = 0;
        uy = hFwd - hCenter;
        uz = eps;
      }

      // Cross product: normal = tangentV x tangentU
      let nx = uy * tz - uz * ty;
      let ny = uz * tx - ux * tz;
      let nz = ux * ty - uy * tx;

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

    return {
      geometry: {
        positions: geo.positions,
        vertexCount: geo.vertexCount,
        dim: 3 as const,
        topology: geo.topology,
        stripOffsets: geo.stripOffsets,
        indices: geo.indices,
        normals,
      },
    };
  },
};
