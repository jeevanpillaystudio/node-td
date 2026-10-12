import { defineOperator, filterVertices } from "@node-td/kernel";

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
export const visibilityCull = defineOperator({
  id: "visibility-cull",
  category: "sop",
  label: "Visibility Cull",
  inputs: [
    { name: "geometry", type: "geo3" },
    { name: "mesh", type: "geo3" },
    { name: "camera3d", type: "camera3d" },
  ],
  outputs: [{ name: "geometry", type: "geo3" }],
  params: [
    {
      key: "bypass",
      label: "Bypass",
      kind: "enum",
      options: [
        { label: "Off", value: 0 },
        { label: "On", value: 1 },
      ],
      default: 0,
    },
  ],
  evaluate({ geometry: strokes, mesh, camera3d }, params) {
    // Debug bypass: when bypass=1, pass through all strokes without culling
    if (params.bypass >= 1) {
      return { geometry: strokes };
    }

    if (strokes.vertexCount === 0) {
      return { geometry: strokes };
    }

    // Input it cannot cull is an error, not strokes passed through unculled.
    // A line strip without stripOffsets is one strip.
    if (strokes.topology !== "line-strip") {
      throw new Error(`visibility-cull: geometry is ${strokes.topology}, but it culls line strips`);
    }

    if (mesh.topology !== "triangles" || !mesh.indices) {
      throw new Error(
        `visibility-cull: mesh is ${mesh.indices ? "indexed" : "unindexed"} ${mesh.topology}, but it needs indexed triangles, as parametric-surface makes`,
      );
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

      const ax = meshPos[i0]!,
        ay = meshPos[i0 + 1]!,
        az = meshPos[i0 + 2]!;
      const bx = meshPos[i1]!,
        by = meshPos[i1 + 1]!,
        bz = meshPos[i1 + 2]!;
      const cx = meshPos[i2]!,
        cy = meshPos[i2 + 1]!,
        cz = meshPos[i2 + 2]!;

      triVerts[t] = new Float64Array([ax, ay, az, bx, by, bz, cx, cy, cz]);

      // Face normal via cross product of edges.
      // Use e2 x e1 (not e1 x e2) because parametric-surface produces
      // CW winding (TL, TR, BL) which after surface-lift gives downward
      // normals with the standard cross. Swapping gives outward (upward) normals.
      const e1x = bx - ax,
        e1y = by - ay,
        e1z = bz - az;
      const e2x = cx - ax,
        e2y = cy - ay,
        e2z = cz - az;
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

    // ── Direct grid lookup for regular parametric meshes ────────
    // The collision mesh is a regular grid from parametric-surface with
    // uSeg × vSeg quads, each split into 2 triangles. We infer the grid
    // dimensions from the index pattern and map XZ positions directly
    // to the containing quad — O(1) lookup, no spatial hashing needed.
    //
    // This mirrors the original Subscapes algorithm's `st()` function
    // (algorithm.js lines 182-193) which uses a direct grid index.

    // Find mesh bounding box in XZ
    let minX = Infinity,
      maxX = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;
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

    // Infer grid dimensions from the mesh index pattern.
    // parametric-surface creates: triangle 0 = [0, 1, uSeg+1]
    // so meshIdx[2] = uSeg + 1.
    const uSeg = (meshIdx[2] ?? 1) - 1;
    const totalQuads = triCount / 2;
    const vSeg = uSeg > 0 ? Math.round(totalQuads / uSeg) : 1;
    const cellW = rangeX / uSeg;
    const cellH = rangeZ / vSeg;

    // ── Find triangle for a point in XZ — direct grid index ─────
    function findTriangle(px: number, pz: number): number {
      const col = Math.min(uSeg - 1, Math.max(0, Math.floor((px - minX) / cellW)));
      const row = Math.min(vSeg - 1, Math.max(0, Math.floor((pz - minZ) / cellH)));
      const quadIdx = row * uSeg + col;

      // Each quad has 2 triangles. Test both with barycentric coords in XZ.
      const tri0 = quadIdx * 2;
      const tri1 = tri0 + 1;

      for (const t of [tri0, tri1]) {
        if (t >= triCount) continue;
        const v = triVerts[t]!;
        const ax = v[0]!,
          az = v[2]!;
        const bx = v[3]!,
          bz = v[5]!;
        const cx2 = v[6]!,
          cz2 = v[8]!;

        const v0x = cx2 - ax,
          v0z = cz2 - az;
        const v1x = bx - ax,
          v1z = bz - az;
        const v2x = px - ax,
          v2z = pz - az;

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

        if (u >= -1e-6 && v2 >= -1e-6 && u + v2 <= 1 + 1e-6) {
          return t;
        }
      }

      // Fallback: check adjacent quads for edge cases (floating point)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = col + dc,
            nr = row + dr;
          if (nc < 0 || nc >= uSeg || nr < 0 || nr >= vSeg) continue;
          const nq = nr * uSeg + nc;
          for (const t of [nq * 2, nq * 2 + 1]) {
            if (t >= triCount) continue;
            const v = triVerts[t]!;
            const ax = v[0]!,
              az = v[2]!;
            const bx = v[3]!,
              bz = v[5]!;
            const cx2 = v[6]!,
              cz2 = v[8]!;

            const v0x = cx2 - ax,
              v0z = cz2 - az;
            const v1x = bx - ax,
              v1z = bz - az;
            const v2x = px - ax,
              v2z = pz - az;

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

            if (u >= -1e-6 && v2 >= -1e-6 && u + v2 <= 1 + 1e-6) {
              return t;
            }
          }
        }
      }

      return -1;
    }

    // ── Moller-Trumbore ray-triangle intersection ────────────────
    function rayTriangleIntersect(
      ox: number,
      oy: number,
      oz: number,
      dx: number,
      dy: number,
      dz: number,
      v: Float64Array,
    ): number {
      const e1x = v[3]! - v[0]!,
        e1y = v[4]! - v[1]!,
        e1z = v[5]! - v[2]!;
      const e2x = v[6]! - v[0]!,
        e2y = v[7]! - v[1]!,
        e2z = v[8]! - v[2]!;

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

      const tvx = ox - v[0]!,
        tvy = oy - v[1]!,
        tvz = oz - v[2]!;
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
      [1, 1, -1],
      [-1, 1, -1],
      [1, 1, 1],
      [-1, 1, 1],
    ];
    let eyeDirX = 0,
      eyeDirY = 1,
      eyeDirZ = 0;
    let bestDepthDecrease = 0;
    for (const c of candidates) {
      const len = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
      const cx = c[0] / len,
        cy = c[1] / len,
        cz = c[2] / len;
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
        const hit = rayTriangleIntersect(ox, oy, oz, eyeDirX, eyeDirY, eyeDirZ, triVerts[t]!);
        if (hit > 0) {
          triVisible[triIdx] = 0;
          return false;
        }
      }

      triVisible[triIdx] = 1;
      return true;
    }

    // ── Cull stroke vertices ─────────────────────────────────────
    // A culled vertex splits its strip: occluded runs become gaps. The
    // visible vertices keep their normals, colours and attributes.
    const srcPos = strokes.positions;
    const geometry = filterVertices(strokes, (i) => {
      const triIdx = findTriangle(srcPos[i * 3]!, srcPos[i * 3 + 2]!);
      return triIdx >= 0 && isTriangleVisible(triIdx);
    });

    return { geometry };
  },
});
