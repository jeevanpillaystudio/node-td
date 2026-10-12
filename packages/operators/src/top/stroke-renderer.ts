import { asOffscreen } from "../canvas-handle";
import { defineOperator, forEachStrip, type Buffer2D } from "@node-td/kernel";

type Outputs = { buffer: Buffer2D };

/**
 * Stroke Renderer — the primary 2D render TOP, after TD's Render TOP.
 *
 * Renders geometry (line-strip, points, or triangles) through a Camera2D
 * into a Buffer2D. Uses an OffscreenCanvas via env.createCanvas for
 * anti-aliased stroke rendering, then reads back as Buffer2D.
 *
 * Phase 3 additions:
 *
 * 1. **Per-strip coloring** — When the geometry has `colors`, each strip
 *    is colored by its first vertex's colour. Colors are batched (quantized
 *    shading produces few unique colors) so the number of draw calls
 *    equals the number of distinct colors, not strips.
 *
 * 2. **Fill mode** — `renderMode=1` fills closed polygons instead of
 *    stroking them. Used for the terrain base outline fill that occludes
 *    strokes behind the terrain.
 */
export const strokeRenderer = defineOperator({
  id: "stroke-renderer",
  category: "top",
  label: "Stroke Renderer",
  inputs: [
    { name: "geometry", type: "geo2" },
    { name: "camera", type: "camera2d" },
    { name: "palette", type: "palette", optional: true },
  ],
  outputs: [{ name: "buffer", type: "image" }],
  params: [
    { key: "lineWidth", label: "Line Width", min: 0.5, max: 10, step: 0.1, default: 1.8 },
    { key: "strokeAlpha", label: "Stroke Alpha", min: 0, max: 1, step: 0.01, default: 0.65 },
    { key: "bgR", label: "BG Red", min: 0, max: 255, step: 1, default: 26 },
    { key: "bgG", label: "BG Green", min: 0, max: 255, step: 1, default: 26 },
    { key: "bgB", label: "BG Blue", min: 0, max: 255, step: 1, default: 26 },
    { key: "bgAlpha", label: "BG Alpha", min: 0, max: 1, step: 0.01, default: 1 },
    {
      key: "renderMode", label: "Mode",
      kind: "enum" as const,
      options: [
        { label: "Stroke", value: 0 },
        { label: "Fill", value: 1 },
        { label: "Oriented Dash", value: 2 },
      ],
      default: 0,
    },
    { key: "fillR", label: "Fill Red", min: 0, max: 255, step: 1, default: 26 },
    { key: "fillG", label: "Fill Green", min: 0, max: 255, step: 1, default: 26 },
    { key: "fillB", label: "Fill Blue", min: 0, max: 255, step: 1, default: 26 },
  ],
  envReads: ["dpr"],

  evaluate({ geometry, camera, palette }, params, env) {
    const [worldW, worldH] = camera.viewport;
    const dpr = env.dpr;
    const pixelW = Math.round(worldW * dpr);
    const pixelH = Math.round(worldH * dpr);
    const lineWidth = params.lineWidth;
    const alpha = params.strokeAlpha;
    const bgR = params.bgR;
    const bgG = params.bgG;
    const bgB = params.bgB;
    const bgAlpha = params.bgAlpha;
    const renderMode = params.renderMode;
    const fillR = params.fillR;
    const fillG = params.fillG;
    const fillB = params.fillB;

    // Resolve uniform stroke color from palette or default
    let sr = 217, sg = 217, sb = 217;
    if (palette && palette.count > 0) {
      sr = Math.round((palette.colors[0] ?? 0.85) * 255);
      sg = Math.round((palette.colors[1] ?? 0.85) * 255);
      sb = Math.round((palette.colors[2] ?? 0.85) * 255);
    }

    // Nothing to draw into: an empty image, where a canvas would fail
    if (pixelW <= 0 || pixelH <= 0) {
      const width = Math.max(0, pixelW);
      const height = Math.max(0, pixelH);
      return { buffer: { data: new Float32Array(0), width, height, channels: 4 } };
    }

    const createCanvas = env.createCanvas;
    if (!createCanvas) {
      throw new Error("stroke-renderer requires env.createCanvas");
    }

    const offscreen = asOffscreen(createCanvas(pixelW, pixelH));
    const ctx = offscreen.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // Background fill
    if (bgAlpha > 0) {
      ctx.fillStyle = bgAlpha >= 1
        ? `rgb(${bgR},${bgG},${bgB})`
        : `rgba(${bgR},${bgG},${bgB},${bgAlpha})`;
      ctx.fillRect(0, 0, worldW, worldH);
    }

    // Camera transform: the world point at camera.center lands at the
    // middle of the canvas, rotated and zoomed about it. At camera-2d's
    // defaults the center is the middle of the canvas and this is the
    // identity, so nothing is applied.
    const [cx, cy] = camera.center;
    const zoom = camera.zoom;
    const rot = camera.rotation;
    const midX = worldW / 2;
    const midY = worldH / 2;
    if (zoom !== 1 || rot !== 0 || cx !== midX || cy !== midY) {
      ctx.translate(midX, midY);
      if (rot !== 0) ctx.rotate(rot);
      if (zoom !== 1) ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }

    const { positions, dim, topology, stripOffsets, vertexCount, indices } = geometry;

    // ── Fill mode ─────────────────────────────────────────────────
    if (renderMode === 1) {
      // Resolve fill color: palette[0] if wired, else fillR/G/B params
      let fr = fillR, fg = fillG, fb = fillB;
      if (palette && palette.count > 0) {
        fr = Math.round((palette.colors[0] ?? 0.1) * 255);
        fg = Math.round((palette.colors[1] ?? 0.1) * 255);
        fb = Math.round((palette.colors[2] ?? 0.1) * 255);
      }

      ctx.fillStyle = `rgba(${fr},${fg},${fb},${alpha})`;

      if (topology === "line-strip") {
        ctx.beginPath();
        if (stripOffsets) {
          for (let s = 0; s < stripOffsets.length; s++) {
            const start = stripOffsets[s] as number;
            const end = s < stripOffsets.length - 1
              ? (stripOffsets[s + 1] as number)
              : vertexCount;
            if (end - start < 3) continue;
            ctx.moveTo(positions[start * dim] as number, positions[start * dim + 1] as number);
            for (let i = start + 1; i < end; i++) {
              ctx.lineTo(positions[i * dim] as number, positions[i * dim + 1] as number);
            }
            ctx.closePath();
          }
        } else if (vertexCount >= 3) {
          ctx.moveTo(positions[0] as number, positions[1] as number);
          for (let i = 1; i < vertexCount; i++) {
            ctx.lineTo(positions[i * dim] as number, positions[i * dim + 1] as number);
          }
          ctx.closePath();
        }
        ctx.fill();
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
        ctx.fill();
      }

      return canvasBuffer(offscreen, pixelW, pixelH);
    }

    // ── Oriented Dash mode ─────────────────────────────────────────
    // Renders each point as a centered line segment with per-vertex
    // angle and length from geometry.attributes. Color is the geometry's
    // own per-vertex colour when it has one, else indexed from the palette
    // by normalized depth (attributes.depth).
    if (renderMode === 2 && topology === "points") {
      const angAttr  = geometry.attributes?.angle;
      const lenAttr  = geometry.attributes?.length;
      const depAttr  = geometry.attributes?.depth;

      ctx.lineCap = "round";
      ctx.lineWidth = lineWidth;

      // Per-vertex (r,g,b) from the geometry, else from palette + depth, else uniform
      const colors    = geometry.colors;
      const depthIdx  = palette && depAttr && !colors;

      // Batch strokes by color key to minimize state changes
      const batches = new Map<string, [number, number, number, number][]>();

      for (let i = 0; i < vertexCount; i++) {
        const cx = positions[i * dim]!;
        const cy = positions[i * dim + 1]!;
        const angle = angAttr ? angAttr[i]! : 0;
        const len   = lenAttr ? lenAttr[i]! : lineWidth * 4;
        const hl    = len / 2;

        let cr = sr, cg = sg, cb = sb;
        if (colors) {
          const off = i * 3;
          cr = Math.round(colors[off]! * 255);
          cg = Math.round(colors[off + 1]! * 255);
          cb = Math.round(colors[off + 2]! * 255);
        } else if (depthIdx && palette && depAttr) {
          const t   = depAttr[i]!;
          const idx = Math.min(Math.floor(t * palette.count), palette.count - 1);
          const off = idx * 4;
          cr = Math.round((palette.colors[off]!   ?? 0.85) * 255);
          cg = Math.round((palette.colors[off + 1]! ?? 0.85) * 255);
          cb = Math.round((palette.colors[off + 2]! ?? 0.85) * 255);
        }

        const key = `${cr},${cg},${cb}`;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        let batch = batches.get(key);
        if (!batch) { batch = []; batches.set(key, batch); }
        // Store [x0, y0, x1, y1] for the segment
        batch.push([cx + cosA * hl, cy + sinA * hl, cx - cosA * hl, cy - sinA * hl]);
      }

      for (const [key, segs] of batches) {
        ctx.strokeStyle = `rgba(${key},${alpha})`;
        ctx.beginPath();
        for (const [x0, y0, x1, y1] of segs) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.stroke();
      }

      return canvasBuffer(offscreen, pixelW, pixelH);
    }

    // ── Stroke mode ───────────────────────────────────────────────
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = lineWidth;

    if (topology === "points") {
      ctx.fillStyle = `rgba(${sr},${sg},${sb},${alpha})`;
      for (let i = 0; i < vertexCount; i++) {
        const x = positions[i * dim] as number;
        const y = positions[i * dim + 1] as number;
        ctx.beginPath();
        ctx.arc(x, y, lineWidth, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (topology === "line-strip") {
      // Per-strip coloring: when the geometry has a colour per vertex,
      // batch strips by color for efficient rendering.
      // This matches Subscapes where each stroke gets a single color
      // determined by the diffuse shading at its starting vertex.
      const colors = geometry.colors;

      if (colors) {
        // Group strips by their first-vertex color (quantized shading
        // produces few unique colors, so this batches efficiently)
        const batches = new Map<string, [number, number][]>();

        forEachStrip(geometry, (start, end) => {
          if (end - start < 2) return;

          const off = start * 3;
          const cr = Math.round(colors[off]! * 255);
          const cg = Math.round(colors[off + 1]! * 255);
          const cb = Math.round(colors[off + 2]! * 255);
          const key = `${cr},${cg},${cb}`;

          let batch = batches.get(key);
          if (!batch) {
            batch = [];
            batches.set(key, batch);
          }
          batch.push([start, end]);
        });

        // Render each color batch in a single stroke() call
        for (const [key, strips] of batches) {
          ctx.strokeStyle = `rgba(${key},${alpha})`;
          ctx.beginPath();
          for (const [start, end] of strips) {
            ctx.moveTo(
              positions[start * dim] as number,
              positions[start * dim + 1] as number,
            );
            for (let i = start + 1; i < end; i++) {
              ctx.lineTo(
                positions[i * dim] as number,
                positions[i * dim + 1] as number,
              );
            }
          }
          ctx.stroke();
        }
      } else {
        // Uniform color for all strips
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},${alpha})`;
        ctx.beginPath();
        if (stripOffsets) {
          for (let s = 0; s < stripOffsets.length; s++) {
            const start = stripOffsets[s] as number;
            const end = s < stripOffsets.length - 1
              ? (stripOffsets[s + 1] as number)
              : vertexCount;
            if (end - start < 2) continue;
            ctx.moveTo(
              positions[start * dim] as number,
              positions[start * dim + 1] as number,
            );
            for (let i = start + 1; i < end; i++) {
              ctx.lineTo(
                positions[i * dim] as number,
                positions[i * dim + 1] as number,
              );
            }
          }
        } else if (vertexCount >= 2) {
          ctx.moveTo(positions[0] as number, positions[1] as number);
          for (let i = 1; i < vertexCount; i++) {
            ctx.lineTo(
              positions[i * dim] as number,
              positions[i * dim + 1] as number,
            );
          }
        }
        ctx.stroke();
      }
    } else if (topology === "triangles" && indices) {
      ctx.strokeStyle = `rgba(${sr},${sg},${sb},${alpha})`;
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

    return canvasBuffer(offscreen, pixelW, pixelH);
  },
});

/**
 * Read canvas pixels into a CPU-side Buffer2D.
 *
 * The OffscreenCanvas is attached as `_canvas` so that the composite
 * operator and blitBuffer2D can use the fast drawImage path. The `data`
 * field is eagerly populated, so consumers that need pixels never read
 * back from the canvas.
 *
 * The canvas lives as long as this output stays in the CookEngine cache:
 * consumers never clear `_canvas`, and the canvas is released when the
 * host clears the cache. Keeping many GPU-backed OffscreenCanvases cached
 * would exhaust GPU memory (10 panels × 5 canvases × 6.9 MB = 350 MB at
 * 2× DPR), which is why Frame clears its cache after every draw.
 */
function canvasBuffer(
  canvas: OffscreenCanvas,
  pixelW: number,
  pixelH: number,
): Outputs {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, pixelW, pixelH);
  const rgba = imageData.data;
  const data = new Float32Array(rgba.length);
  for (let i = 0; i < rgba.length; i++) data[i] = rgba[i]! / 255;
  return {
    buffer: { data, width: pixelW, height: pixelH, channels: 4, _canvas: canvas },
  };
}
