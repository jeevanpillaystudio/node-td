import type { Operator, Field2D, Buffer2D, GraphEnv } from "../../kernel/types";
import { getFieldExpr } from "../../kernel/field-expr";
import { compileField } from "../../kernel/field-compiler";
import { createWebGL2, renderFieldToTexture } from "../../render/webgl";

type Inputs = { field: Field2D; width: number; height: number };
type Outputs = { buffer: Buffer2D };

// ─── Per-caller GL context via env ──────────────────────────────
//
// Each CookEngine caller passes its own GL context through GraphEnv.
// This avoids the "10 frames thrashing a shared singleton" problem
// when multiple Frame components cook at different resolutions.
//
// If env doesn't carry a GL context, we create one via createCanvas
// (the original fallback path).

function getGL(env: GraphEnv | undefined, w: number, h: number): WebGL2RenderingContext | null {
  // Prefer pre-created GL from env (set by Frame/EditorPreview)
  const existing = (env as Record<string, unknown> | undefined)?._gl as WebGL2RenderingContext | undefined;
  if (existing) {
    // Resize the backing canvas if needed
    const canvas = existing.canvas as OffscreenCanvas;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return existing;
  }

  // Fallback: create via env.createCanvas
  const createCanvas = env?.createCanvas;
  if (createCanvas) {
    const canvas = createCanvas(w, h);
    return createWebGL2(canvas);
  }

  return null;
}

/**
 * Field Render — GPU-accelerated field → buffer conversion.
 *
 * Takes a Field2D carrying a FieldExpr, compiles it to a GLSL
 * fragment shader, and evaluates it at every pixel via WebGL2.
 *
 * With uniform-based parameters, shader compilation happens once
 * per structural change. Parameter tweaks only update uniform
 * values — no recompilation needed.
 *
 * Falls back to CPU evaluation if:
 * - The Field2D has no FieldExpr (opaque closure)
 * - WebGL2 is unavailable
 * - Shader compilation fails
 *
 * Output is a single-channel Buffer2D at full resolution.
 */
export const fieldRender: Operator<Inputs, Outputs> = {
  id: "field-render",
  category: "top",
  label: "Field Render (GPU)",
  inputs: [
    { name: "field", type: "field" },
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "buffer", type: "buffer" }],
  params: [
    { key: "scale", label: "Resolution Scale", min: 0.25, max: 2, step: 0.25, default: 1 },
  ],

  evaluate({ field, width, height }, params, env) {
    const scale = params.scale ?? 1;
    const dpr = ((env as GraphEnv | undefined)?.dpr as number) ?? 1;
    const bufW = Math.round(width * scale * dpr);
    const bufH = Math.round(height * scale * dpr);

    // Try GPU path
    const expr = getFieldExpr(field);
    if (expr) {
      try {
        const gl = getGL(env as GraphEnv | undefined, bufW, bufH);
        if (gl) {
          const compiled = compileField(expr);
          return { buffer: renderFieldToTexture(gl, compiled, bufW, bufH) };
        }
      } catch {
        // GPU failed — fall through to CPU
      }
    }

    // CPU fallback — evaluate field at every pixel
    const data = new Float32Array(bufW * bufH);
    const invScale = 1 / (scale * dpr);
    for (let row = 0; row < bufH; row++) {
      for (let col = 0; col < bufW; col++) {
        data[row * bufW + col] = field(col * invScale, row * invScale);
      }
    }

    return { buffer: { data, width: bufW, height: bufH, channels: 1 } };
  },
};
