import type { Operator, Geometry } from "@node-td/kernel";
import { pointsGeometry } from "@node-td/kernel";

type Inputs = { width: number; height: number; partitions?: Geometry<2> };
type Outputs = { geometry: Geometry<2> };

/** Random source — draws from env.rng, the graph's seeded stream */
type RandFn = () => number;

/**
 * Bridson's algorithm for Poisson-disc sampling.
 * Produces more uniform coverage than rejection sampling in O(n) time.
 */
function poissonDiscSample(
  w: number,
  h: number,
  minRadius: number,
  rand: RandFn,
  k: number = 30,
): [number, number][] {
  const r = minRadius;
  const cellSize = r / Math.SQRT2;
  const gridW = Math.ceil(w / cellSize);
  const gridH = Math.ceil(h / cellSize);
  const grid: ([number, number] | null)[] = new Array<null>(gridW * gridH).fill(null);
  const points: [number, number][] = [];
  const active: number[] = [];

  function gridIndex(x: number, y: number): number {
    return Math.floor(x / cellSize) + Math.floor(y / cellSize) * gridW;
  }

  function tooClose(px: number, py: number): boolean {
    const col = Math.floor(px / cellSize);
    const row = Math.floor(py / cellSize);
    const r2 = r * r;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const c = col + dx;
        const rr = row + dy;
        if (c < 0 || c >= gridW || rr < 0 || rr >= gridH) continue;
        const neighbour = grid[c + rr * gridW];
        if (!neighbour) continue;
        const ddx = px - neighbour[0];
        const ddy = py - neighbour[1];
        if (ddx * ddx + ddy * ddy < r2) return true;
      }
    }
    return false;
  }

  const x0 = rand() * w;
  const y0 = rand() * h;
  const p0: [number, number] = [x0, y0];
  points.push(p0);
  grid[gridIndex(x0, y0)] = p0;
  active.push(0);

  while (active.length > 0) {
    const idx = Math.floor(rand() * active.length);
    const base = points[active[idx]!]!;
    let found = false;

    for (let attempt = 0; attempt < k; attempt++) {
      const angle = rand() * Math.PI * 2;
      const dist = r + rand() * r;
      const nx = base[0] + Math.cos(angle) * dist;
      const ny = base[1] + Math.sin(angle) * dist;

      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (tooClose(nx, ny)) continue;

      const np: [number, number] = [nx, ny];
      points.push(np);
      grid[gridIndex(nx, ny)] = np;
      active.push(points.length - 1);
      found = true;
      break;
    }

    if (!found) {
      active.splice(idx, 1);
    }
  }

  return points;
}

/**
 * When `partitions` geometry (from binary-subdivide) is wired, each seed
 * is tagged with its partition's `cellId` attribute, and seeds in deeper
 * partitions (higher `depth` attribute) get tighter spacing via
 * `densityScale`. This creates the spatially-varying stroke density
 * seen in Subscapes' patchwork quilt patterns.
 */
export const poissonDisc: Operator<Inputs, Outputs> = {
  id: "poisson-disc",
  category: "sop",
  label: "Poisson Disc Seeds",
  inputs: [
    { name: "width", type: "number" },
    { name: "height", type: "number" },
    { name: "partitions", type: "geometry", optional: true },
  ],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [
    { key: "minRadius", label: "Min Seed Radius", min: 10, max: 150, step: 5, default: 40 },
    { key: "margin", label: "Edge Margin", min: 0, max: 300, step: 10, default: 100 },
    { key: "densityScale", label: "Partition Density Scale", min: 0.1, max: 3, step: 0.1, default: 1.5 },
  ],
  evaluate({ width, height, partitions }, params, env) {
    const minRadius = params.minRadius ?? 40;
    const margin = params.margin ?? 100;
    const rand: RandFn = () => env.rng.random();

    // Sample in an extended area so seeds reach all canvas edges
    const raw = poissonDiscSample(width + 2 * margin, height + 2 * margin, minRadius, rand);
    const shifted = raw.map(([x, y]): [number, number] => [x - margin, y - margin]);

    if (!partitions || !partitions.indices || !partitions.attributes?.cellId) {
      return { geometry: pointsGeometry(shifted) };
    }

    // ── Partition-aware density filtering ──────────────────────
    // Build a spatial lookup for partition cells (triangle-based)
    const depthAttr = partitions.attributes.depth;
    const cellIdAttr = partitions.attributes.cellId;
    const pPos = partitions.positions;
    const pIdx = partitions.indices;
    const densityScale = params.densityScale ?? 1.5;

    // For each seed, find which partition triangle it falls in
    // and apply depth-based density scaling
    const accepted: [number, number][] = [];
    const cellIds: number[] = [];

    for (const [px, py] of shifted) {
      const triIdx = findContainingTriangle(px, py, pPos, pIdx);
      if (triIdx < 0) {
        // Outside partitions — keep with no cell assignment
        accepted.push([px, py]);
        cellIds.push(-1);
        continue;
      }

      const vertIdx = pIdx[triIdx * 3]!;
      const depth = depthAttr ? depthAttr[vertIdx]! : 0;

      // Deeper cells have higher depth (0-1). Scale acceptance probability
      // so deeper cells keep more seeds (higher density).
      // depth=0 → keep prob = 1/densityScale, depth=1 → keep prob = 1
      const keepProb = (1 - depth) / densityScale + depth;
      if (rand() < keepProb) {
        accepted.push([px, py]);
        cellIds.push(cellIdAttr[vertIdx]!);
      }
    }

    const geo = pointsGeometry(accepted);
    // Attach cellId as per-vertex attribute
    geo.attributes = { cellId: new Float32Array(cellIds) };
    return { geometry: geo };
  },
};

/** Find which triangle in the partition mesh contains point (px, py) */
function findContainingTriangle(
  px: number, py: number,
  positions: Float32Array, indices: Uint32Array,
): number {
  const triCount = indices.length / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3]! * 2;
    const i1 = indices[t * 3 + 1]! * 2;
    const i2 = indices[t * 3 + 2]! * 2;

    const ax = positions[i0]!, ay = positions[i0 + 1]!;
    const bx = positions[i1]!, by = positions[i1 + 1]!;
    const cx = positions[i2]!, cy = positions[i2 + 1]!;

    // Barycentric coordinate test
    const v0x = cx - ax, v0y = cy - ay;
    const v1x = bx - ax, v1y = by - ay;
    const v2x = px - ax, v2y = py - ay;

    const d00 = v0x * v0x + v0y * v0y;
    const d01 = v0x * v1x + v0y * v1y;
    const d02 = v0x * v2x + v0y * v2y;
    const d11 = v1x * v1x + v1y * v1y;
    const d12 = v1x * v2x + v1y * v2y;

    const inv = d00 * d11 - d01 * d01;
    if (Math.abs(inv) < 1e-12) continue;
    const invDenom = 1 / inv;

    const u = (d11 * d02 - d01 * d12) * invDenom;
    const v = (d00 * d12 - d01 * d02) * invDenom;

    if (u >= 0 && v >= 0 && u + v <= 1) return t;
  }
  return -1;
}
