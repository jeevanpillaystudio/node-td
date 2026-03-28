import type { Operator, Geometry } from "../../core/types";

type Inputs = { geometry: Geometry<2> };
type Outputs = { geometry: Geometry<2> };

/** Pass-through: geometry flows unmodified as unbroken lines. */
export const continuousStroke: Operator<Inputs, Outputs> = {
  id: "continuous-stroke",
  category: "sop",
  label: "Continuous Stroke",
  inputs: [{ name: "geometry", type: "geometry" }],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [],
  evaluate({ geometry }) {
    return { geometry };
  },
};
