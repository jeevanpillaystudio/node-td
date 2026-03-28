import type { FlowGrid, GenNode, Path, Point } from "../types";

function fieldAngle(x: number, y: number, field: FlowGrid): number {
  const col = Math.max(0, Math.min(field.cols - 1, Math.floor(x / field.resolution)));
  const row = Math.max(0, Math.min(field.rows - 1, Math.floor(y / field.resolution)));
  return field.data[col + row * field.cols] ?? 0;
}

export const flowTracer: GenNode<
  { field: FlowGrid; geometry: Path[] },
  Path[]
> = {
  id: "flow-tracer",
  family: "geometry",
  inputs: [
    { name: "field", type: "field" },
    { name: "geometry", type: "geometry" },
  ],
  output: { name: "geometry", type: "geometry" },
  params: [
    { key: "numSteps", label: "Trace Steps", min: 50, max: 500, step: 10, default: 250 },
    { key: "stepLength", label: "Step Length (px)", min: 2, max: 40, step: 1, default: 15 },
    { key: "exitMargin", label: "Exit Margin (px)", min: 10, max: 200, step: 5, default: 80 },
  ],
  evaluate({ field, geometry }, params) {
    const numSteps = params.numSteps ?? 250;
    const stepLength = params.stepLength ?? 15;
    const exitMargin = params.exitMargin ?? 80;
    const w = field.cols * field.resolution;
    const h = field.rows * field.resolution;
    const paths: Path[] = [];

    for (const path of geometry) {
      if (path.length === 0) continue;
      const [sx, sy] = path[0]!;
      const pts: Point[] = [];

      // Backward pass
      const back: Point[] = [];
      let bx = sx;
      let by = sy;
      for (let n = 0; n < numSteps; n++) {
        const angle = fieldAngle(bx, by, field);
        bx -= stepLength * Math.cos(angle);
        by -= stepLength * Math.sin(angle);
        if (
          bx < -exitMargin ||
          bx > w + exitMargin ||
          by < -exitMargin ||
          by > h + exitMargin
        )
          break;
        back.push([bx, by]);
      }
      for (let i = back.length - 1; i >= 0; i--) pts.push(back[i]!);

      pts.push([sx, sy]);

      // Forward pass
      let fx = sx;
      let fy = sy;
      for (let n = 0; n < numSteps; n++) {
        const angle = fieldAngle(fx, fy, field);
        fx += stepLength * Math.cos(angle);
        fy += stepLength * Math.sin(angle);
        if (
          fx < -exitMargin ||
          fx > w + exitMargin ||
          fy < -exitMargin ||
          fy > h + exitMargin
        )
          break;
        pts.push([fx, fy]);
      }

      if (pts.length >= 2) paths.push(pts);
    }

    return paths;
  },
};
