import { defineOperator, type Camera3D } from "@node-td/kernel";

// ─── Vector math (inline, zero dependencies) ────────────────────

function sub3(a: number[], b: number[]): [number, number, number] {
  return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
}

function cross3(a: number[], b: number[]): [number, number, number] {
  return [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
}

function dot3(a: number[], b: number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

function normalize3(v: number[]): [number, number, number] {
  const len = Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!);
  if (len < 1e-10) return [0, 0, 0];
  return [v[0]! / len, v[1]! / len, v[2]! / len];
}

// ─── Matrix math (column-major 4×4) ─────────────────────────────

/**
 * lookAt view matrix — positions and orients the camera.
 *
 * Column-major layout: m[col * 4 + row]
 * Follows the OpenGL convention: camera looks down -Z.
 */
function lookAt(
  eye: number[],
  target: number[],
  up: number[],
): Float64Array {
  const f = normalize3(sub3(target, eye)); // forward
  const r = normalize3(cross3(f, up));      // right
  const u = cross3(r, f);                   // true up

  // Column-major 4×4
  const m = new Float64Array(16);
  // col 0
  m[0] = r[0]; m[1] = u[0]; m[2] = -f[0]; m[3] = 0;
  // col 1
  m[4] = r[1]; m[5] = u[1]; m[6] = -f[1]; m[7] = 0;
  // col 2
  m[8] = r[2]; m[9] = u[2]; m[10] = -f[2]; m[11] = 0;
  // col 3
  m[12] = -dot3(r, eye);
  m[13] = -dot3(u, eye);
  m[14] = dot3(f, eye);
  m[15] = 1;

  return m;
}

/**
 * Orthographic projection matrix.
 * Maps the box [left,right] × [bottom,top] × [near,far] to NDC [-1,1]³.
 */
function ortho(
  left: number, right: number,
  bottom: number, top: number,
  near: number, far: number,
): Float64Array {
  const m = new Float64Array(16);
  const rl = right - left;
  const tb = top - bottom;
  const fn = far - near;

  m[0] = 2 / rl;
  m[5] = 2 / tb;
  m[10] = -2 / fn;
  m[12] = -(right + left) / rl;
  m[13] = -(top + bottom) / tb;
  m[14] = -(far + near) / fn;
  m[15] = 1;

  return m;
}

/**
 * Perspective projection matrix.
 * fovY in radians, aspect = width/height.
 */
function perspective(
  fovY: number, aspect: number,
  near: number, far: number,
): Float64Array {
  const m = new Float64Array(16);
  const f = 1 / Math.tan(fovY / 2);
  const nf = near - far;

  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / nf;
  m[11] = -1;
  m[14] = (2 * far * near) / nf;

  return m;
}

/** Invert a column-major 4×4 matrix. Returns null if singular. */
function inv4(m: Float64Array): Float64Array | null {
  const [
    a00, a01, a02, a03,
    a10, a11, a12, a13,
    a20, a21, a22, a23,
    a30, a31, a32, a33,
  ] = m;

  const b00 = a00! * a11! - a01! * a10!;
  const b01 = a00! * a12! - a02! * a10!;
  const b02 = a00! * a13! - a03! * a10!;
  const b03 = a01! * a12! - a02! * a11!;
  const b04 = a01! * a13! - a03! * a11!;
  const b05 = a02! * a13! - a03! * a12!;
  const b06 = a20! * a31! - a21! * a30!;
  const b07 = a20! * a32! - a22! * a30!;
  const b08 = a20! * a33! - a23! * a30!;
  const b09 = a21! * a32! - a22! * a31!;
  const b10 = a21! * a33! - a23! * a31!;
  const b11 = a22! * a33! - a23! * a32!;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-15) return null;
  det = 1.0 / det;

  const out = new Float64Array(16);
  out[0]  = (a11! * b11 - a12! * b10 + a13! * b09) * det;
  out[1]  = (a02! * b10 - a01! * b11 - a03! * b09) * det;
  out[2]  = (a31! * b05 - a32! * b04 + a33! * b03) * det;
  out[3]  = (a22! * b04 - a21! * b05 - a23! * b03) * det;
  out[4]  = (a12! * b08 - a10! * b11 - a13! * b07) * det;
  out[5]  = (a00! * b11 - a02! * b08 + a03! * b07) * det;
  out[6]  = (a32! * b02 - a30! * b05 - a33! * b01) * det;
  out[7]  = (a20! * b05 - a22! * b02 + a23! * b01) * det;
  out[8]  = (a10! * b10 - a11! * b08 + a13! * b06) * det;
  out[9]  = (a01! * b08 - a00! * b10 - a03! * b06) * det;
  out[10] = (a30! * b04 - a31! * b02 + a33! * b00) * det;
  out[11] = (a21! * b02 - a20! * b04 - a23! * b00) * det;
  out[12] = (a11! * b07 - a10! * b09 - a12! * b06) * det;
  out[13] = (a00! * b09 - a01! * b07 + a02! * b06) * det;
  out[14] = (a31! * b01 - a30! * b03 - a32! * b00) * det;
  out[15] = (a20! * b03 - a21! * b01 + a22! * b00) * det;
  return out;
}

/** Transform a homogeneous point [x,y,z,1] by a column-major 4×4 matrix */
function transformPoint4(m: Float64Array, x: number, y: number, z: number): [number, number, number] {
  const ox = m[0]! * x + m[4]! * y + m[8]!  * z + m[12]!;
  const oy = m[1]! * x + m[5]! * y + m[9]!  * z + m[13]!;
  const oz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  const ow = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  const invW = ow !== 0 ? 1 / ow : 1;
  return [ox * invW, oy * invW, oz * invW];
}

/** Multiply two column-major 4×4 matrices: result = a × b */
function mul4(a: Float64Array, b: Float64Array): Float64Array {
  const r = new Float64Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      r[col * 4 + row] =
        a[row]!     * b[col * 4]! +
        a[4 + row]! * b[col * 4 + 1]! +
        a[8 + row]! * b[col * 4 + 2]! +
        a[12 + row]! * b[col * 4 + 3]!;
    }
  }
  return r;
}

// ─── Operator ────────────────────────────────────────────────────

/**
 * Camera 3D — virtual camera with lookAt view matrix and
 * orthographic or perspective projection.
 *
 * Outputs a Camera3D with a `project()` closure that converts
 * 3D world-space points to 2D screen-space coordinates.
 *
 * The isometric preset (orthographic with elevated 45° angle)
 * creates the parallel-projection 2.5D tiles aesthetic
 * used by subscapes.
 */
export const camera3d = defineOperator({
  id: "camera-3d",
  category: "comp",
  label: "Camera 3D",
  inputs: [
    { name: "width", type: "number" },
    { name: "height", type: "number" },
    { name: "sceneSize", type: "number", optional: true },
  ],
  outputs: [{ name: "camera3d", type: "camera3d" }],
  params: [
    {
      key: "projection",
      label: "Projection",
      kind: "enum",
      options: [
        { label: "Orthographic", value: 0 },
        { label: "Perspective", value: 1 },
      ],
      default: 0,
    },
    // Eye offset from scene center (relative to sceneSize; 1.0 = sceneSize)
    { key: "eyeX", label: "Eye X", min: -5, max: 5, step: 0.1, default: 0.75 },
    { key: "eyeY", label: "Eye Y", min: -5, max: 5, step: 0.1, default: 1.0 },
    { key: "eyeZ", label: "Eye Z", min: -5, max: 5, step: 0.1, default: -0.75 },
    // Target offset from scene center (relative to sceneSize)
    { key: "targetX", label: "Target X", min: -5, max: 5, step: 0.1, default: 0 },
    { key: "targetY", label: "Target Y", min: -5, max: 5, step: 0.1, default: 0 },
    { key: "targetZ", label: "Target Z", min: -5, max: 5, step: 0.1, default: 0 },
    // Ortho zoom (relative to sceneSize; 1.0 = scene fills viewport height)
    { key: "orthoSize", label: "Ortho Size", min: 0.1, max: 10, step: 0.1, default: 1.25 },
    // Perspective FOV
    { key: "fov", label: "FOV (deg)", min: 10, max: 120, step: 1, default: 60 },
    // Clip planes
    { key: "near", label: "Near", min: 0.1, max: 100, step: 0.1, default: 0.1 },
    { key: "far", label: "Far", min: 100, max: 10000, step: 100, default: 5000 },
  ],
  evaluate({ width, height, sceneSize }, params) {
    const projMode = Math.round(params.projection);
    const near = params.near;
    const far = params.far;

    // Scene center: if sceneSize is provided, terrain is a square of that size
    // centered at (sceneSize/2, 0, sceneSize/2). Otherwise use viewport dims.
    const ss = sceneSize ?? Math.min(width, height);
    const cx = ss / 2;
    const cz = ss / 2;

    // Eye and target offsets are relative to sceneSize — this ensures
    // the camera framing scales with the scene (TouchDesigner convention).
    // An eyeX of 1.0 means "1× sceneSize from center".
    const eye = [
      cx + params.eyeX * ss,
      params.eyeY * ss,
      cz + params.eyeZ * ss,
    ];
    const target = [
      cx + params.targetX * ss,
      params.targetY * ss,
      cz + params.targetZ * ss,
    ];

    // View matrix
    const view = lookAt(eye, target, [0, 1, 0]);

    // Projection matrix
    let proj: Float64Array;
    if (projMode === 0) {
      // Orthographic — orthoSize is relative to sceneSize.
      // A value of 1.61 means the visible extent is 1.61× sceneSize.
      const size = params.orthoSize * ss;
      const aspect = width / height;
      const halfW = size * aspect * 0.5;
      const halfH = size * 0.5;
      proj = ortho(-halfW, halfW, -halfH, halfH, near, far);
    } else {
      // Perspective
      const fovRad = (params.fov * Math.PI) / 180;
      proj = perspective(fovRad, width / height, near, far);
    }

    // Combined view-projection matrix
    const vp = mul4(proj, view);
    const invVP = inv4(vp);

    // Build the project() closure
    const project = (point: [number, number, number]): [number, number, number] => {
      const [x, y, z] = point;

      // Homogeneous multiply: [x,y,z,1] × viewProjection
      const clipX = vp[0]! * x + vp[4]! * y + vp[8]!  * z + vp[12]!;
      const clipY = vp[1]! * x + vp[5]! * y + vp[9]!  * z + vp[13]!;
      const clipZ = vp[2]! * x + vp[6]! * y + vp[10]! * z + vp[14]!;
      const clipW = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;

      // Perspective divide (for ortho, clipW = 1)
      const invW = clipW !== 0 ? 1 / clipW : 0;
      const ndcX = clipX * invW;
      const ndcY = clipY * invW;
      const ndcZ = clipZ * invW;

      // Viewport mapping: NDC [-1,1] → screen [0, width/height]
      const screenX = (ndcX + 1) * 0.5 * width;
      const screenY = (1 - ndcY) * 0.5 * height; // flip Y (screen Y is down)

      return [screenX, screenY, ndcZ];
    };

    // Build the unproject() closure — screen pixel → world-space ray
    const unproject = (screenX: number, screenY: number): {
      origin: [number, number, number];
      dir: [number, number, number];
    } => {
      if (!invVP) return { origin: [0, 0, 0], dir: [0, 0, 1] };

      // Screen → NDC (Y is flipped: screen Y-down, NDC Y-up)
      const ndcX = (screenX / width) * 2 - 1;
      const ndcY = 1 - (screenY / height) * 2;

      // Unproject near (ndcZ=-1) and far (ndcZ=1) to get ray
      const pNear = transformPoint4(invVP, ndcX, ndcY, -1);
      const pFar  = transformPoint4(invVP, ndcX, ndcY,  1);

      const dx = pFar[0] - pNear[0];
      const dy = pFar[1] - pNear[1];
      const dz = pFar[2] - pNear[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const invLen = len > 1e-10 ? 1 / len : 1;

      return {
        origin: pNear,
        dir: [dx * invLen, dy * invLen, dz * invLen],
      };
    };

    return {
      camera3d: { project, unproject, viewport: [width, height] },
    };
  },
});
