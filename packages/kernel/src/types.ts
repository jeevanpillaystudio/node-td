// ─── Operator Categories ─────────────────────────────────────────

/**
 * Operator families, after TouchDesigner's. A family is a label that
 * follows from what the operator outputs on its first port.
 *
 * FIELD — resolution-free scalar functions. TD has no such family; the
 *         nearest is a Noise or GLSL TOP before it is rasterised. SOPs
 *         sample fields point by point.
 * TOP   — rasterised 2D data and images: rasterisers, renderers and
 *         compositing, as TD's Render and Composite TOPs
 * SOP   — geometry
 * CHOP  — palettes, as channel tables of r, g, b, a per sample
 * MAT   — diffuse-shade only: it outputs a palette of per-vertex colours,
 *         until that colour moves onto the geometry
 * COMP  — camera objects, as TD's Camera COMP
 */
export type OperatorCategory = "field" | "top" | "sop" | "chop" | "mat" | "comp";

// ─── Port Types ──────────────────────────────────────────────────

/**
 * Port data type identifiers for wire compatibility.
 *
 * TOP outputs:  field, buffer
 * SOP outputs:  geometry
 * MAT outputs:  palette
 * ROP inputs:   camera (+ geometry, palette, buffer)
 */
export type PortType =
  | "field" //    Field2D — continuous scalar function
  | "buffer" //   Buffer2D — discretized 2D data (angles, heights, colors, rendered frames)
  | "geometry" // Geometry — vertices + topology
  | "palette" //  Palette — color set
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
 * An opaque host canvas. The kernel knows only its size, so it compiles
 * without DOM types; the host's createCanvas makes it (an offscreen canvas
 * in the browser) and the renderers that draw into it cast it back.
 */
export interface CanvasHandle {
  readonly width: number;
  readonly height: number;
}

/**
 * Discretized 2D buffer — the universal TOP data currency.
 * Basis for textures, heightmaps, angle fields, density maps.
 *
 * On CPU: `data` is a Float32Array.
 * Canvas-native path: `_canvas` carries the source canvas,
 * enabling hardware-accelerated composite (drawImage) and blit.
 * When `_canvas` is present, `data` may be a lazy getter that
 * only triggers readback when pixel data is actually needed.
 */
export interface Buffer2D {
  data: Float32Array;
  width: number; //   columns
  height: number; //  rows
  channels: number; // 1 = scalar, 2 = vec2, 3 = rgb, 4 = rgba
  /** Source canvas for GPU-accelerated composite/blit (canvas-native pipeline) */
  _canvas?: CanvasHandle;
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
 * Carries a set of colors for procedural selection.
 */
export interface Palette {
  /** Flat RGBA values: [r,g,b,a, r,g,b,a, …] in 0..1 range */
  colors: Float32Array;
  /** Number of colors */
  count: number;
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

// ─── Environment ─────────────────────────────────────────────────

/**
 * The values a host cooks with. The CookEngine diffs them on every
 * setEnv, so a change re-cooks only the nodes that read the changed key:
 * through a $env wire (width, height), through the operator's envReads,
 * or, for the seed, through the random stream.
 */
export interface EnvValues {
  /** Scene width in CSS pixels */
  width: number;
  /** Scene height in CSS pixels */
  height: number;
  /** Device pixel ratio: rasterisers draw width·dpr × height·dpr pixels */
  dpr: number;
  /** Seed of the random stream the operators draw from */
  seed: number | string;
}

/** The name of one environment value. */
export type EnvKey = keyof EnvValues;

/**
 * What the host lends the operators. Never diffed: a new factory does
 * not re-cook anything.
 */
export interface Capabilities {
  /** Makes a canvas for the renderers to draw into (an OffscreenCanvas in the browser) */
  createCanvas?: (w: number, h: number) => CanvasHandle;
}

/**
 * The random stream as an operator sees it. Every operator draws from
 * the one stream, in topological order; the engine records where the
 * stream stood around each node, so it can skip a clean node without
 * changing what the nodes after it draw.
 */
export interface NodeRng {
  /** A float in [0, 1) */
  random(): number;
}

/** The env an operator's evaluate receives: the env values, the capabilities and the stream. */
export type NodeEnv = EnvValues & Capabilities & { rng: NodeRng };

// ─── Operator Protocol ───────────────────────────────────────────

/**
 * An operator type: pure function with typed I/O and tunable parameters.
 * Its category is the family its outputs put it in (see OperatorCategory).
 *
 * CPU operators implement `evaluate`.
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
  /**
   * The env values evaluate reads from its env argument. A change to one
   * re-cooks the node. Values wired in through $env need not be listed,
   * and neither does env.rng: the engine tracks the random stream itself.
   */
  envReads?: EnvKey[];
  /** CPU evaluation — returns a record keyed by output port name */
  evaluate?: (inputs: TInputs, params: Record<string, number>, env: NodeEnv) => TOutputs;
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
