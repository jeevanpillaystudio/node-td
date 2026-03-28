import type { Operator, Camera3D } from "../../kernel/types";

type Inputs = { width: number; height: number; sceneSize?: number };
type Outputs = { camera3d: Camera3D };

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
export const camera3d: Operator<Inputs, Outputs> = {
  id: "camera-3d",
  category: "rop",
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
    // Eye offset from scene center (width/2, 0, height/2)
    { key: "eyeX", label: "Eye X", min: -2000, max: 2000, step: 10, default: 300 },
    { key: "eyeY", label: "Eye Y", min: -2000, max: 2000, step: 10, default: 400 },
    { key: "eyeZ", label: "Eye Z", min: -2000, max: 2000, step: 10, default: -300 },
    // Target offset from scene center
    { key: "targetX", label: "Target X", min: -2000, max: 2000, step: 10, default: 0 },
    { key: "targetY", label: "Target Y", min: -2000, max: 2000, step: 10, default: 0 },
    { key: "targetZ", label: "Target Z", min: -2000, max: 2000, step: 10, default: 0 },
    // Ortho zoom (smaller = wider view)
    { key: "orthoSize", label: "Ortho Size", min: 50, max: 2000, step: 10, default: 500 },
    // Perspective FOV
    { key: "fov", label: "FOV (deg)", min: 10, max: 120, step: 1, default: 60 },
    // Clip planes
    { key: "near", label: "Near", min: 0.1, max: 100, step: 0.1, default: 0.1 },
    { key: "far", label: "Far", min: 100, max: 10000, step: 100, default: 5000 },
  ],
  evaluate({ width, height, sceneSize }, params) {
    const projMode = Math.round(params.projection ?? 0);
    const near = params.near ?? 0.1;
    const far = params.far ?? 5000;

    // Scene center: if sceneSize is provided, terrain is a square of that size
    // centered at (sceneSize/2, 0, sceneSize/2). Otherwise use viewport dims.
    const ss = sceneSize ?? Math.min(width, height);
    const cx = ss / 2;
    const cz = ss / 2;

    // Eye and target are offsets from scene center
    const eye = [
      cx + (params.eyeX ?? 300),
      params.eyeY ?? 400,
      cz + (params.eyeZ ?? -300),
    ];
    const target = [
      cx + (params.targetX ?? 0),
      params.targetY ?? 0,
      cz + (params.targetZ ?? 0),
    ];

    // View matrix
    const view = lookAt(eye, target, [0, 1, 0]);

    // Projection matrix
    let proj: Float64Array;
    if (projMode === 0) {
      // Orthographic — orthoSize controls the visible world-space extent
      const size = params.orthoSize ?? 500;
      const aspect = width / height;
      const halfW = size * aspect * 0.5;
      const halfH = size * 0.5;
      proj = ortho(-halfW, halfW, -halfH, halfH, near, far);
    } else {
      // Perspective
      const fovRad = ((params.fov ?? 60) * Math.PI) / 180;
      proj = perspective(fovRad, width / height, near, far);
    }

    // Combined view-projection matrix
    const vp = mul4(proj, view);

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

    return {
      camera3d: { project, viewport: [width, height] },
    };
  },
};
