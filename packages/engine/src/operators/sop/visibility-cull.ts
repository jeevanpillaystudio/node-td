import type { Operator, Camera3D, Geometry } from "../../kernel/types";

type Inputs = { geometry: Geometry<3>; mesh: Geometry<3>; camera3d: Camera3D };
type Outputs = { geometry: Geometry<3> };

/**
 * Visibility Cull — removes occluded stroke vertices using raycasting.
 *
 * Implements the Subscapes occlusion system (algorithm.js lines 359-386):
 *
 * 1. For each stroke vertex, find which triangle of the collision mesh
 *    it lies on (using barycentric coordinates in XZ ground-plane).
 * 2. Check if that triangle is back-facing relative to the camera.
 * 3. Cast a ray from the vertex toward the camera and test for
 *    intersections with other triangles — if any closer triangle
 *    occludes the vertex, cull it.
 *
 * When a vertex is culled, the current strip is split — occluded
 * segments become gaps between visible sub-strips.
 *
 * Input `geometry` is the 3D stroke paths (line-strip topology).
 * Input `mesh` is the triangle collision mesh from parametric-surface.
 * Input `camera3d` provides the projection for determining camera direction.
 *
 * General-purpose: works for any 3D-to-2D pen-plotter-style rendering
 * where you need hidden line removal.
 */
export const visibilityCull: Operator<Inputs, Outputs> = {
  id: "visibility-cull",
  category: "sop",
  label: "Visibility Cull",
  inputs: [
    { name: "geometry", type: "geometry" },
    { name: "mesh", type: "geometry" },
    { name: "camera3d", type: "camera3d" },
  ],
  outputs: [{ name: "geometry", type: "geometry" }],
  params: [],
  evaluate({ geometry: strokes, mesh, camera3d }) {
    if (strokes.topology !== "line-strip" || !strokes.stripOffsets) {
      // Nothing to cull — pass through non-strip geometry
      return { geometry: strokes };
    }

    if (!mesh.indices || mesh.topology !== "triangles") {
      // No collision mesh — pass through
      return { geometry: strokes };
    }

    // ── Build triangle data from mesh ────────────────────────────
    const meshPos = mesh.positions;
    const meshIdx = mesh.indices;
    const triCount = meshIdx.length / 3;

    // Pre-compute triangle vertices and face normals for raycasting
    const triVerts: Float64Array[] = new Array(triCount);
    const triNormals: Float64Array[] = new Array(triCount);
    const triCentroids: Float64Array[] = new Array(triCount);

    for (let t = 0; t < triCount; t++) {
      const i0 = meshIdx[t * 3]! * 3;
      const i1 = meshIdx[t * 3 + 1]! * 3;
      const i2 = meshIdx[t * 3 + 2]! * 3;

      const ax = meshPos[i0]!, ay = meshPos[i0 + 1]!, az = meshPos[i0 + 2]!;
      const bx = meshPos[i1]!, by = meshPos[i1 + 1]!, bz = meshPos[i1 + 2]!;
      const cx = meshPos[i2]!, cy = meshPos[i2 + 1]!, cz = meshPos[i2 + 2]!;

      triVerts[t] = new Float64Array([ax, ay, az, bx, by, bz, cx, cy, cz]);

      // Face normal via cross product of edges.
      // Use e2 x e1 (not e1 x e2) because parametric-surface produces
      // CW winding (TL, TR, BL) which after surface-lift gives downward
      // normals with the standard cross. Swapping gives outward (upward) normals.
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      const nx = e2y * e1z - e2z * e1y;
      const ny = e2z * e1x - e2x * e1z;
      const nz = e2x * e1y - e2y * e1x;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0) {
        triNormals[t] = new Float64Array([nx / len, ny / len, nz / len]);
      } else {
        triNormals[t] = new Float64Array([0, 1, 0]);
      }

      triCentroids[t] = new Float64Array([
        (ax + bx + cx) / 3,
        (ay + by + cy) / 3,
        (az + bz + cz) / 3,
      ]);
    }

    // ── Build spatial lookup grid for XZ ground-plane ────────────
    // Find the mesh bounding box in XZ
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const x = meshPos[i * 3]!;
      const z = meshPos[i * 3 + 2]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;
    const gridRes = Math.min(64, Math.ceil(Math.sqrt(triCount)));
    const cellW = rangeX / gridRes;
    const cellH = rangeZ / gridRes;

    // Assign triangles to grid cells (by centroid)
    const grid: number[][] = new Array(gridRes * gridRes);
    for (let i = 0; i < grid.length; i++) grid[i] = [];

    for (let t = 0; t < triCount; t++) {
      const c = triCentroids[t]!;
      const gx = Math.min(gridRes - 1, Math.max(0, Math.floor((c[0]! - minX) / cellW)));
      const gz = Math.min(gridRes - 1, Math.max(0, Math.floor((c[2]! - minZ) / cellH)));
      grid[gz * gridRes + gx]!.push(t);
    }

    // ── Find triangle for a point in XZ using barycentric coords ─
    function findTriangle(px: number, pz: number): number {
      const gx = Math.min(gridRes - 1, Math.max(0, Math.floor((px - minX) / cellW)));
      const gz = Math.min(gridRes - 1, Math.max(0, Math.floor((pz - minZ) / cellH)));

      // Search the cell and its neighbors
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          const cz = gz + dz;
          if (cx < 0 || cx >= gridRes || cz < 0 || cz >= gridRes) continue;
          const cell = grid[cz * gridRes + cx]!;

          for (let k = 0; k < cell.length; k++) {
            const t = cell[k]!;
            const v = triVerts[t]!;
            // Barycentric test in XZ plane
            const ax = v[0]!, az = v[2]!;
            const bx = v[3]!, bz = v[5]!;
            const cx2 = v[6]!, cz2 = v[8]!;

            const v0x = cx2 - ax, v0z = cz2 - az;
            const v1x = bx - ax, v1z = bz - az;
            const v2x = px - ax, v2z = pz - az;

            const d00 = v0x * v0x + v0z * v0z;
            const d01 = v0x * v1x + v0z * v1z;
            const d02 = v0x * v2x + v0z * v2z;
            const d11 = v1x * v1x + v1z * v1z;
            const d12 = v1x * v2x + v1z * v2z;

            const inv = d00 * d11 - d01 * d01;
            if (Math.abs(inv) < 1e-12) continue;
            const invDenom = 1 / inv;

            const u = (d11 * d02 - d01 * d12) * invDenom;
            const v2 = (d00 * d12 - d01 * d02) * invDenom;

            if (u >= 0 && v2 >= 0 && u + v2 <= 1) {
              return t;
            }
          }
        }
      }
      return -1;
    }

    // ── Moller-Trumbore ray-triangle intersection ────────────────
    function rayTriangleIntersect(
      ox: number, oy: number, oz: number,
      dx: number, dy: number, dz: number,
      v: Float64Array,
    ): number {
      const e1x = v[3]! - v[0]!, e1y = v[4]! - v[1]!, e1z = v[5]! - v[2]!;
      const e2x = v[6]! - v[0]!, e2y = v[7]! - v[1]!, e2z = v[8]! - v[2]!;

      const pvx = dy * e2z - dz * e2y;
      const pvy = dz * e2x - dx * e2z;
      const pvz = dx * e2y - dy * e2x;

      const det = e1x * pvx + e1y * pvy + e1z * pvz;
      // One-sided test: only count front-face hits as occlusions.
      // For our mesh winding (cross(e1,e2) points down on upward terrain),
      // det > 0 means the occluding triangle faces the camera.
      // Reject det <= 0 (back-face hits / parallel) to avoid false occlusions
      // on rolling terrain where the ray clips through neighbors' back faces.
      if (det < 1e-10) return -1;
      const invDet = 1 / det;

      const tvx = ox - v[0]!, tvy = oy - v[1]!, tvz = oz - v[2]!;
      const u = (tvx * pvx + tvy * pvy + tvz * pvz) * invDet;
      if (u < 0 || u > 1) return -1;

      const qvx = tvy * e1z - tvz * e1y;
      const qvy = tvz * e1x - tvx * e1z;
      const qvz = tvx * e1y - tvy * e1x;
      const v2 = (dx * qvx + dy * qvy + dz * qvz) * invDet;
      if (v2 < 0 || u + v2 > 1) return -1;

      const t = (e2x * qvx + e2y * qvy + e2z * qvz) * invDet;
      return t > 1e-6 ? t : -1;
    }

    // ── Visibility test per triangle (cached) ────────────────────
    // Cache: -1 = unchecked, 0 = hidden, 1 = visible
    const triVisible = new Int8Array(triCount).fill(-1);

    // ── Derive camera eye direction from projection depth ───────
    // project() returns [screenX, screenY, ndcDepth].
    // The "toward camera" direction is where ndcDepth decreases most.
    // For isometric projection this direction is constant across the scene.
    const { project } = camera3d;
    const [, , refDepth] = project([0, 0, 0]);

    const candidates: [number, number, number][] = [
      [1, 1, -1], [-1, 1, -1], [1, 1, 1], [-1, 1, 1],
    ];
    let eyeDirX = 0, eyeDirY = 1, eyeDirZ = 0;
    let bestDepthDecrease = 0;
    for (const c of candidates) {
      const len = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
      const cx = c[0] / len, cy = c[1] / len, cz = c[2] / len;
      const [, , depthTest] = project([cx * 50, cy * 50, cz * 50]);
      const decrease = refDepth - depthTest; // positive = toward camera
      if (decrease > bestDepthDecrease) {
        bestDepthDecrease = decrease;
        eyeDirX = cx;
        eyeDirY = cy;
        eyeDirZ = cz;
      }
    }

    function isTriangleVisible(triIdx: number): boolean {
      if (triVisible[triIdx] !== -1) return triVisible[triIdx] === 1;

      const n = triNormals[triIdx]!;
      // Back-face test: normal should face toward camera
      const dot = n[0]! * eyeDirX + n[1]! * eyeDirY + n[2]! * eyeDirZ;
      if (dot <= 0) {
        triVisible[triIdx] = 0;
        return false;
      }

      // Occlusion test: cast ray from centroid toward camera
      const c = triCentroids[triIdx]!;
      const ox = c[0]! + n[0]! * 0.01;
      const oy = c[1]! + n[1]! * 0.01;
      const oz = c[2]! + n[2]! * 0.01;

      for (let t = 0; t < triCount; t++) {
        if (t === triIdx) continue;
        const hit = rayTriangleIntersect(
          ox, oy, oz,
          eyeDirX, eyeDirY, eyeDirZ,
          triVerts[t]!,
        );
        if (hit > 0) {
          triVisible[triIdx] = 0;
          return false;
        }
      }

      triVisible[triIdx] = 1;
      return true;
    }

    // ── Cull stroke vertices ─────────────────────────────────────
    const srcPos = strokes.positions;
    const srcNormals = strokes.normals;
    const srcOffsets = strokes.stripOffsets!;
    const outPaths: number[][] = [];
    const outNormals: number[][] | null = srcNormals ? [] : null;

    for (let s = 0; s < srcOffsets.length; s++) {
      const start = srcOffsets[s]!;
      const end = s < srcOffsets.length - 1 ? srcOffsets[s + 1]! : strokes.vertexCount;

      let currentStrip: number[] = [];
      let currentNormals: number[] = [];

      for (let i = start; i < end; i++) {
        const px = srcPos[i * 3]! as number;
        const py = srcPos[i * 3 + 1]! as number;
        const pz = srcPos[i * 3 + 2]! as number;

        const triIdx = findTriangle(px, pz);
        const visible = triIdx >= 0 && isTriangleVisible(triIdx);

        if (visible) {
          currentStrip.push(px, py, pz);
          if (srcNormals) {
            currentNormals.push(
              srcNormals[i * 3]! as number,
              srcNormals[i * 3 + 1]! as number,
              srcNormals[i * 3 + 2]! as number,
            );
          }
        } else {
          // Break the strip at this vertex
          if (currentStrip.length >= 6) { // at least 2 vertices (2 * 3 floats)
            outPaths.push(currentStrip);
            if (outNormals) outNormals.push(currentNormals);
          }
          currentStrip = [];
          currentNormals = [];
        }
      }
      if (currentStrip.length >= 6) {
        outPaths.push(currentStrip);
        if (outNormals) outNormals.push(currentNormals);
      }
    }

    // ── Pack into Geometry<3> ────────────────────────────────────
    let totalVerts = 0;
    for (const p of outPaths) totalVerts += p.length / 3;

    const positions = new Float32Array(totalVerts * 3);
    const normals = srcNormals ? new Float32Array(totalVerts * 3) : undefined;
    const stripOffsets = new Uint32Array(outPaths.length);
    let offset = 0;

    for (let i = 0; i < outPaths.length; i++) {
      stripOffsets[i] = offset;
      const strip = outPaths[i]!;
      const vertCount = strip.length / 3;
      for (let j = 0; j < strip.length; j++) {
        positions[offset * 3 + j] = strip[j]!;
      }
      if (normals && outNormals) {
        const ns = outNormals[i]!;
        for (let j = 0; j < ns.length; j++) {
          normals[offset * 3 + j] = ns[j]!;
        }
      }
      offset += vertCount;
    }

    return {
      geometry: {
        positions,
        vertexCount: totalVerts,
        dim: 3 as const,
        topology: "line-strip" as const,
        stripOffsets,
        normals,
      },
    };
  },
};
