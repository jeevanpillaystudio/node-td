import type { Operator, Field2D, Geometry } from "@node-td/kernel";

type Inputs = { geometry: Geometry<2>; field: Field2D };
type Outputs = { geometry: Geometry<3> };

/**
 * Surface Lift — maps 2D geometry onto a 3D terrain surface.
 *
 * Takes 2D geometry (e.g. flow-traced paths in pixel coordinates)
 * and a Field2D heightmap, and produces 3D geometry where:
 *
 *   x3d = px
 *   y3d = field(px, py) * amplitude
 *   z3d = py
 *
 * X and Z form the ground plane, Y is the height axis.
 * Topology, stripOffsets, and indices pass through unchanged.
 *
 * This is the bridge between 2D flow-tracing and 3D projection —
 * strokes traced in screen-space are lifted onto the terrain
 * surface before being projected through a 3D camera.
 */
export const surfaceLift: Operator<Inputs, Outputs> = {
  id: "surface-lift",
  category: "sop",
  label: "Surface Lift",
  inputs: [
    { name: "geometry", type: "geometry" },
    { name: "field", type: "field" },
  ],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [
    { key: "amplitude", label: "Height", min: 0, max: 500, step: 1, default: 120 },
    { key: "baseY", label: "Base Y", min: -500, max: 500, step: 1, default: 0 },
  ],
  evaluate({ geometry: geo, field }, params) {
    const amp = params.amplitude ?? 120;
    const baseY = params.baseY ?? 0;

    // Allocate 3D positions: 3 floats per vertex
    const positions = new Float32Array(geo.vertexCount * 3);
    const src = geo.positions;

    for (let i = 0; i < geo.vertexCount; i++) {
      const px = src[i * 2] as number;
      const py = src[i * 2 + 1] as number;

      // Sample the field at pixel coordinates
      // The field expects the same coordinate space as grid-sampler
      // (column/row indices), so we normalize to the grid resolution
      const h = field(px, py);

      positions[i * 3] = px;
      positions[i * 3 + 1] = baseY + h * amp;
      positions[i * 3 + 2] = py;
    }

    return {
      geometry: {
        positions,
        vertexCount: geo.vertexCount,
        dim: 3 as const,
        topology: geo.topology,
        stripOffsets: geo.stripOffsets,
        indices: geo.indices,
      },
    };
  },
};
