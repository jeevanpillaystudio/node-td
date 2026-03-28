import type { Operator, Geometry, Camera2D, Palette, Buffer2D, GraphEnv } from "../../kernel/types";

type Inputs = { geometry: Geometry<2>; camera: Camera2D; palette?: Palette };
type Outputs = { buffer: Buffer2D };

/**
 * Stroke Renderer — the primary 2D ROP.
 *
 * Renders geometry (line-strip, points, or triangles) through a Camera2D
 * into a Buffer2D. Uses an OffscreenCanvas via env.createCanvas for
 * anti-aliased stroke rendering, then reads back as Buffer2D.
 */
export const strokeRenderer: Operator<Inputs, Outputs> = {
  id: "stroke-renderer",
  category: "rop",
  label: "Stroke Renderer",
  inputs: [
    { name: "geometry", type: "geometry" },
    { name: "camera", type: "camera" },
    { name: "palette", type: "palette", optional: true },
  ],
  outputs: [{ name: "buffer", type: "buffer" }],
  params: [
    { key: "lineWidth", label: "Line Width", min: 0.5, max: 10, step: 0.1, default: 1.8 },
    { key: "strokeAlpha", label: "Stroke Alpha", min: 0, max: 1, step: 0.01, default: 0.65 },
    { key: "bgR", label: "BG Red", min: 0, max: 255, step: 1, default: 26 },
    { key: "bgG", label: "BG Green", min: 0, max: 255, step: 1, default: 26 },
    { key: "bgB", label: "BG Blue", min: 0, max: 255, step: 1, default: 26 },
    { key: "bgAlpha", label: "BG Alpha", min: 0, max: 1, step: 0.01, default: 1 },
  ],

  evaluate({ geometry, camera, palette }, params, env) {
    const [worldW, worldH] = camera.viewport;
    const dpr = ((env as GraphEnv | undefined)?.dpr as number) ?? 1;
    const pixelW = Math.round(worldW * dpr);
    const pixelH = Math.round(worldH * dpr);
    const lineWidth = params.lineWidth ?? 1.8;
    const alpha = params.strokeAlpha ?? 0.65;
    const bgR = params.bgR ?? 26;
    const bgG = params.bgG ?? 26;
    const bgB = params.bgB ?? 26;
    const bgAlpha = params.bgAlpha ?? 1;

    // Resolve stroke color from palette or default
    let sr = 217, sg = 217, sb = 217;
    if (palette && palette.count > 0) {
      sr = Math.round((palette.colors[0] ?? 0.85) * 255);
      sg = Math.round((palette.colors[1] ?? 0.85) * 255);
      sb = Math.round((palette.colors[2] ?? 0.85) * 255);
    }

    const createCanvas = (env as GraphEnv | undefined)?.createCanvas;
    if (!createCanvas) {
      throw new Error("stroke-renderer requires env.createCanvas");
    }

    // Render at full pixel resolution (DPR-aware)
    const offscreen = createCanvas(pixelW, pixelH);
    const ctx = offscreen.getContext("2d")!;

    // Scale from world coordinates → pixel coordinates
    ctx.scale(dpr, dpr);

    // Background (fills entire canvas via the scale transform)
    // When bgAlpha = 0, skip fill entirely for transparent overlay layers
    if (bgAlpha > 0) {
      ctx.fillStyle = bgAlpha >= 1
        ? `rgb(${bgR},${bgG},${bgB})`
        : `rgba(${bgR},${bgG},${bgB},${bgAlpha})`;
      ctx.fillRect(0, 0, worldW, worldH);
    }

    // Apply camera transform
    const [cx, cy] = camera.center;
    const zoom = camera.zoom;
    const rot = camera.rotation;

    if (zoom !== 1 || rot !== 0) {
      ctx.translate(cx, cy);
      if (rot !== 0) ctx.rotate(rot);
      if (zoom !== 1) ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }

    // Draw geometry
    const { positions, dim, topology, stripOffsets, vertexCount, indices } = geometry;

    if (topology === "points") {
      ctx.fillStyle = `rgba(${sr},${sg},${sb},${alpha})`;
      for (let i = 0; i < vertexCount; i++) {
        const x = positions[i * dim] as number;
        const y = positions[i * dim + 1] as number;
        ctx.beginPath();
        ctx.arc(x, y, lineWidth, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = `rgba(${sr},${sg},${sb},${alpha})`;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (topology === "line-strip") {
        ctx.beginPath();
        if (stripOffsets) {
          for (let s = 0; s < stripOffsets.length; s++) {
            const start = stripOffsets[s] as number;
            const end = s < stripOffsets.length - 1 ? (stripOffsets[s + 1] as number) : vertexCount;
            if (end - start < 2) continue;
            ctx.moveTo(positions[start * dim] as number, positions[start * dim + 1] as number);
            for (let i = start + 1; i < end; i++) {
              ctx.lineTo(positions[i * dim] as number, positions[i * dim + 1] as number);
            }
          }
        } else if (vertexCount >= 2) {
          ctx.moveTo(positions[0] as number, positions[1] as number);
          for (let i = 1; i < vertexCount; i++) {
            ctx.lineTo(positions[i * dim] as number, positions[i * dim + 1] as number);
          }
        }
        ctx.stroke();
      } else if (topology === "triangles" && indices) {
        ctx.beginPath();
        for (let i = 0; i < indices.length; i += 3) {
          const a = indices[i] as number;
          const b = indices[i + 1] as number;
          const c = indices[i + 2] as number;
          ctx.moveTo(positions[a * dim] as number, positions[a * dim + 1] as number);
          ctx.lineTo(positions[b * dim] as number, positions[b * dim + 1] as number);
          ctx.lineTo(positions[c * dim] as number, positions[c * dim + 1] as number);
          ctx.closePath();
        }
        ctx.stroke();
      }
    }

    // Read back at full pixel resolution
    const imageData = ctx.getImageData(0, 0, pixelW, pixelH);
    const rgba = imageData.data;
    const data = new Float32Array(pixelW * pixelH * 4);
    for (let i = 0; i < rgba.length; i++) {
      data[i] = rgba[i]! / 255;
    }

    return {
      buffer: { data, width: pixelW, height: pixelH, channels: 4 },
    };
  },
};
