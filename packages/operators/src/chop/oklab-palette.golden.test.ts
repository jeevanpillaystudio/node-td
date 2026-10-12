import { opGolden } from "../../test/goldens";
import { oklabPalette } from "./oklab-palette";

opGolden(oklabPalette, {
  default: { nodes: { palette: { type: "oklab-palette" } }, wires: [] },
  meridian: {
    nodes: {
      palette: {
        type: "oklab-palette",
        params: { count: 5, lightness: 0.65, chroma: 0.15, hueOffset: 200, hueSpread: 360 },
      },
    },
    wires: [],
  },
  // hueSpread 0 takes the single-hue branch
  "one grey (subscapes)": {
    nodes: {
      palette: {
        type: "oklab-palette",
        params: { count: 1, lightness: 0.2, chroma: 0, hueOffset: 0, hueSpread: 0 },
      },
    },
    wires: [],
  },
  "hueSpread 90, chroma 0.3": {
    nodes: { palette: { type: "oklab-palette", params: { hueSpread: 90, chroma: 0.3 } } },
    wires: [],
  },
});
