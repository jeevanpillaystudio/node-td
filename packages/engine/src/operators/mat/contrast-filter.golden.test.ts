import { opGolden, w } from "../../../test/goldens";
import { contrastFilter } from "./contrast-filter";

// Fully saturated hues span dark blue to bright yellow
const candidates = {
  type: "procedural-palette",
  params: { count: 8, saturation: 1, lightness: 0.5 },
};
const dark = {
  type: "oklab-palette",
  params: { count: 1, lightness: 0.2, chroma: 0, hueSpread: 0 },
};
const wires = [w("candidates.palette", "filter.palette"), w("dark.palette", "filter.reference")];

opGolden(contrastFilter, {
  "minRatio 7": {
    nodes: { candidates, dark, filter: { type: "contrast-filter", params: { minRatio: 7 } } },
    wires,
  },
  // Nothing reaches 21:1, so the fallback ratio decides
  "minRatio 21, fallbackRatio 3": {
    nodes: {
      candidates,
      dark,
      filter: { type: "contrast-filter", params: { minRatio: 21, fallbackRatio: 3 } },
    },
    wires,
  },
  // Nothing passes either ratio: the candidates come back unchanged
  "minRatio 21, fallbackRatio 21": {
    nodes: {
      candidates,
      dark,
      filter: { type: "contrast-filter", params: { minRatio: 21, fallbackRatio: 21 } },
    },
    wires,
  },
});
