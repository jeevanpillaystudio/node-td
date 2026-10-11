import type { Buffer2D, Camera2D, Camera3D, Geometry, Palette } from "../../src/index";

/**
 * Digests — compact, snapshot-friendly fingerprints of each data currency.
 *
 * Every number is quantised with Math.round(v * 1e3) before it is hashed
 * or reported, so a digest pins output to 1e-3 and ignores last-bit noise
 * below that. Hashes are FNV-1a 32 over the quantised values, each mixed
 * as a little-endian 64-bit integer, printed as 8 hex digits.
 */

// ─── Hashing and rounding ────────────────────────────────────────

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const TWO_32 = 4294967296;

function mixWord(h: number, w: number): number {
  h = Math.imul(h ^ (w & 0xff), FNV_PRIME);
  h = Math.imul(h ^ ((w >>> 8) & 0xff), FNV_PRIME);
  h = Math.imul(h ^ ((w >>> 16) & 0xff), FNV_PRIME);
  return Math.imul(h ^ (w >>> 24), FNV_PRIME);
}

function mixNumber(h: number, v: number): number {
  const q = Math.round(v * 1e3);
  if (Number.isNaN(q)) return mixWord(mixWord(h, 0), 0x7ff80000);
  if (q === Infinity) return mixWord(mixWord(h, 0), 0x7ff00000);
  if (q === -Infinity) return mixWord(mixWord(h, 0), 0xfff00000);
  return mixWord(mixWord(h, q >>> 0), Math.floor(q / TWO_32) >>> 0);
}

function hex(h: number): string {
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** FNV-1a 32 over Math.round(v * 1e3) of every value. */
export function hashValues(values: ArrayLike<number>): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < values.length; i++) h = mixNumber(h, values[i] as number);
  return hex(h);
}

/** FNV-1a 32 over the UTF-8 bytes of a string. */
export function hashString(s: string): string {
  let h = FNV_OFFSET;
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, FNV_PRIME);
  return hex(h);
}

/** Round to 1e-3, normalising -0 to 0. */
export function round3(v: number): number {
  const r = Math.round(v * 1e3) / 1e3;
  return r === 0 ? 0 : r;
}

export interface Stats {
  min: number | null;
  max: number | null;
  mean: number | null;
}

/** min / max / mean of `values[offset], values[offset + stride], …`, rounded to 1e-3. */
export function stats(values: ArrayLike<number>, offset = 0, stride = 1): Stats {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (let i = offset; i < values.length; i += stride) {
    const v = values[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    n++;
  }
  if (n === 0) return { min: null, max: null, mean: null };
  return { min: round3(min), max: round3(max), mean: round3(sum / n) };
}

// ─── Digest shapes ───────────────────────────────────────────────

export interface FieldDigest {
  kind: "field";
  min: number | null;
  max: number | null;
  mean: number | null;
  hash: string;
}

export interface BufferDigest {
  kind: "buffer";
  width: number;
  height: number;
  channels: number;
  stats: Stats;
  hash: string;
}

export interface GeometryDigest {
  kind: "geometry";
  dim: number;
  topology: string;
  vertexCount: number;
  stripOffsets: string | null;
  indices: string | null;
  /** One Stats per axis (x, y[, z]) */
  positions: { stats: Stats[]; hash: string };
  normals: string | null;
  /** Attribute name → hash, sorted by name */
  attributes: Record<string, string> | null;
}

export interface PaletteDigest {
  kind: "palette";
  count: number;
  colors: string;
}

export interface Camera2DDigest {
  kind: "camera2d";
  center: [number, number];
  zoom: number;
  rotation: number;
  viewport: [number, number];
}

export interface Camera3DDigest {
  kind: "camera3d";
  viewport: [number, number];
  /** Hash of project() over a 3×3×3 lattice spanning [0, L]³, L = min(viewport) */
  project: string;
  /** Hash of unproject() (origin and dir) at the top-left, centre and bottom-right pixels */
  unproject: string;
}

export type Digest =
  | FieldDigest
  | BufferDigest
  | GeometryDigest
  | PaletteDigest
  | Camera2DDigest
  | Camera3DDigest
  | number
  | null;

/** The world extent a Field2D is sampled over (the cook's width and height). */
export interface Extent {
  width: number;
  height: number;
}

// ─── Per-currency digests ────────────────────────────────────────

const FIELD_LATTICE = 17;

function digestField(field: (x: number, y: number) => number, extent: Extent): FieldDigest {
  const values = new Float64Array(FIELD_LATTICE * FIELD_LATTICE);
  for (let j = 0; j < FIELD_LATTICE; j++) {
    const y = (j * extent.height) / (FIELD_LATTICE - 1);
    for (let i = 0; i < FIELD_LATTICE; i++) {
      const x = (i * extent.width) / (FIELD_LATTICE - 1);
      values[j * FIELD_LATTICE + i] = field(x, y);
    }
  }
  return { kind: "field", ...stats(values), hash: hashValues(values) };
}

function digestBuffer(buf: Buffer2D): BufferDigest {
  const data = buf.data;
  return {
    kind: "buffer",
    width: buf.width,
    height: buf.height,
    channels: buf.channels,
    stats: stats(data),
    hash: hashValues(data),
  };
}

function digestGeometry(geo: Geometry<2 | 3>): GeometryDigest {
  const axes: Stats[] = [];
  for (let a = 0; a < geo.dim; a++) axes.push(stats(geo.positions, a, geo.dim));
  let attributes: Record<string, string> | null = null;
  if (geo.attributes) {
    attributes = {};
    for (const name of Object.keys(geo.attributes).sort()) {
      attributes[name] = hashValues(geo.attributes[name] as Float32Array);
    }
  }
  return {
    kind: "geometry",
    dim: geo.dim,
    topology: geo.topology,
    vertexCount: geo.vertexCount,
    stripOffsets: geo.stripOffsets ? hashValues(geo.stripOffsets) : null,
    indices: geo.indices ? hashValues(geo.indices) : null,
    positions: { stats: axes, hash: hashValues(geo.positions) },
    normals: geo.normals ? hashValues(geo.normals) : null,
    attributes,
  };
}

function digestPalette(pal: Palette): PaletteDigest {
  return { kind: "palette", count: pal.count, colors: hashValues(pal.colors) };
}

function digestCamera2D(cam: Camera2D): Camera2DDigest {
  return {
    kind: "camera2d",
    center: [round3(cam.center[0]), round3(cam.center[1])],
    zoom: round3(cam.zoom),
    rotation: round3(cam.rotation),
    viewport: [round3(cam.viewport[0]), round3(cam.viewport[1])],
  };
}

function digestCamera3D(cam: Camera3D): Camera3DDigest {
  const [vw, vh] = cam.viewport;
  const L = Math.min(vw, vh);
  const steps = [0, L / 2, L];
  const projected: number[] = [];
  for (const x of steps) {
    for (const y of steps) {
      for (const z of steps) projected.push(...cam.project([x, y, z]));
    }
  }
  const rays: number[] = [];
  for (const [sx, sy] of [
    [0, 0],
    [vw / 2, vh / 2],
    [vw, vh],
  ] as const) {
    const { origin, dir } = cam.unproject(sx, sy);
    rays.push(...origin, ...dir);
  }
  return {
    kind: "camera3d",
    viewport: [round3(vw), round3(vh)],
    project: hashValues(projected),
    unproject: hashValues(rays),
  };
}

/**
 * Digest one output value. The currency is recognised by shape, so this
 * works on any port. Unknown shapes throw, so a new currency is noticed.
 */
export function digest(value: unknown, extent: Extent): Digest {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return round3(value);
  if (typeof value === "function") {
    return digestField(value as (x: number, y: number) => number, extent);
  }
  if (typeof value === "object") {
    if ("project" in value && "unproject" in value) return digestCamera3D(value as Camera3D);
    if ("center" in value && "zoom" in value) return digestCamera2D(value as Camera2D);
    if ("positions" in value && "topology" in value) {
      return digestGeometry(value as Geometry<2 | 3>);
    }
    if ("colors" in value && "count" in value) return digestPalette(value as Palette);
    if ("data" in value && "channels" in value) return digestBuffer(value as Buffer2D);
  }
  throw new Error(`digest: unrecognised value ${Object.prototype.toString.call(value)}`);
}

/** {hash, length} of a recorded canvas log; each entry is hashed as one JSON line. */
export function digestLog(log: readonly unknown[]): { hash: string; length: number } {
  return { hash: hashString(log.map((e) => JSON.stringify(e)).join("\n")), length: log.length };
}
