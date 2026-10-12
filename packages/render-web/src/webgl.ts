import type { Buffer2D } from "@node-td/kernel";
import type { CompiledField } from "@node-td/kernel/field";

// ─── WebGL Field Renderer ────────────────────────────────────────
//
// Renders a compiled FieldExpr to a Buffer2D via WebGL2.
// The field is evaluated per-pixel by a fragment shader on a
// fullscreen quad. Result is read back as Float32Array.
//
// This is the GPU backend for field evaluation — the counterpart
// to the CPU evalExpr() interpreter.
//
// Performance notes:
// - GL context is created externally and reused across cooks
// - Shader programs are cached by fragment source string
// - Uniform values are set per-draw without recompilation
// - FBO for float readback is cached per context+size

// ─── Fullscreen quad geometry ────────────────────────────────────

const QUAD_VERTS = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
   1,  1,
]);

// ─── Shader compilation ─────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown error";
    gl.deleteShader(shader);
    throw new Error(`Shader compile error:\n${log}\n\nSource:\n${source}`);
  }

  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vertShader: WebGLShader,
  fragShader: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");

  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown error";
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }

  return program;
}

// ─── Resource cache ──────────────────────────────────────────────
//
// Avoids recompiling shaders when the same CompiledField is rendered
// multiple times. With uniforms, the fragment source is stable across
// parameter changes — only uniform values change.

interface CachedProgram {
  program: WebGLProgram;
  uResolution: WebGLUniformLocation | null;
  vao: WebGLVertexArrayObject;
  sourceKey: string;
  /** Cached uniform locations — looked up once per program */
  uniformLocs: Map<string, WebGLUniformLocation | null>;
}

const programCache = new WeakMap<WebGL2RenderingContext, Map<string, CachedProgram>>();

function getOrCreateProgram(
  gl: WebGL2RenderingContext,
  compiled: CompiledField,
): CachedProgram {
  let cache = programCache.get(gl);
  if (!cache) {
    cache = new Map();
    programCache.set(gl, cache);
  }

  const key = compiled.fragmentSource;
  const existing = cache.get(key);
  if (existing) return existing;

  const vertShader = compileShader(gl, gl.VERTEX_SHADER, compiled.vertexSource);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, compiled.fragmentSource);
  const program = linkProgram(gl, vertShader, fragShader);

  // Shaders can be deleted after linking
  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);

  // Set up VAO with fullscreen quad
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  const cached: CachedProgram = {
    program,
    uResolution: gl.getUniformLocation(program, "uResolution"),
    vao,
    sourceKey: key,
    uniformLocs: new Map(),
  };

  cache.set(key, cached);
  return cached;
}

// ─── Uniform helpers ─────────────────────────────────────────────

function setUniforms(
  gl: WebGL2RenderingContext,
  cached: CachedProgram,
  uniforms: CompiledField["uniforms"],
): void {
  for (const { glslName, value } of uniforms) {
    let loc = cached.uniformLocs.get(glslName);
    if (loc === undefined) {
      loc = gl.getUniformLocation(cached.program, glslName);
      cached.uniformLocs.set(glslName, loc);
    }
    if (loc !== null) gl.uniform1f(loc, value);
  }
}

// ─── FBO cache for HQ float readback ────────────────────────────

interface CachedFBO {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  width: number;
  height: number;
}

const fboCache = new WeakMap<WebGL2RenderingContext, CachedFBO>();

function getOrCreateFBO(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): CachedFBO {
  const existing = fboCache.get(gl);
  if (existing && existing.width === width && existing.height === height) {
    return existing;
  }

  // Clean up old FBO
  if (existing) {
    gl.deleteFramebuffer(existing.fbo);
    gl.deleteTexture(existing.tex);
  }

  const fbo = gl.createFramebuffer()!;
  const tex = gl.createTexture()!;

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  const cached: CachedFBO = { fbo, tex, width, height };
  fboCache.set(gl, cached);
  return cached;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Create a WebGL2 context from an OffscreenCanvas.
 * Returns null if WebGL2 is not available.
 */
export function createWebGL2(canvas: OffscreenCanvas): WebGL2RenderingContext | null {
  return canvas.getContext("webgl2", {
    antialias: false,
    depth: false,
    stencil: false,
    alpha: false,
    preserveDrawingBuffer: true, // Needed for readPixels
  }) as WebGL2RenderingContext | null;
}

/**
 * Render a compiled field to a Buffer2D via WebGL2.
 *
 * The field is evaluated at every pixel of the output buffer.
 * Coordinates match Canvas2D convention: (0,0) at top-left,
 * x increases right, y increases down.
 */
export function renderFieldToBuffer(
  gl: WebGL2RenderingContext,
  compiled: CompiledField,
  width: number,
  height: number,
): Buffer2D {
  const cached = getOrCreateProgram(gl, compiled);

  // Set viewport
  gl.viewport(0, 0, width, height);
  gl.useProgram(cached.program);

  // Set resolution uniform
  if (cached.uResolution) {
    gl.uniform2f(cached.uResolution, width, height);
  }

  // Set field uniforms (param values)
  setUniforms(gl, cached, compiled.uniforms);

  // Draw fullscreen quad
  gl.bindVertexArray(cached.vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);

  // Read back pixels
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Convert to Float32Array (0..1 range), single channel (grayscale)
  // WebGL readback is bottom-up; we flip Y during conversion
  const data = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    const srcRow = height - 1 - row; // Flip Y
    for (let col = 0; col < width; col++) {
      const srcIdx = (srcRow * width + col) * 4;
      // Use red channel (field value is written to all RGB channels equally)
      data[row * width + col] = pixels[srcIdx]! / 255;
    }
  }

  return { data, width, height, channels: 1 };
}

/**
 * Render a compiled field to a high-precision Float32 Buffer2D.
 *
 * Uses a float render target for 32-bit precision per channel,
 * avoiding the 8-bit quantization of the standard path.
 * Falls back to 8-bit if EXT_color_buffer_float is unavailable.
 */
export function renderFieldToBufferHQ(
  gl: WebGL2RenderingContext,
  compiled: CompiledField,
  width: number,
  height: number,
): Buffer2D {
  // Check for float render target support
  const ext = gl.getExtension("EXT_color_buffer_float");
  if (!ext) {
    return renderFieldToBuffer(gl, compiled, width, height);
  }

  const cached = getOrCreateProgram(gl, compiled);

  // Get or create cached FBO
  const fbo = getOrCreateFBO(gl, width, height);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);

  // Render
  gl.viewport(0, 0, width, height);
  gl.useProgram(cached.program);
  if (cached.uResolution) {
    gl.uniform2f(cached.uResolution, width, height);
  }

  // Set field uniforms (param values)
  setUniforms(gl, cached, compiled.uniforms);

  gl.bindVertexArray(cached.vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);

  // Read back float pixels
  const pixels = new Float32Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // Extract single channel, flip Y
  const data = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    const srcRow = height - 1 - row;
    for (let col = 0; col < width; col++) {
      data[row * width + col] = pixels[(srcRow * width + col) * 4]!;
    }
  }

  return { data, width, height, channels: 1 };
}
