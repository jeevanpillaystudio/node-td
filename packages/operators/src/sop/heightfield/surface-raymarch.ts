import type { Operator, Geometry, Field2D, Camera3D } from "@node-td/kernel";

type Inputs = { seeds: Geometry<2>; camera3d: Camera3D; field: Field2D };
type Outputs = { geometry: Geometry<2> };

/**
 * Surface Raymarch — implicit terrain intersection for each screen-space seed.
 *
 * For each 2D seed point, casts a world-space ray through the camera and
 * sphere-traces against the terrain height-field SDF:
 *
 *   f(x, y, z) = y − amplitude * field(x, z)
 *
 * Outputs the subset of seeds that successfully hit the terrain surface,
 * carrying per-vertex attributes for downstream shading and mark-making:
 *
 *   depth   — normalized ray distance 0..1 (near = bright)
 *   ao      — simple ambient occlusion estimate
 *   worldX  — world X at hit point (for angle field sampling)
 *   worldY  — world Y (terrain height at hit)
 *   worldZ  — world Z at hit point
 *   normalX/Y/Z — surface normal via central differences
 *
 * This is the core Meridian SOP. It replaces the explicit
 * parametric-surface → surface-lift → visibility-cull → project-3d chain
 * for implicit (fBm-defined) terrain surfaces.
 */
export const surfaceRaymarch: Operator<Inputs, Outputs> = {
  id: "surface-raymarch",
  category: "sop",
  label: "Surface Raymarch",
  inputs: [
    { name: "seeds", type: "geo2" },
    { name: "camera3d", type: "camera3d" },
    { name: "field", type: "field" },
  ],
  outputs: [{ name: "geometry", type: "geo2" }],
  params: [
    { key: "amplitude", label: "Terrain Amplitude", min: 1, max: 500, step: 1, default: 80 },
    { key: "maxSteps", label: "Max Steps", min: 50, max: 500, step: 10, default: 150 },
    { key: "maxDist", label: "Max Distance", min: 50, max: 2000, step: 50, default: 700 },
    { key: "epsilon", label: "Hit Epsilon", min: 0.01, max: 2, step: 0.01, default: 0.3 },
    { key: "normalEps", label: "Normal Epsilon", min: 0.1, max: 5, step: 0.1, default: 0.5 },
    { key: "aoSteps", label: "AO Steps", min: 0, max: 10, step: 1, default: 4 },
    { key: "aoRadius", label: "AO Radius", min: 1, max: 50, step: 1, default: 10 },
  ],
  evaluate({ seeds, camera3d, field }, params) {
    const amplitude = params.amplitude ?? 80;
    const maxSteps  = Math.round(params.maxSteps ?? 150);
    const maxDist   = params.maxDist ?? 700;
    const epsilon   = params.epsilon ?? 0.3;
    const normalEps = params.normalEps ?? 0.5;
    const aoSteps   = Math.round(params.aoSteps ?? 4);
    const aoRadius  = params.aoRadius ?? 10;

    // Height at world (x, z) — scales [0..1] field to world units
    const height = (x: number, z: number): number => field(x, z) * amplitude;

    // Terrain SDF: positive = above surface, negative = below
    const sdf = (x: number, y: number, z: number): number => y - height(x, z);

    // Central-difference surface normal
    const normal = (x: number, y: number, z: number): [number, number, number] => {
      const e = normalEps;
      const dx = sdf(x + e, y, z) - sdf(x - e, y, z);
      const dy = sdf(x, y + e, z) - sdf(x, y - e, z);
      const dz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return len > 1e-10 ? [dx / len, dy / len, dz / len] : [0, 1, 0];
    };

    // Horizon-based AO: step upward along Y and check if terrain occludes
    const ao = (wx: number, wy: number, wz: number): number => {
      if (aoSteps === 0) return 1;
      let occ = 0;
      for (let i = 1; i <= aoSteps; i++) {
        const step = (i / aoSteps) * aoRadius;
        const sh = height(wx, wz) - (wy + step);
        if (sh > 0) occ += sh / (aoRadius * aoSteps);
      }
      return Math.max(0, 1 - occ);
    };

    const { positions: seedPos, vertexCount: seedCount } = seeds;

    const outPos: number[]   = [];
    const outDepth: number[] = [];
    const outAO: number[]    = [];
    const outWX: number[]    = [];
    const outWY: number[]    = [];
    const outWZ: number[]    = [];
    const outNX: number[]    = [];
    const outNY: number[]    = [];
    const outNZ: number[]    = [];

    for (let i = 0; i < seedCount; i++) {
      const sx = seedPos[i * 2]!;
      const sy = seedPos[i * 2 + 1]!;

      const ray = camera3d.unproject(sx, sy);
      const { origin: [ox, oy, oz], dir: [dx, dy, dz] } = ray;

      // Sphere-trace along ray
      let t = 0;
      let hit = false;

      for (let step = 0; step < maxSteps; step++) {
        const wx = ox + dx * t;
        const wy = oy + dy * t;
        const wz = oz + dz * t;

        const dist = sdf(wx, wy, wz);

        if (dist < epsilon) {
          hit = true;
          break;
        }

        // Full sphere-trace step — safe for smooth fBm terrain
        t += Math.max(dist, 0.5);
        if (t >= maxDist) break;
      }

      if (!hit) continue;

      const wx = ox + dx * t;
      const wy = oy + dy * t;
      const wz = oz + dz * t;

      const [nx, ny, nz] = normal(wx, wy, wz);
      const aoVal = ao(wx, wy, wz);

      outPos.push(sx, sy);
      outDepth.push(t / maxDist);
      outAO.push(aoVal);
      outWX.push(wx);
      outWY.push(wy);
      outWZ.push(wz);
      outNX.push(nx);
      outNY.push(ny);
      outNZ.push(nz);
    }

    const n = outDepth.length;
    if (n === 0) {
      return {
        geometry: {
          positions: new Float32Array(0),
          vertexCount: 0,
          dim: 2,
          topology: "points",
        },
      };
    }

    return {
      geometry: {
        positions: new Float32Array(outPos),
        vertexCount: n,
        dim: 2,
        topology: "points",
        attributes: {
          depth:   new Float32Array(outDepth),
          ao:      new Float32Array(outAO),
          worldX:  new Float32Array(outWX),
          worldY:  new Float32Array(outWY),
          worldZ:  new Float32Array(outWZ),
          normalX: new Float32Array(outNX),
          normalY: new Float32Array(outNY),
          normalZ: new Float32Array(outNZ),
        },
      },
    };
  },
};
