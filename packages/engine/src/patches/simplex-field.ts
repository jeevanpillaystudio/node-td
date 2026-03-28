import type { Graph } from "../core/graph";

/**
 * Simplex Field patch — Simplex noise → coarser angle grid →
 * Poisson-disc seeds → flow tracing → continuous strokes.
 *
 * Terminal output: "stroke" node, port "geometry" (Geometry<2>, line-strip).
 */
export const simplexFieldGraph: Graph = {
  id: "simplex-field",
  name: "Simplex Field",
  nodes: {
    noise: { type: "simplex-noise" },
    grid: { type: "grid-sampler", params: { resolution: 25 } },
    seeds: { type: "poisson-disc" },
    trace: { type: "flow-tracer" },
    stroke: { type: "continuous-stroke" },
  },
  wires: [
    // noise → grid
    { from: "noise", output: "field", to: "grid", input: "field" },
    { from: "$env", output: "width", to: "grid", input: "width" },
    { from: "$env", output: "height", to: "grid", input: "height" },
    // env → seeds
    { from: "$env", output: "width", to: "seeds", input: "width" },
    { from: "$env", output: "height", to: "seeds", input: "height" },
    // grid + seeds + env → trace
    { from: "grid", output: "buffer", to: "trace", input: "buffer" },
    { from: "seeds", output: "geometry", to: "trace", input: "geometry" },
    { from: "$env", output: "width", to: "trace", input: "width" },
    { from: "$env", output: "height", to: "trace", input: "height" },
    // trace → stroke
    { from: "trace", output: "geometry", to: "stroke", input: "geometry" },
  ],
};
