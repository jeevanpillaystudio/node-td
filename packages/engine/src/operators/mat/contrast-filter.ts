import type { Operator, Palette } from "@node-td/kernel";

type Inputs = { palette: Palette; reference: Palette };
type Outputs = { palette: Palette };

/**
 * sRGB component → linear (inverse of gamma curve).
 * Matches algorithm.js `P = e => pow((e + 0.055) / 1.055, 2.4)` (line 538).
 */
function srgbToLinear(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG 2.1 relative luminance from sRGB [0..1].
 * Matches algorithm.js `B()` (lines 540-546).
 */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * WCAG contrast ratio.
 * Matches algorithm.js `I()` (lines 547-551).
 */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Contrast Filter — WCAG-based palette filtering.
 *
 * Filters a candidate palette to only include colors that meet a
 * minimum contrast ratio against ALL reference colors. Uses cascading
 * contrast levels: tries the primary ratio first, falls back to a
 * lower ratio if nothing passes.
 *
 * This matches the Subscapes color selection system (algorithm.js
 * lines 558-563) where `z(candidates, refColors, minCount, ratios)`
 * filters colors through decreasing contrast thresholds [3, 2.5, 2].
 *
 * Inputs:
 *   palette   — candidate colors to filter
 *   reference — colors that candidates must contrast against
 *
 * The reference palette is typically the background color(s).
 * A single-color reference palette (count=1) is the most common case.
 */
export const contrastFilter: Operator<Inputs, Outputs> = {
  id: "contrast-filter",
  category: "mat",
  label: "Contrast Filter",
  inputs: [
    { name: "palette", type: "palette" },
    { name: "reference", type: "palette" },
  ],
  outputs: [{ name: "palette", type: "palette" }],
  params: [
    { key: "minRatio", label: "Min Contrast", min: 1, max: 21, step: 0.1, default: 3.0 },
    { key: "fallbackRatio", label: "Fallback Ratio", min: 1, max: 21, step: 0.1, default: 2.0 },
  ],
  evaluate({ palette: candidates, reference: ref }, params) {
    const minRatio = params.minRatio ?? 3.0;
    const fallbackRatio = params.fallbackRatio ?? 2.0;

    // Pre-compute reference luminances
    const refLums: number[] = [];
    for (let i = 0; i < ref.count; i++) {
      const off = i * 4;
      refLums.push(luminance(
        ref.colors[off] as number,
        ref.colors[off + 1] as number,
        ref.colors[off + 2] as number,
      ));
    }

    // Test each candidate against ALL reference colors at a given ratio
    const passesAt = (ratio: number): number[] => {
      const passing: number[] = [];
      for (let i = 0; i < candidates.count; i++) {
        const off = i * 4;
        const lum = luminance(
          candidates.colors[off] as number,
          candidates.colors[off + 1] as number,
          candidates.colors[off + 2] as number,
        );
        if (refLums.every(rl => contrastRatio(lum, rl) >= ratio)) {
          passing.push(i);
        }
      }
      return passing;
    };

    // Cascading contrast: try primary ratio, fall back to lower
    let passing = passesAt(minRatio);
    if (passing.length === 0) passing = passesAt(fallbackRatio);
    if (passing.length === 0) {
      // Nothing passes even fallback — return all candidates unchanged
      return { palette: candidates };
    }

    const count = passing.length;
    const colors = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      const srcOff = passing[i]! * 4;
      const dstOff = i * 4;
      colors[dstOff] = candidates.colors[srcOff]!;
      colors[dstOff + 1] = candidates.colors[srcOff + 1]!;
      colors[dstOff + 2] = candidates.colors[srcOff + 2]!;
      colors[dstOff + 3] = candidates.colors[srcOff + 3]!;
    }

    return { palette: { colors, count } };
  },
};
