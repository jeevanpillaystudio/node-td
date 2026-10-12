import type { Graph } from "@node-td/kernel";

/**
 * Terrain Heightmap patch — field visualization.
 *
 * Uses the same field algebra chain as subscapes (simplex → fbm → ridge)
 * but renders the scalar field directly to a full-resolution Buffer2D
 * via the field-render operator.
 *
 * Terminal output: "render" node, port "buffer" (Buffer2D, grayscale).
 */
export const terrainHeightmapGraph: Graph = {
  id: "terrain-heightmap",
  name: "Terrain Heightmap",
  nodes: {
    noise:   { type: "simplex-noise", params: { noiseScale: 0.025 } },
    terrain: { type: "fbm", params: { octaves: 6, lacunarity: 2.0, gain: 0.5, amplitude: 1.0 } },
    ridge:   { type: "field-remap", params: { mode: 2, power: 1.5 } },
    render:  { type: "field-render", params: { scale: 1 } },
  },
  wires: [
    // noise → fbm → ridge
    { from: "noise",   output: "field", to: "terrain", input: "field" },
    { from: "terrain", output: "field", to: "ridge",   input: "field" },
    // ridge → field-render
    { from: "ridge",  output: "field", to: "render", input: "field" },
    { from: "$env",   output: "width", to: "render", input: "width" },
    { from: "$env",   output: "height", to: "render", input: "height" },
  ],
};
