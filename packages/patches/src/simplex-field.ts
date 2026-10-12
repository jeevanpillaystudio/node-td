import type { Graph } from "@node-td/kernel";

/**
 * Simplex Field patch — Simplex noise → coarser angle grid →
 * Poisson-disc seeds → flow tracing → stroke renderer.
 *
 * Terminal output: "render" node, port "buffer" (Buffer2D, RGBA).
 */
export const simplexFieldGraph: Graph = {
  id: "simplex-field",
  name: "Simplex Field",
  nodes: {
    noise: { type: "simplex-noise" },
    grid: { type: "grid-sampler", params: { resolution: 25 } },
    seeds: { type: "poisson-disc" },
    trace: { type: "flow-tracer" },
    camera: { type: "camera-2d" },
    render: { type: "stroke-renderer" },
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
    // env → camera
    { from: "$env", output: "width", to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },
    // trace + camera → render
    { from: "trace", output: "geometry", to: "render", input: "geometry" },
    { from: "camera", output: "camera", to: "render", input: "camera" },
  ],
};
