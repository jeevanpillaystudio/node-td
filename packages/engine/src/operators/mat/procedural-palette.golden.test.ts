import { opGolden } from "../../../test/goldens";
import { proceduralPalette } from "./procedural-palette";

opGolden(proceduralPalette, {
  default: { nodes: { palette: { type: "procedural-palette" } }, wires: [] },
  // Zero saturation takes the grey shortcut
  "count 8, saturation 0": {
    nodes: { palette: { type: "procedural-palette", params: { count: 8, saturation: 0 } } },
    wires: [],
  },
  "count 3, lightness 0.3, hueOffset 200": {
    nodes: {
      palette: { type: "procedural-palette", params: { count: 3, lightness: 0.3, hueOffset: 200 } },
    },
    wires: [],
  },
});
