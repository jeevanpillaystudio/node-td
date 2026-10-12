import type { Geometry } from "./types";

/** Create a points-topology Geometry from an array of [x, y] tuples */
export function pointsGeometry(points: [number, number][]): Geometry<2> {
  const positions = new Float32Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!;
    positions[i * 2] = pt[0];
    positions[i * 2 + 1] = pt[1];
  }
  return { positions, vertexCount: points.length, dim: 2, topology: "points" };
}

/** Create a line-strip Geometry from an array of polylines */
export function pathsGeometry(paths: [number, number][][]): Geometry<2> {
  let totalVerts = 0;
  for (const p of paths) totalVerts += p.length;

  const positions = new Float32Array(totalVerts * 2);
  const stripOffsets = new Uint32Array(paths.length);
  let offset = 0;

  for (let i = 0; i < paths.length; i++) {
    stripOffsets[i] = offset;
    for (const [x, y] of paths[i]!) {
      positions[offset * 2] = x;
      positions[offset * 2 + 1] = y;
      offset++;
    }
  }

  return {
    positions,
    vertexCount: totalVerts,
    dim: 2,
    topology: "line-strip",
    stripOffsets,
  };
}

/** Extract [x,y] polylines from a line-strip Geometry (for CPU algorithms that need arrays) */
export function geometryToPaths(geo: Geometry<2>): [number, number][][] {
  const p = geo.positions;

  if (geo.topology === "points") {
    const paths: [number, number][][] = [];
    for (let i = 0; i < geo.vertexCount; i++) {
      paths.push([[p[i * 2] as number, p[i * 2 + 1] as number]]);
    }
    return paths;
  }

  if (!geo.stripOffsets) {
    const path: [number, number][] = [];
    for (let i = 0; i < geo.vertexCount; i++) {
      path.push([p[i * 2] as number, p[i * 2 + 1] as number]);
    }
    return [path];
  }

  const paths: [number, number][][] = [];
  const offsets = geo.stripOffsets;
  for (let s = 0; s < offsets.length; s++) {
    const start = offsets[s] as number;
    const end = s < offsets.length - 1 ? (offsets[s + 1] as number) : geo.vertexCount;
    const path: [number, number][] = [];
    for (let i = start; i < end; i++) {
      path.push([p[i * 2] as number, p[i * 2 + 1] as number]);
    }
    paths.push(path);
  }
  return paths;
}

/** Read the position of vertex i from a Geometry */
export function vertexAt<D extends 2 | 3>(
  geo: Geometry<D>,
  i: number,
): D extends 2 ? [number, number] : [number, number, number] {
  const d = geo.dim;
  const base = i * d;
  const px = geo.positions[base] as number;
  const py = geo.positions[base + 1] as number;
  return (d === 2 ? [px, py] : [px, py, geo.positions[base + 2] as number]) as any;
}

/** Create a line-strip Geometry<3> from an array of 3D polylines */
export function pathsGeometry3(paths: [number, number, number][][]): Geometry<3> {
  let totalVerts = 0;
  for (const p of paths) totalVerts += p.length;

  const positions = new Float32Array(totalVerts * 3);
  const stripOffsets = new Uint32Array(paths.length);
  let offset = 0;

  for (let i = 0; i < paths.length; i++) {
    stripOffsets[i] = offset;
    for (const [x, y, z] of paths[i]!) {
      positions[offset * 3] = x;
      positions[offset * 3 + 1] = y;
      positions[offset * 3 + 2] = z;
      offset++;
    }
  }

  return {
    positions,
    vertexCount: totalVerts,
    dim: 3,
    topology: "line-strip",
    stripOffsets,
  };
}

/**
 * The same geometry with new positions, `dim` floats per vertex for the
 * same vertices. Topology, strips, indices, normals, colours and
 * attributes are carried over (shared, not copied: outputs are never
 * mutated). This is how a SOP that moves vertices keeps what it does not
 * touch.
 */
export function withPositions<D extends 2 | 3>(
  geo: Geometry<2 | 3>,
  positions: Float32Array,
  dim: D,
): Geometry<D> {
  const out: Geometry<D> = { positions, vertexCount: geo.vertexCount, dim, topology: geo.topology };
  if (geo.stripOffsets) out.stripOffsets = geo.stripOffsets;
  if (geo.indices) out.indices = geo.indices;
  if (geo.normals) out.normals = geo.normals;
  if (geo.colors) out.colors = geo.colors;
  if (geo.attributes) out.attributes = geo.attributes;
  return out;
}

/**
 * Call fn once per strip of a line-strip geometry, with the strip's first
 * vertex and one past its last. A geometry without stripOffsets is one
 * strip; an empty one has none.
 */
export function forEachStrip(
  geo: Geometry<2 | 3>,
  fn: (start: number, end: number, strip: number) => void,
): void {
  const offsets = geo.stripOffsets;
  if (!offsets) {
    if (geo.vertexCount > 0) fn(0, geo.vertexCount, 0);
    return;
  }
  for (let s = 0; s < offsets.length; s++) {
    const start = offsets[s] as number;
    const end = s < offsets.length - 1 ? (offsets[s + 1] as number) : geo.vertexCount;
    fn(start, end, s);
  }
}

/**
 * The vertices for which keep(i) is true, with their normals, colours and
 * attributes. keep is called once per vertex, in vertex order.
 *
 * line-strip: a strip is split where a vertex is dropped, and a piece of
 *   fewer than two vertices, which draws nothing, is dropped with it.
 * triangles:  a triangle that loses a corner is dropped; indices are
 *   renumbered.
 * points:     each vertex stands alone.
 */
export function filterVertices<D extends 2 | 3>(
  geo: Geometry<D>,
  keep: (i: number) => boolean,
): Geometry<D> {
  const kept = new Uint8Array(geo.vertexCount);
  for (let i = 0; i < geo.vertexCount; i++) kept[i] = keep(i) ? 1 : 0;

  // The source vertex of each output vertex, in output order
  const order: number[] = [];
  let stripOffsets: Uint32Array | undefined;
  let indices: Uint32Array | undefined;

  if (geo.topology === "line-strip") {
    const starts: number[] = [];
    const flush = (run: number[]) => {
      if (run.length < 2) return;
      starts.push(order.length);
      for (const v of run) order.push(v);
    };
    forEachStrip(geo, (start, end) => {
      let run: number[] = [];
      for (let i = start; i < end; i++) {
        if (kept[i]) {
          run.push(i);
        } else {
          flush(run);
          run = [];
        }
      }
      flush(run);
    });
    stripOffsets = new Uint32Array(starts);
  } else if (geo.topology === "triangles") {
    const src = geo.indices;
    const triCount = src ? Math.floor(src.length / 3) : Math.floor(geo.vertexCount / 3);
    const corner = (t: number, c: number) => (src ? (src[t * 3 + c] as number) : t * 3 + c);
    if (src) {
      const remap = new Int32Array(geo.vertexCount).fill(-1);
      for (let i = 0; i < geo.vertexCount; i++) {
        if (kept[i]) {
          remap[i] = order.length;
          order.push(i);
        }
      }
      const out: number[] = [];
      for (let t = 0; t < triCount; t++) {
        const a = corner(t, 0);
        const b = corner(t, 1);
        const c = corner(t, 2);
        if (kept[a] && kept[b] && kept[c]) out.push(remap[a]!, remap[b]!, remap[c]!);
      }
      indices = new Uint32Array(out);
    } else {
      for (let t = 0; t < triCount; t++) {
        if (kept[corner(t, 0)] && kept[corner(t, 1)] && kept[corner(t, 2)]) {
          order.push(corner(t, 0), corner(t, 1), corner(t, 2));
        }
      }
    }
  } else {
    for (let i = 0; i < geo.vertexCount; i++) if (kept[i]) order.push(i);
  }

  const out: Geometry<D> = {
    positions: gather(geo.positions, geo.dim, order),
    vertexCount: order.length,
    dim: geo.dim,
    topology: geo.topology,
  };
  if (stripOffsets) out.stripOffsets = stripOffsets;
  if (indices) out.indices = indices;
  if (geo.normals) out.normals = gather(geo.normals, 3, order);
  if (geo.colors) out.colors = gather(geo.colors, 3, order);
  if (geo.attributes) {
    const attributes: Record<string, Float32Array> = {};
    for (const [name, values] of Object.entries(geo.attributes)) {
      attributes[name] = gather(values, 1, order);
    }
    out.attributes = attributes;
  }
  return out;
}

/** The `width` floats of each listed vertex, in list order. */
function gather(src: Float32Array, width: number, order: number[]): Float32Array {
  const out = new Float32Array(order.length * width);
  for (let k = 0; k < order.length; k++) {
    const base = (order[k] as number) * width;
    for (let c = 0; c < width; c++) out[k * width + c] = src[base + c] as number;
  }
  return out;
}
