import type { GenNode, Path } from "../types";

/** Pass-through node: geometry flows to the renderer as unbroken lines. */
export const continuousStroke: GenNode<{ geometry: Path[] }, Path[]> = {
  id: "continuous-stroke",
  family: "geometry",
  inputs: [{ name: "geometry", type: "geometry" }],
  output: { name: "geometry", type: "geometry" },
  params: [],
  evaluate({ geometry }) {
    return geometry;
  },
};
