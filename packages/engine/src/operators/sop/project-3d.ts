import type { Operator, Camera3D, Geometry } from "../../kernel/types";

type Inputs = { geometry: Geometry<3>; camera3d: Camera3D };
type Outputs = { geometry: Geometry<2> };

/**
 * Project 3D — the 3D-to-2D bridge operator.
 *
 * Takes Geometry<3> and a Camera3D, projects every vertex through
 * the camera's projection function, and outputs Geometry<2> in
 * screen-space coordinates.
 *
 * The output feeds directly into any 2D renderer (stroke-renderer,
 * etc.) — the entire existing 2D pipeline works unchanged as the
 * terminal stage after projection.
 *
 * Topology, stripOffsets, and indices pass through unchanged.
 */
export const project3d: Operator<Inputs, Outputs> = {
  id: "project-3d",
  category: "sop",
  label: "Project 3D → 2D",
  inputs: [
    { name: "geometry", type: "geometry" },
    { name: "camera3d", type: "camera3d" },
  ],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [],
  evaluate({ geometry: geo, camera3d }) {
    const { project } = camera3d;

    // Project every vertex from 3D → 2D screen-space
    const positions = new Float32Array(geo.vertexCount * 2);
    const src = geo.positions;

    for (let i = 0; i < geo.vertexCount; i++) {
      const x = src[i * 3] as number;
      const y = src[i * 3 + 1] as number;
      const z = src[i * 3 + 2] as number;

      const [sx, sy] = project([x, y, z]);
      positions[i * 2] = sx;
      positions[i * 2 + 1] = sy;
    }

    return {
      geometry: {
        positions,
        vertexCount: geo.vertexCount,
        dim: 2 as const,
        topology: geo.topology,
        stripOffsets: geo.stripOffsets,
        indices: geo.indices,
      },
    };
  },
};
