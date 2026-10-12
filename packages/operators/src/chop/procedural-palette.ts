import type { Operator, Palette } from "@node-td/kernel";

type Inputs = Record<string, never>;
type Outputs = { palette: Palette };

/**
 * Generates a uniformly distributed high-contrast color palette.
 *
 * Uses golden-angle hue spacing to maximize perceptual distance
 * between adjacent colors. Saturation and lightness are varied
 * within narrow bands for coherence while maintaining contrast.
 */
export const proceduralPalette: Operator<Inputs, Outputs> = {
  id: "procedural-palette",
  category: "chop",
  label: "Procedural Palette",
  inputs: [],
  outputs: [{ name: "palette", type: "palette" }],
  params: [
    { key: "count", label: "Color Count", min: 2, max: 16, step: 1, default: 5 },
    { key: "saturation", label: "Saturation", min: 0, max: 1, step: 0.01, default: 0.65 },
    { key: "lightness", label: "Lightness", min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: "hueOffset", label: "Hue Offset", min: 0, max: 360, step: 1, default: 0 },
  ],
  evaluate(_inputs, params) {
    const count = Math.round(params.count ?? 5);
    const sat = params.saturation ?? 0.65;
    const lit = params.lightness ?? 0.55;
    const hueOff = params.hueOffset ?? 0;

    const colors = new Float32Array(count * 4);

    // Golden angle in degrees for maximally spaced hues
    const goldenAngle = 137.508;

    for (let i = 0; i < count; i++) {
      const hue = (hueOff + i * goldenAngle) % 360;
      const [r, g, b] = hslToRgb(hue / 360, sat, lit);
      const base = i * 4;
      colors[base] = r;
      colors[base + 1] = g;
      colors[base + 2] = b;
      colors[base + 3] = 1; // alpha
    }

    return { palette: { colors, count } };
  },
};

/** HSL to RGB conversion — h in [0,1], s in [0,1], l in [0,1] → [r,g,b] in [0,1] */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    hue2rgb(p, q, h + 1 / 3),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1 / 3),
  ];
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}
