import type { Operator, Buffer2D } from "../../kernel/types";

type Inputs = { layers: Buffer2D[] };
type Outputs = { buffer: Buffer2D };

/**
 * Composite — blends multiple Buffer2D layers using a selected blend mode.
 *
 * Layers are composited in order (first = bottom, last = top).
 * All layers must have the same dimensions and 4 channels (RGBA).
 *
 * Blend modes:
 *   0 = over  (standard alpha compositing, Porter-Duff)
 *   1 = add   (additive blending, clamped to 1)
 *   2 = multiply
 *   3 = screen
 */
export const composite: Operator<Inputs, Outputs> = {
  id: "composite",
  category: "rop",
  label: "Composite",
  inputs: [{ name: "layers", type: "buffer", variadic: true }],
  outputs: [{ name: "buffer", type: "buffer" }],
  params: [
    { key: "mode", label: "Blend Mode", min: 0, max: 3, step: 1, default: 0 },
  ],

  evaluate({ layers }, params) {
    if (!layers || layers.length === 0) {
      return { buffer: { data: new Float32Array(0), width: 0, height: 0, channels: 4 } };
    }

    if (layers.length === 1) {
      return { buffer: layers[0]! };
    }

    const mode = Math.round(params.mode ?? 0);
    const { width, height } = layers[0]!;
    const len = width * height * 4;

    // Start with a copy of the bottom layer
    const result = new Float32Array(layers[0]!.data);

    for (let li = 1; li < layers.length; li++) {
      const src = layers[li]!.data;

      for (let i = 0; i < len; i += 4) {
        const sr = src[i]!;
        const sg = src[i + 1]!;
        const sb = src[i + 2]!;
        const sa = src[i + 3]!;
        const dr = result[i]!;
        const dg = result[i + 1]!;
        const db = result[i + 2]!;
        const da = result[i + 3]!;

        switch (mode) {
          case 0: {
            // Porter-Duff "over"
            const outA = sa + da * (1 - sa);
            if (outA > 0) {
              result[i] = (sr * sa + dr * da * (1 - sa)) / outA;
              result[i + 1] = (sg * sa + dg * da * (1 - sa)) / outA;
              result[i + 2] = (sb * sa + db * da * (1 - sa)) / outA;
            }
            result[i + 3] = outA;
            break;
          }
          case 1: {
            // Additive
            result[i] = Math.min(1, dr + sr);
            result[i + 1] = Math.min(1, dg + sg);
            result[i + 2] = Math.min(1, db + sb);
            result[i + 3] = Math.min(1, da + sa);
            break;
          }
          case 2: {
            // Multiply
            result[i] = dr * sr;
            result[i + 1] = dg * sg;
            result[i + 2] = db * sb;
            result[i + 3] = Math.min(1, da + sa * (1 - da));
            break;
          }
          case 3: {
            // Screen
            result[i] = 1 - (1 - dr) * (1 - sr);
            result[i + 1] = 1 - (1 - dg) * (1 - sg);
            result[i + 2] = 1 - (1 - db) * (1 - sb);
            result[i + 3] = Math.min(1, da + sa * (1 - da));
            break;
          }
        }
      }
    }

    return { buffer: { data: result, width, height, channels: 4 } };
  },
};
