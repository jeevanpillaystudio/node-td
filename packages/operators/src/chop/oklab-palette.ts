import { defineOperator } from "@node-td/kernel";

/**
 * OKLAB LCh → linear sRGB.
 *
 * OKLAB is perceptually uniform — equal numerical changes produce
 * equal perceptual differences. Using LCh (cylindrical) coordinates
 * makes it trivial to generate palettes with controlled lightness,
 * chroma, and hue distribution.
 *
 * This matches the Subscapes color system (algorithm.js lines 15-23)
 * which uses OKLAB for Screenprint and Lino style palettes.
 */
function oklchToSrgb(L: number, C: number, hDeg: number): [number, number, number] {
  const hRad = hDeg * (Math.PI / 180);
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // Oklab → LMS (cube-root domain)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  // Undo cube root → LMS
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB (Oklab M⁻¹ matrix)
  const rLin = +4.0767245293 * l - 3.3072168827 * m + 0.2307590544 * s;
  const gLin = -1.2681437731 * l + 2.6093323231 * m - 0.341134429 * s;
  const bLin = -0.0041119885 * l - 0.7034763098 * m + 1.7068625689 * s;

  return [linearToSrgb(rLin), linearToSrgb(gLin), linearToSrgb(bLin)];
}

/** Linear sRGB → sRGB gamma curve */
function linearToSrgb(x: number): number {
  if (x <= 0.0031308) return Math.max(0, 12.92 * x);
  return Math.min(1, 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
}

/**
 * OKLAB Palette — perceptually uniform procedural palette.
 *
 * Generates colors in OKLAB LCh space with golden-angle hue spacing.
 * This produces palettes where all colors have equal perceptual
 * lightness and saturation, with maximally distributed hues.
 *
 * Key params map to the Subscapes styles:
 *   Screenprint: L=0.50, C=0.10, hueSpread=360
 *   Lino:        L=0.92, C=0.05, hueSpread=360
 *   Metallic:    L=0.65, C=0.15, hueSpread=360
 */
export const oklabPalette = defineOperator({
  id: "oklab-palette",
  category: "chop",
  label: "OKLAB Palette",
  inputs: [],
  outputs: [{ name: "palette", type: "palette" }],
  params: [
    { key: "count", label: "Count", min: 1, max: 16, step: 1, default: 5 },
    { key: "lightness", label: "Lightness (L)", min: 0, max: 1, step: 0.01, default: 0.65 },
    { key: "chroma", label: "Chroma (C)", min: 0, max: 0.37, step: 0.005, default: 0.15 },
    { key: "hueOffset", label: "Hue Offset", min: 0, max: 360, step: 1, default: 0 },
    { key: "hueSpread", label: "Hue Spread", min: 0, max: 360, step: 1, default: 360 },
  ],
  evaluate(_, params) {
    const count = Math.max(1, Math.round(params.count));
    const L = params.lightness;
    const C = params.chroma;
    const baseHue = params.hueOffset;
    const spread = params.hueSpread;

    const colors = new Float32Array(count * 4);

    // Golden angle (≈137.508°) — maximally separated hues
    const GOLDEN_ANGLE = 137.508;

    for (let i = 0; i < count; i++) {
      const hue = spread > 0 ? (baseHue + ((i * GOLDEN_ANGLE) % spread)) % 360 : baseHue;

      const [r, g, b] = oklchToSrgb(L, C, hue);

      const off = i * 4;
      colors[off] = r;
      colors[off + 1] = g;
      colors[off + 2] = b;
      colors[off + 3] = 1;
    }

    return { palette: { colors, count } };
  },
});
