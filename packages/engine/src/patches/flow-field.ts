import type { Graph } from "../graph";

export const flowFieldGraph: Graph = {
  id: "flow-field",
  name: "Flow Field",
  nodes: {
    noise:  { type: "perlin-noise" },
    field:  { type: "grid-sampler" },
    seeds:  { type: "circle-pack-seeds" },
    trace:  { type: "flow-tracer" },
    stroke: { type: "dash-stroke" },
    render: { type: "canvas-renderer" },
  },
  wires: [
    { from: "noise",  output: "sampler",  to: "field",  input: "sampler" },
    { from: "$env",   output: "width",    to: "field",  input: "width" },
    { from: "$env",   output: "height",   to: "field",  input: "height" },
    { from: "$env",   output: "width",    to: "seeds",  input: "width" },
    { from: "$env",   output: "height",   to: "seeds",  input: "height" },
    { from: "field",  output: "field",    to: "trace",  input: "field" },
    { from: "seeds",  output: "geometry", to: "trace",  input: "geometry" },
    { from: "trace",  output: "geometry", to: "stroke", input: "geometry" },
    { from: "stroke", output: "geometry", to: "render", input: "geometry" },
    { from: "$env",   output: "ctx",      to: "render", input: "ctx" },
    { from: "$env",   output: "width",    to: "render", input: "width" },
    { from: "$env",   output: "height",   to: "render", input: "height" },
  ],
};
