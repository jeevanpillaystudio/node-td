import type { Operator, Geometry, GraphEnv } from "@node-td/kernel";
import { geometryToPaths, pathsGeometry } from "@node-td/kernel";

type Inputs = { geometry: Geometry<2> };
type Outputs = { geometry: Geometry<2> };

/** Splits line-strip geometry into randomized dash segments. */
export const dashStroke: Operator<Inputs, Outputs> = {
  id: "dash-stroke",
  category: "sop",
  label: "Dash Stroke",
  inputs: [{ name: "geometry", type: "geometry" }],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [],
  evaluate({ geometry }, _params, env?: GraphEnv) {
    const rand = env?.rng ? () => env.rng!.random() : Math.random;
    const paths = geometryToPaths(geometry);
    const segments: [number, number][][] = [];

    for (const pts of paths) {
      let i = 0;
      while (i + 1 < pts.length) {
        const seg = 2 + Math.floor(rand() * 6);
        const gap = 1 + Math.floor(rand() * 5);
        const end = Math.min(i + seg, pts.length);
        const dash: [number, number][] = [];
        for (let j = i; j < end; j++) dash.push(pts[j]!);
        if (dash.length >= 2) segments.push(dash);
        i += seg + gap;
      }
    }

    return { geometry: pathsGeometry(segments) };
  },
};
