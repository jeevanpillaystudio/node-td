import { asOffscreen } from "../canvas-handle";
import { defineOperator } from "@node-td/kernel";

/**
 * Blend mode → Canvas2D globalCompositeOperation mapping.
 * These are exact semantic matches:
 *   0 = over     → "source-over"  (Porter-Duff)
 *   1 = add      → "lighter"      (additive)
 *   2 = multiply → "multiply"
 *   3 = screen   → "screen"
 */
const BLEND_OPS: GlobalCompositeOperation[] = [
  "source-over", "lighter", "multiply", "screen",
];

/**
 * Composite — blends multiple Buffer2D layers using a selected blend mode.
 *
 * Layers are composited in order (first = bottom, last = top).
 * All layers must have the same dimensions and 4 channels (RGBA).
 *
 * Canvas-native fast path: when all layers carry `_canvas`, composites
 * via drawImage + globalCompositeOperation — hardware-accelerated,
 * O(1) GPU ops instead of O(w×h×layers) CPU pixel work.
 *
 * Blend modes:
 *   0 = over  (standard alpha compositing, Porter-Duff)
 *   1 = add   (additive blending, clamped to 1)
 *   2 = multiply
 *   3 = screen
 */
export const composite = defineOperator({
  id: "composite",
  category: "top",
  label: "Composite",
  inputs: [{ name: "layers", type: "image", variadic: true }],
  outputs: [{ name: "buffer", type: "image" }],
  params: [
    {
      key: "mode",
      label: "Blend Mode",
      kind: "enum",
      options: [
        { label: "Over", value: 0 },
        { label: "Add", value: 1 },
        { label: "Multiply", value: 2 },
        { label: "Screen", value: 3 },
      ],
      default: 0,
    },
  ],

  evaluate({ layers }, params, env) {
    if (layers.length === 0) {
      return { buffer: { data: new Float32Array(0), width: 0, height: 0, channels: 4 } };
    }

    if (layers.length === 1) {
      return { buffer: layers[0]! };
    }

    const mode = Math.round(params.mode);
    const { width, height } = layers[0]!;

    // ── Canvas-native fast path ───────────────────────────────
    // All layers have _canvas → composite via drawImage (GPU-accelerated)
    // Inputs are cached outputs: they are read, never modified. Their
    // canvases are released when the host clears the cook cache.
    const createCanvas = env.createCanvas;
    if (createCanvas && layers.every(l => l._canvas)) {
      const canvas = asOffscreen(createCanvas(width, height));
      const ctx = canvas.getContext("2d")!;

      // Bottom layer: direct copy
      ctx.drawImage(asOffscreen(layers[0]!._canvas!), 0, 0);

      // Remaining layers: blend with globalCompositeOperation
      const op = BLEND_OPS[mode] ?? "source-over";
      for (let i = 1; i < layers.length; i++) {
        ctx.globalCompositeOperation = op;
        ctx.drawImage(asOffscreen(layers[i]!._canvas!), 0, 0);
      }

      // Return with _canvas for fast blitBuffer2D path.
      // Lazy data getter: pixels are read back only if a consumer needs them.
      let _data: Float32Array | null = null;
      return {
        buffer: {
          get data(): Float32Array {
            if (!_data) {
              const id = ctx.getImageData(0, 0, width, height);
              _data = new Float32Array(id.data.length);
              for (let j = 0; j < id.data.length; j++) _data[j] = id.data[j]! / 255;
            }
            return _data;
          },
          set data(v: Float32Array) { _data = v; },
          width,
          height,
          channels: 4,
          _canvas: canvas,
        },
      };
    }

    // ── CPU fallback (no _canvas on some layers) ──────────────
    // Straight (not premultiplied) RGBA, blended as the canvas's
    // globalCompositeOperation blends it (W3C Compositing and Blending):
    //
    //   over, multiply, screen: the source, mixed with the blend B(Cb, Cs)
    //   as far as the backdrop is opaque, laid over the backdrop
    //     Cs' = (1 − αb)·Cs + αb·B(Cb, Cs)
    //     αo  = αs + αb·(1 − αs)
    //     Co  = (αs·Cs' + αb·(1 − αs)·Cb) / αo
    //   with B = Cs (over), Cb·Cs (multiply), Cb + Cs − Cb·Cs (screen)
    //
    //   add ("lighter"): the premultiplied sum, clamped
    //     αo = min(1, αs + αb),  Co = min(1, αs·Cs + αb·Cb) / αo
    //
    // A pixel left with no alpha is (0, 0, 0, 0).
    const len = width * height * 4;

    // Start with a copy of the bottom layer
    const result = new Float32Array(layers[0]!.data);

    for (let li = 1; li < layers.length; li++) {
      const src = layers[li]!.data;

      for (let i = 0; i < len; i += 4) {
        const sa = src[i + 3]!;
        const da = result[i + 3]!;
        const outA = mode === 1 ? Math.min(1, sa + da) : sa + da * (1 - sa);

        for (let c = 0; c < 3; c++) {
          const cs = src[i + c]!;
          const cb = result[i + c]!;
          let co: number;
          if (mode === 1) {
            co = Math.min(1, sa * cs + da * cb);
          } else {
            const blend = mode === 2 ? cb * cs : mode === 3 ? cb + cs - cb * cs : cs;
            const mixed = (1 - da) * cs + da * blend;
            co = sa * mixed + da * (1 - sa) * cb;
          }
          result[i + c] = outA > 0 ? co / outA : 0;
        }
        result[i + 3] = outA;
      }
    }

    return { buffer: { data: result, width, height, channels: 4 } };
  },
});
