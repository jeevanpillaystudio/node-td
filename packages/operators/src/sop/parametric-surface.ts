import type { Operator, Field2D, Geometry } from "@node-td/kernel";

type Inputs = { field?: Field2D; width: number; height: number };
type Outputs = { geometry: Geometry<2> };

/**
 * Generates a triangulated grid mesh, optionally displaced by a Field2D.
 *
 * Without a field input: produces a flat rectangular mesh.
 * With a field: vertex Y positions are offset by field(x, y) * amplitude,
 * creating terrain-like surfaces.
 */
export const parametricSurface: Operator<Inputs, Outputs> = {
  id: "parametric-surface",
  category: "sop",
  label: "Parametric Surface",
  inputs: [
    { name: "field", type: "field", optional: true },
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [
    { key: "uSegments", label: "U Segments", min: 4, max: 200, step: 1, default: 60 },
    { key: "vSegments", label: "V Segments", min: 4, max: 200, step: 1, default: 60 },
    { key: "amplitude", label: "Displacement", min: 0, max: 200, step: 1, default: 0 },
  ],
  evaluate({ field, width, height }, params) {
    const uSeg = params.uSegments ?? 60;
    const vSeg = params.vSegments ?? 60;
    const amp = params.amplitude ?? 0;

    const vertexCount = (uSeg + 1) * (vSeg + 1);
    const positions = new Float32Array(vertexCount * 2);

    let vi = 0;
    for (let v = 0; v <= vSeg; v++) {
      for (let u = 0; u <= uSeg; u++) {
        const x = (u / uSeg) * width;
        const y = (v / vSeg) * height;
        positions[vi++] = x;
        positions[vi++] = field ? y + field(x, y) * amp : y;
      }
    }

    // Triangle indices
    const triCount = uSeg * vSeg * 2;
    const indices = new Uint32Array(triCount * 3);
    let ii = 0;
    for (let v = 0; v < vSeg; v++) {
      for (let u = 0; u < uSeg; u++) {
        const a = v * (uSeg + 1) + u;
        const b = a + 1;
        const c = a + (uSeg + 1);
        const d = c + 1;
        indices[ii++] = a;
        indices[ii++] = b;
        indices[ii++] = c;
        indices[ii++] = b;
        indices[ii++] = d;
        indices[ii++] = c;
      }
    }

    return {
      geometry: {
        positions,
        vertexCount,
        dim: 2 as const,
        topology: "triangles" as const,
        indices,
      },
    };
  },
};
