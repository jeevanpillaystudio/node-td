import type { Operator, Geometry, Camera2D, Palette, Buffer2D, GraphEnv } from "../../kernel/types";

type Inputs = { geometry: Geometry<2>; camera: Camera2D; palette?: Palette };
type Outputs = { buffer: Buffer2D };

/**
 * Point Renderer — ROP for point-topology geometry.
 *
 * Draws filled circles at each vertex position. When a palette is
 * connected, cycles through palette colors per point.
 */
export const pointRenderer: Operator<Inputs, Outputs> = {
  id: "point-renderer",
  category: "rop",
  label: "Point Renderer",
  inputs: [
    { name: "geometry", type: "geometry" },
    { name: "camera", type: "camera" },
    { name: "palette", type: "palette", optional: true },
  ],
  outputs: [{ name: "buffer", type: "buffer" }],
  params: [
    { key: "radius", label: "Radius", min: 0.5, max: 20, step: 0.5, default: 3 },
    { key: "alpha", label: "Alpha", min: 0, max: 1, step: 0.01, default: 0.8 },
    { key: "bgR", label: "BG Red", min: 0, max: 255, step: 1, default: 26 },
    { key: "bgG", label: "BG Green", min: 0, max: 255, step: 1, default: 26 },
    { key: "bgB", label: "BG Blue", min: 0, max: 255, step: 1, default: 26 },
  ],

  evaluate({ geometry, camera, palette }, params, env) {
    const [worldW, worldH] = camera.viewport;
    const dpr = ((env as GraphEnv | undefined)?.dpr as number) ?? 1;
    const pixelW = Math.round(worldW * dpr);
    const pixelH = Math.round(worldH * dpr);
    const radius = params.radius ?? 3;
    const alpha = params.alpha ?? 0.8;
    const bgR = params.bgR ?? 26;
    const bgG = params.bgG ?? 26;
    const bgB = params.bgB ?? 26;

    const createCanvas = (env as GraphEnv | undefined)?.createCanvas;
    if (!createCanvas) {
      throw new Error("point-renderer requires env.createCanvas");
    }

    const offscreen = createCanvas(pixelW, pixelH);
    const ctx = offscreen.getContext("2d")!;

    // Scale from world coordinates → pixel coordinates
    ctx.scale(dpr, dpr);

    ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
    ctx.fillRect(0, 0, worldW, worldH);

    // Camera transform
    const [cx, cy] = camera.center;
    const zoom = camera.zoom;
    const rot = camera.rotation;

    if (zoom !== 1 || rot !== 0) {
      ctx.translate(cx, cy);
      if (rot !== 0) ctx.rotate(rot);
      if (zoom !== 1) ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }

    const { positions, dim, vertexCount } = geometry;

    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * dim] as number;
      const y = positions[i * dim + 1] as number;

      // Cycle palette colors or use default white
      if (palette && palette.count > 0) {
        const ci = (i % palette.count) * 4;
        const r = Math.round((palette.colors[ci] ?? 0.85) * 255);
        const g = Math.round((palette.colors[ci + 1] ?? 0.85) * 255);
        const b = Math.round((palette.colors[ci + 2] ?? 0.85) * 255);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      } else {
        ctx.fillStyle = `rgba(217,217,217,${alpha})`;
      }

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

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
