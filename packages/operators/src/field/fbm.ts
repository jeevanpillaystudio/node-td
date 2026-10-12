import type { Operator, Field2D } from "@node-td/kernel";
import { createField, getFieldExpr, fbmExpr, u } from "@node-td/kernel/field";

type Inputs = { field: Field2D };
type Outputs = { field: Field2D };

/**
 * Fractional Brownian Motion — sums an input Field2D at multiple
 * octaves with configurable lacunarity and gain.
 *
 * Each octave doubles (by lacunarity) the sampling frequency and
 * scales (by gain) the amplitude, producing fractal detail.
 * The result is normalized to approximately 0..1.
 *
 * This is the foundation of all terrain generation — subscapes uses
 * 6-octave fBm of simplex noise.
 */
export const fbm: Operator<Inputs, Outputs> = {
  id: "fbm",
  category: "field",
  label: "fBm (Fractal Noise)",
  inputs: [{ name: "field", type: "field" }],
  outputs: [{ name: "field", type: "field" }],
  params: [
    { key: "octaves",        label: "Octaves",             min: 1,     max: 10,   step: 1,    default: 6 },
    { key: "lacunarity",     label: "Lacunarity",           min: 1.0,   max: 4.0,  step: 0.1,  default: 2.0 },
    { key: "gain",           label: "Gain",                 min: 0.1,   max: 0.9,  step: 0.05, default: 0.5 },
    { key: "amplitude",      label: "Amplitude",            min: 0.1,   max: 5.0,  step: 0.1,  default: 1.0 },
    { key: "domainRotation", label: "Domain Rotation (rad)",min: -3.14, max: 3.14, step: 0.01, default: 0 },
  ],
  evaluate({ field: input }, params) {
    const octaves  = Math.round(params.octaves ?? 6);
    const lac      = params.lacunarity ?? 2.0;
    const gain     = params.gain ?? 0.5;
    const amp      = params.amplitude ?? 1.0;
    const rotation = params.domainRotation ?? 0;

    // GPU path (FieldExpr) — domain rotation not yet supported in GLSL
    const inputExpr = getFieldExpr(input);
    if (inputExpr && rotation === 0) {
      const expr = fbmExpr(
        inputExpr,
        u("octaves", octaves),
        u("lacunarity", lac),
        u("gain", gain),
        u("amplitude", amp),
      );
      return { field: createField(expr) };
    }

    // CPU fallback — supports optional domain rotation.
    // Pre-rotating the domain by ~37° (0.646 rad) eliminates axis-aligned
    // artifacts from the symmetric octave scaling — used by Meridian.
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    const field: Field2D = (x, y) => {
      // Rotate sample coordinates once before the octave loop
      const rx = cosR * x - sinR * y;
      const ry = sinR * x + cosR * y;

      let sum = 0;
      let freq = 1;
      let a = 1;
      let maxAmp = 0;

      for (let i = 0; i < octaves; i++) {
        sum += input(rx * freq, ry * freq) * a;
        maxAmp += a;
        freq *= lac;
        a *= gain;
      }

      return (sum / maxAmp) * amp;
    };

    return { field };
  },
};
