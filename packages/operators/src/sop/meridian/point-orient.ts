import { defineOperator } from "@node-td/kernel";

/**
 * Point Orient — adds `angle` and `length` attributes to point geometry
 * by sampling a Field2D at each vertex's world-space position.
 *
 * Reads `worldX` / `worldZ` from `geometry.attributes` (populated by
 * surface-raymarch) and samples the angle field at those coordinates.
 * Falls back to screen-space positions if world attrs are absent.
 *
 * Modulates stroke length by depth and AO if those attributes exist:
 *   length = baseLength × (lengthScale + (1 − lengthScale) × depthFactor × aoFactor)
 *
 * In TouchDesigner terms: the Attribute Create SOP for stroke orientation.
 *
 * Output attributes:
 *   angle  — stroke orientation in radians
 *   length — stroke half-length in pixels
 */
export const pointOrient = defineOperator({
  id: "point-orient",
  category: "sop",
  label: "Point Orient",
  inputs: [
    { name: "geometry", type: "geo2" },
    { name: "field", type: "field" },
  ],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [
    { key: "baseAngle", label: "Base Angle (rad)", min: -3.14, max: 3.14, step: 0.01, default: 0 },
    { key: "angleScale", label: "Angle Scale", min: 0, max: 6.28, step: 0.1, default: 3.14 },
    { key: "baseLength", label: "Base Length (px)", min: 1, max: 80, step: 0.5, default: 14 },
    { key: "lengthScale", label: "Min Length Factor", min: 0, max: 1, step: 0.01, default: 0.3 },
    {
      key: "noiseScale",
      label: "Field Sample Scale",
      min: 0.001,
      max: 1,
      step: 0.001,
      default: 0.025,
    },
  ],
  evaluate({ geometry, field }, params) {
    const baseAngle = params.baseAngle;
    const angleScale = params.angleScale;
    const baseLength = params.baseLength;
    const lengthScale = params.lengthScale;
    const noiseScale = params.noiseScale;

    const n = geometry.vertexCount;
    const attrs = geometry.attributes ?? {};
    const worldX = attrs.worldX;
    const worldZ = attrs.worldZ;
    const depth = attrs.depth;
    const aoAttr = attrs.ao;

    const angles = new Float32Array(n);
    const lengths = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      // Sample angle field at world XZ (fallback to screen pos)
      const wx = worldX ? worldX[i]! : geometry.positions[i * 2]!;
      const wz = worldZ ? worldZ[i]! : geometry.positions[i * 2 + 1]!;

      const noiseVal = field(wx * noiseScale, wz * noiseScale);
      angles[i] = baseAngle + noiseVal * angleScale;

      // Length modulation: closer (low depth) and lit (high AO) = longer strokes
      const d = depth ? depth[i]! : 0.5;
      const a = aoAttr ? aoAttr[i]! : 1.0;
      const depthFactor = 1 - d; // 0 = far/small, 1 = close/full
      const aoFactor = 0.4 + 0.6 * a; // partial modulation so occluded isn't zero

      lengths[i] = baseLength * (lengthScale + (1 - lengthScale) * depthFactor * aoFactor);
    }

    return {
      geometry: {
        ...geometry,
        attributes: {
          ...attrs,
          angle: angles,
          length: lengths,
        },
      },
    };
  },
});
