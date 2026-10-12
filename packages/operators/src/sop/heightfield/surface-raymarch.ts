import { defineOperator, filterVertices } from "@node-td/kernel";

/**
 * Surface Raymarch — implicit terrain intersection for each screen-space seed.
 *
 * For each 2D seed point, casts a world-space ray through the camera and
 * sphere-traces against the terrain height-field SDF:
 *
 *   f(x, y, z) = y − amplitude * field(x, z)
 *
 * Outputs the subset of seeds that successfully hit the terrain surface,
 * with the seeds' own colours and attributes, plus these per-vertex
 * attributes for downstream shading and mark-making:
 *
 *   depth   — ray distance over the distance marched, 0..1 (near = bright)
 *   ao      — simple ambient occlusion estimate
 *   worldX  — world X at hit point (for angle field sampling)
 *   worldZ  — world Z at hit point
 *
 * This is the core Meridian SOP. It replaces the explicit
 * parametric-surface → surface-lift → visibility-cull → project-3d chain
 * for implicit (fBm-defined) terrain surfaces.
 */
export const surfaceRaymarch = defineOperator({
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
    { key: "aoSteps", label: "AO Steps", min: 0, max: 10, step: 1, default: 4 },
    { key: "aoRadius", label: "AO Radius", min: 1, max: 50, step: 1, default: 10 },
  ],
  evaluate({ seeds, camera3d, field }, params) {
    const amplitude = params.amplitude;
    const maxSteps  = Math.round(params.maxSteps);
    const maxDist   = params.maxDist;
    const epsilon   = params.epsilon;
    const aoSteps   = Math.round(params.aoSteps);
    const aoRadius  = params.aoRadius;

    // Height at world (x, z) — scales [0..1] field to world units
    const height = (x: number, z: number): number => field(x, z) * amplitude;

    // Terrain SDF: positive = above surface, negative = below
    const sdf = (x: number, y: number, z: number): number => y - height(x, z);

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

    const rays = Array.from({ length: seedCount }, (_, i) =>
      camera3d.unproject(seedPos[i * 2]!, seedPos[i * 2 + 1]!),
    );

    // The field is 0..1, so the surface lies between y = 0 and y = amplitude,
    // and a ray going down has met it by the time it crosses y = 0: no step
    // crosses that plane by more than the 0.5 minimum. March at least
    // maxDist, and on until the last ray has crossed, whatever the camera's
    // scale; the step budget grows in proportion.
    let marchLimit = maxDist;
    for (const { origin, dir } of rays) {
      if (dir[1] < 0) marchLimit = Math.max(marchLimit, origin[1] / -dir[1] + 1);
    }
    const stepBudget = Math.ceil((maxSteps * marchLimit) / maxDist);

    const hitSeed = new Uint8Array(seedCount);
    const outDepth: number[] = [];
    const outAO: number[]    = [];
    const outWX: number[]    = [];
    const outWZ: number[]    = [];

    for (let i = 0; i < seedCount; i++) {
      const { origin: [ox, oy, oz], dir: [dx, dy, dz] } = rays[i]!;

      // Sphere-trace along ray
      let t = 0;
      let hit = false;

      for (let step = 0; step < stepBudget; step++) {
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
        if (t >= marchLimit) break;
      }

      if (!hit) continue;

      const wx = ox + dx * t;
      const wy = oy + dy * t;
      const wz = oz + dz * t;

      const aoVal = ao(wx, wy, wz);

      hitSeed[i] = 1;
      outDepth.push(t / marchLimit);
      outAO.push(aoVal);
      outWX.push(wx);
      outWZ.push(wz);
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

    // The seeds that hit, as points, keeping their colours and attributes
    const { stripOffsets: _strips, indices: _indices, ...points } = seeds;
    const hits = filterVertices({ ...points, topology: "points" }, (i) => hitSeed[i] === 1);

    return {
      geometry: {
        ...hits,
        attributes: {
          ...hits.attributes,
          depth:   new Float32Array(outDepth),
          ao:      new Float32Array(outAO),
          worldX:  new Float32Array(outWX),
          worldZ:  new Float32Array(outWZ),
        },
      },
    };
  },
});
