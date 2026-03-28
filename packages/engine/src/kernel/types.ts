// ─── Operator Categories ─────────────────────────────────────────

/**
 * Operator categories — mirrors TouchDesigner's taxonomy.
 *
 * TOP  — Texture operators (field/buffer)
 * SOP  — Surface operators (geometry)
 * MAT  — Material operators (palette)
 * CHOP — Channel operators (signal, future)
 * ROP  — Render operators (geometry + camera + material → buffer)
 */
export type OperatorCategory = "top" | "sop" | "mat" | "chop" | "rop";

// ─── Port Types ──────────────────────────────────────────────────

/**
 * Port data type identifiers for wire compatibility.
 *
 * TOP outputs:  field, buffer
 * SOP outputs:  geometry
 * MAT outputs:  palette
 * CHOP outputs: signal (future)
 * ROP inputs:   camera (+ geometry, palette, buffer)
 */
export type PortType =
  | "field" //    Field2D — continuous scalar function
  | "buffer" //   Buffer2D — discretized 2D data (angles, heights, colors, rendered frames)
  | "geometry" // Geometry — vertices + topology
  | "palette" //  Palette — color set with weights
  | "signal" //   Signal — time-series (future)
  | "camera" //   Camera2D — viewport + transform
  | "camera3d" // Camera3D — 3D projection (lookAt + ortho/perspective)
  | "number"; //  scalar value (width, height, etc.)

/** Port definition — describes an input or output slot */
export interface PortDef {
  name: string;
  type: PortType;
  /** If true, this input need not be wired */
  optional?: boolean;
  /** If true, multiple wires may connect to this input — evaluate receives an array */
  variadic?: boolean;
}

// ─── Parameter Definitions ──────────────────────────────────────

/** Numeric parameter — slider with min/max/step */
export interface NumericParamDef {
  key: string;
  label: string;
  kind?: "number";
  min: number;
  max: number;
  step: number;
  default: number;
}

/** Enum parameter — dropdown with labeled options */
export interface EnumParamDef {
  key: string;
  label: string;
  kind: "enum";
  options: { label: string; value: number }[];
  default: number;
}

/** Parameter definition — numeric slider or enum dropdown */
export type ParamDef = NumericParamDef | EnumParamDef;

/** Type guard: true when the param is an enum dropdown */
export function isEnumParam(p: ParamDef): p is EnumParamDef {
  return "kind" in p && p.kind === "enum";
}

// ─── Data Currencies ─────────────────────────────────────────────

/** Continuous 2D → scalar function — TOP output for procedural fields */
export type Field2D = (x: number, y: number) => number;

/**
 * Discretized 2D buffer — the universal TOP data currency.
 * Basis for textures, heightmaps, angle fields, density maps.
 *
 * On CPU: `data` is a Float32Array.
 * Future GPU path: a WebGLTexture handle wrapping the same shape.
 */
export interface Buffer2D {
  data: Float32Array;
  width: number; //   columns
  height: number; //  rows
  channels: number; // 1 = scalar, 2 = vec2, 3 = rgb, 4 = rgba
}

/**
 * Geometry — the universal SOP data currency.
 * Parameterized by dimension so 2D paths and 3D meshes
 * share the same protocol.
 */
export interface Geometry<D extends 2 | 3 = 2> {
  /** Flat vertex positions — D floats per vertex */
  positions: Float32Array;
  /** Number of vertices */
  vertexCount: number;
  /** Spatial dimension */
  dim: D;
  /** Drawing topology */
  topology: "points" | "line-strip" | "triangles";
  /**
   * For line-strip: starting vertex index of each strip.
   * Strip i spans from stripOffsets[i] to stripOffsets[i+1] − 1.
   * Last strip runs to vertexCount.
   */
  stripOffsets?: Uint32Array;
  /** Triangle or line indices for indexed drawing */
  indices?: Uint32Array;
  /** Per-vertex normals (3D geometry) */
  normals?: Float32Array;
  /**
   * Arbitrary per-vertex attributes — one Float32Array per named channel.
   * Each array has exactly `vertexCount` elements (1 scalar per vertex).
   *
   * Convention: depth, ao, worldX/Y/Z, normalX/Y/Z, angle, length
   */
  attributes?: Record<string, Float32Array>;
}

/**
 * Color palette — the universal MAT data currency.
 * Carries a set of colors with optional probability weights
 * for procedural selection.
 */
export interface Palette {
  /** Flat RGBA values: [r,g,b,a, r,g,b,a, …] in 0..1 range */
  colors: Float32Array;
  /** Number of colors */
  count: number;
  /** Per-color probability weights (sum to 1) */
  weights?: Float32Array;
}

/** Time-series signal — the CHOP data currency (future) */
export interface Signal {
  samples: Float32Array;
  rate: number;
  channels: number;
}

/**
 * Camera2D — the ROP input currency for 2D viewport transforms.
 *
 * `center` is the world-space point at screen center.
 * `zoom`   scales the scene (>1 zooms in).
 * `rotation` rotates the scene in radians.
 * `viewport` is the output pixel dimensions [width, height].
 */
export interface Camera2D {
  center: [number, number];
  zoom: number;
  rotation: number;
  viewport: [number, number];
}

/**
 * Camera3D — the ROP input currency for 3D → 2D projection.
 *
 * `project` takes a 3D world-space point and returns
 * [screenX, screenY, depth]. depth is in normalized device
 * coordinates (−1 near, +1 far) for future occlusion use.
 *
 * Supports orthographic (isometric) and perspective projection.
 * The project function is a closure over the composed
 * view-projection matrix — no gl-matrix dependency.
 */
export interface Camera3D {
  /** Project [x, y, z] → [screenX, screenY, depth] */
  project: (point: [number, number, number]) => [number, number, number];
  /**
   * Unproject a screen pixel to a world-space ray.
   * Returns the ray origin and normalized direction for sphere-tracing.
   */
  unproject: (screenX: number, screenY: number) => {
    origin: [number, number, number];
    dir: [number, number, number];
  };
  /** Viewport dimensions [width, height] */
  viewport: [number, number];
}

/**
 * Graph evaluation environment — passed through to all evaluate() calls.
 *
 * Carries env values ($env wires: width, height) plus injected
 * capabilities like a canvas factory for ROP operators and a
 * seeded PRNG for deterministic randomness.
 */
export type GraphEnv = Record<string, unknown> & {
  createCanvas?: (w: number, h: number) => OffscreenCanvas;
  /** Seeded PRNG — operators read from this for deterministic output. */
  rng?: { random(): number };
};

// ─── Operator Protocol ───────────────────────────────────────────

/**
 * An operator type: pure function with typed I/O and tunable parameters.
 *
 * Categories:
 *   TOP  → Buffer2D, Field2D   (texture / buffer processing)
 *   SOP  → Geometry             (surface / geometry operations)
 *   MAT  → Palette              (material / color operations)
 *   CHOP → Signal               (channel / signal — future)
 *
 * CPU operators implement `evaluate`.
 * GPU operators (future) declare `shader` source instead.
 */
export interface Operator<TInputs = any, TOutputs = any> {
  /** Unique identifier (used as NodeInstance.type) */
  id: string;
  /** Operator category */
  category: OperatorCategory;
  /** Human-readable label */
  label: string;
  /** Input port definitions */
  inputs: PortDef[];
  /** Output port definitions — multi-output supported */
  outputs: PortDef[];
  /** Tunable parameters */
  params: ParamDef[];
  /** CPU evaluation — returns a record keyed by output port name */
  evaluate?: (inputs: TInputs, params: Record<string, number>, env?: GraphEnv) => TOutputs;
  /** GPU shader source (reserved for future WebGL/WebGPU backend) */
  shader?: { vert?: string; frag: string };
}

/** A placed operator in a graph — references a type by id with optional param overrides */
export interface NodeInstance {
  type: string;
  params?: Record<string, number>;
}

// ─── Geometry Utilities ──────────────────────────────────────────

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
    const end =
      s < offsets.length - 1 ? (offsets[s + 1] as number) : geo.vertexCount;
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
  return (
    d === 2 ? [px, py] : [px, py, geo.positions[base + 2] as number]
  ) as any;
}
