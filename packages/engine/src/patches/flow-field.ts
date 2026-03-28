import type { Graph } from "../core/graph";

/**
 * Flow Field patch — Perlin noise → angle grid → circle-pack seeds →
 * flow tracing → dash strokes.
 *
 * Terminal output: "stroke" node, port "geometry" (Geometry<2>, line-strip).
 */
export const flowFieldGraph: Graph = {
  id: "flow-field",
  name: "Flow Field",
  nodes: {
    noise: { type: "perlin-noise" },
    grid: { type: "grid-sampler" },
    seeds: { type: "circle-pack" },
    trace: { type: "flow-tracer" },
    stroke: { type: "dash-stroke" },
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
