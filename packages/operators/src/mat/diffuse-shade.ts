import { defineOperator, type Geometry, type Palette } from "@node-td/kernel";

/**
 * Diffuse Shade — Lambert N dot L shading with quantized intensity steps.
 *
 * Matches the Subscapes lighting system (algorithm.js lines 305-325):
 *
 * 1. For each vertex in the input geometry, compute Lambert diffuse:
 *      intensity = max(0, dot(normal, lightDir))
 * 2. Quantize the intensity to a discrete set of steps (e.g. [0, 0.3, 0.75, 1])
 *    to create the illustrative "limited pen widths" aesthetic.
 * 3. Use the quantized intensity to interpolate through the input palette,
 *    producing a per-vertex color output.
 *
 * The output is a Palette with `vertexCount` colors — one per vertex.
 * This "expanded palette" can be consumed by a stroke-renderer to
 * color each vertex differently based on lighting.
 *
 * If no palette is wired, outputs a grayscale ramp from the shading values.
 *
 * The quantization step count is what gives Subscapes its signature
 * "pen and ink" look — in real life, you only have a few pen widths
 * and ink colors to choose from.
 */
export const diffuseShade = defineOperator({
  id: "diffuse-shade",
  category: "mat",
  label: "Diffuse Shade",
  inputs: [
    { name: "geometry", type: "geo3" },
    { name: "palette", type: "palette", optional: true },
  ],
  outputs: [{ name: "palette", type: "palette" }],
  params: [
    { key: "lightX", label: "Light X", min: -1, max: 1, step: 0.01, default: 0 },
    { key: "lightY", label: "Light Y", min: -1, max: 1, step: 0.01, default: -0.707 },
    { key: "lightZ", label: "Light Z", min: -1, max: 1, step: 0.01, default: -0.707 },
    { key: "steps", label: "Quantize Steps", min: 0, max: 16, step: 1, default: 4 },
    { key: "ambient", label: "Ambient", min: 0, max: 1, step: 0.01, default: 0.1 },
  ],
  evaluate({ geometry: geo, palette: inputPalette }, params) {
    const lx = params.lightX;
    const ly = params.lightY;
    const lz = params.lightZ;
    const steps = Math.round(params.steps);
    const ambient = params.ambient;

    // Normalize light direction
    const llen = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const nlx = llen > 0 ? lx / llen : 0;
    const nly = llen > 0 ? ly / llen : -0.707;
    const nlz = llen > 0 ? lz / llen : -0.707;

    const normals = geo.normals;
    const count = geo.vertexCount;
    const colors = new Float32Array(count * 4);

    // Compute per-vertex shading intensity
    const intensities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      if (normals) {
        const nx = normals[i * 3] as number;
        const ny = normals[i * 3 + 1] as number;
        const nz = normals[i * 3 + 2] as number;

        // Lambert diffuse: max(0, N dot L)
        let diffuse = Math.max(0, nx * nlx + ny * nly + nz * nlz);

        // Quantize to discrete steps (the "illustrative" look)
        if (steps > 0) {
          diffuse = Math.round(diffuse * steps) / steps;
        }

        intensities[i] = Math.min(1, ambient + diffuse * (1 - ambient));
      } else {
        intensities[i] = 1;
      }
    }

    // Map intensity to colors
    if (inputPalette && inputPalette.count >= 2) {
      // Interpolate through the palette: 0 → first color, 1 → last color
      // This matches Subscapes where dark-to-light palette is indexed by diffuse
      const pc = inputPalette.colors;
      const pCount = inputPalette.count;

      for (let i = 0; i < count; i++) {
        const t = intensities[i]!;
        const scaledT = t * (pCount - 1);
        const idx0 = Math.min(Math.floor(scaledT), pCount - 2);
        const idx1 = idx0 + 1;
        const frac = scaledT - idx0;

        const base = i * 4;
        const b0 = idx0 * 4;
        const b1 = idx1 * 4;
        colors[base] = pc[b0]! * (1 - frac) + pc[b1]! * frac;
        colors[base + 1] = pc[b0 + 1]! * (1 - frac) + pc[b1 + 1]! * frac;
        colors[base + 2] = pc[b0 + 2]! * (1 - frac) + pc[b1 + 2]! * frac;
        colors[base + 3] = 1;
      }
    } else if (inputPalette && inputPalette.count === 1) {
      // Single-color palette: modulate brightness by shading intensity.
      // Quantized steps produce distinct shade bands (pen-and-ink aesthetic).
      const pr = inputPalette.colors[0]!;
      const pg = inputPalette.colors[1]!;
      const pb = inputPalette.colors[2]!;
      for (let i = 0; i < count; i++) {
        const t = intensities[i]!;
        const base = i * 4;
        colors[base] = pr * t;
        colors[base + 1] = pg * t;
        colors[base + 2] = pb * t;
        colors[base + 3] = 1;
      }
    } else {
      // Grayscale fallback
      for (let i = 0; i < count; i++) {
        const v = intensities[i]!;
        const base = i * 4;
        colors[base] = v;
        colors[base + 1] = v;
        colors[base + 2] = v;
        colors[base + 3] = 1;
      }
    }

    return { palette: { colors, count } };
  },
});
