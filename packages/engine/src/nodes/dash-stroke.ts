import type { GenNode, Path } from "../types";

export const dashStroke: GenNode<{ geometry: Path[] }, Path[]> = {
  id: "dash-stroke",
  family: "geometry",
  inputs: [{ name: "geometry", type: "geometry" }],
  output: { name: "geometry", type: "geometry" },
  params: [],
  evaluate({ geometry }) {
    const segments: Path[] = [];
    for (const pts of geometry) {
      let i = 0;
      while (i + 1 < pts.length) {
        const seg = 2 + Math.floor(Math.random() * 6);
        const gap = 1 + Math.floor(Math.random() * 5);
        const end = Math.min(i + seg, pts.length);
        const dash: Path = [];
        for (let j = i; j < end; j++) dash.push(pts[j]!);
        if (dash.length >= 2) segments.push(dash);
        i += seg + gap;
      }
    }
    return segments;
  },
};
