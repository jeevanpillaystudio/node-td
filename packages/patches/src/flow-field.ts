import type { Graph } from "@node-td/kernel";

/**
 * Flow Field patch — Perlin noise → angle grid → circle-pack seeds →
 * flow tracing → dash strokes → stroke renderer.
 *
 * Terminal output: "render" node, port "buffer" (Buffer2D, RGBA).
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
    // trace → stroke
    { from: "trace", output: "geometry", to: "stroke", input: "geometry" },
    // env → camera
    { from: "$env", output: "width", to: "camera", input: "width" },
    { from: "$env", output: "height", to: "camera", input: "height" },
    // stroke + camera → render
    { from: "stroke", output: "geometry", to: "render", input: "geometry" },
    { from: "camera", output: "camera", to: "render", input: "camera" },
  ],
};
