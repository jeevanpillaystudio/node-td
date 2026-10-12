import { defineOperator } from "@node-td/kernel";
import { geometryToPaths, pathsGeometry } from "@node-td/kernel";

/** Splits line-strip geometry into randomized dash segments. */
export const dashStroke = defineOperator({
  id: "dash-stroke",
  category: "sop",
  label: "Dash Stroke",
  inputs: [{ name: "geometry", type: "geo2" }],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [],
  evaluate({ geometry }, _params, env) {
    const rand = () => env.rng.random();
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
});
