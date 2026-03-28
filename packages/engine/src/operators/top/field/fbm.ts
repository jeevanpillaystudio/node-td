import type { Operator, Field2D } from "../../../kernel/types";

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
  category: "top",
  label: "fBm (Fractal Noise)",
  inputs: [{ name: "field", type: "field" }],
  outputs: [{ name: "field", type: "field" }],
  params: [
    { key: "octaves", label: "Octaves", min: 1, max: 10, step: 1, default: 6 },
    { key: "lacunarity", label: "Lacunarity", min: 1.0, max: 4.0, step: 0.1, default: 2.0 },
    { key: "gain", label: "Gain", min: 0.1, max: 0.9, step: 0.05, default: 0.5 },
    { key: "amplitude", label: "Amplitude", min: 0.1, max: 5.0, step: 0.1, default: 1.0 },
  ],
  evaluate({ field: input }, params) {
    const octaves = Math.round(params.octaves ?? 6);
    const lac = params.lacunarity ?? 2.0;
    const gain = params.gain ?? 0.5;
    const amp = params.amplitude ?? 1.0;

    const field: Field2D = (x, y) => {
      let sum = 0;
      let freq = 1;
      let a = 1;
      let maxAmp = 0;

      for (let i = 0; i < octaves; i++) {
        sum += input(x * freq, y * freq) * a;
        maxAmp += a;
        freq *= lac;
        a *= gain;
      }

      // Normalize to 0..1 and apply amplitude
      return (sum / maxAmp) * amp;
    };

    return { field };
  },
};
