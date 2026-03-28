import type { Operator, Buffer2D, Geometry } from "../../kernel/types";
import { pathsGeometry } from "../../kernel/types";

type Inputs = { buffer: Buffer2D; geometry: Geometry<2>; width: number; height: number };
type Outputs = { geometry: Geometry<2> };

function bufferAngle(x: number, y: number, buf: Buffer2D, resX: number, resY: number): number {
  const col = Math.max(0, Math.min(buf.width - 1, Math.floor(x / resX)));
  const row = Math.max(0, Math.min(buf.height - 1, Math.floor(y / resY)));
  return buf.data[col + row * buf.width] ?? 0;
}

/** Traces flow lines from seed points through an angle buffer. */
export const flowTracer: Operator<Inputs, Outputs> = {
  id: "flow-tracer",
  category: "sop",
  label: "Flow Tracer",
  inputs: [
    { name: "buffer", type: "buffer" },
    { name: "geometry", type: "geometry" },
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [
    { key: "numSteps", label: "Trace Steps", min: 50, max: 500, step: 10, default: 250 },
    { key: "stepLength", label: "Step Length (px)", min: 2, max: 40, step: 1, default: 15 },
    { key: "exitMargin", label: "Exit Margin (px)", min: 10, max: 200, step: 5, default: 80 },
  ],
  evaluate({ buffer, geometry, width, height }, params) {
    const numSteps = params.numSteps ?? 250;
    const stepLength = params.stepLength ?? 15;
    const exitMargin = params.exitMargin ?? 80;
    // Derive resolution from canvas dimensions and buffer grid size
    const resX = width / buffer.width;
    const resY = height / buffer.height;
    const w = width;
    const h = height;
    const paths: [number, number][][] = [];

    // Read seed positions from input geometry
    const pos = geometry.positions;
    const dim = geometry.dim;

    for (let vi = 0; vi < geometry.vertexCount; vi++) {
      const sx = pos[vi * dim] as number;
      const sy = pos[vi * dim + 1] as number;
      const pts: [number, number][] = [];

      // Backward pass
      const back: [number, number][] = [];
      let bx = sx;
      let by = sy;
      for (let n = 0; n < numSteps; n++) {
        const angle = bufferAngle(bx, by, buffer, resX, resY);
        bx -= stepLength * Math.cos(angle);
        by -= stepLength * Math.sin(angle);
        if (
          bx < -exitMargin || bx > w + exitMargin ||
          by < -exitMargin || by > h + exitMargin
        ) break;
        back.push([bx, by]);
      }
      for (let i = back.length - 1; i >= 0; i--) pts.push(back[i]!);

      pts.push([sx, sy]);

      // Forward pass
      let fx = sx;
      let fy = sy;
      for (let n = 0; n < numSteps; n++) {
        const angle = bufferAngle(fx, fy, buffer, resX, resY);
        fx += stepLength * Math.cos(angle);
        fy += stepLength * Math.sin(angle);
        if (
          fx < -exitMargin || fx > w + exitMargin ||
          fy < -exitMargin || fy > h + exitMargin
        ) break;
        pts.push([fx, fy]);
      }

      if (pts.length >= 2) paths.push(pts);
    }

    return { geometry: pathsGeometry(paths) };
  },
};
