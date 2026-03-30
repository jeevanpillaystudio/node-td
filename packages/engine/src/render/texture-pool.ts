// ─── GPU Texture Pool ───────────────────────────────────────────
//
// Pre-allocated pool of GPU textures with power-of-two size classes.
// Avoids the cost of creating/destroying GL textures + FBOs every cook.
//
// Usage:
//   const pool = new TexturePool(gl);
//   const handle = pool.acquire(800, 600);   // rounds up to 1024×1024
//   // ... render into handle.fbo ...
//   pool.release(handle);                    // returns to pool for reuse
//
// The pool uses LRU eviction when a size class exceeds its capacity.

export interface TextureHandle {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  /** Allocated width (power-of-two, >= requested) */
  allocWidth: number;
  /** Allocated height (power-of-two, >= requested) */
  allocHeight: number;
  /** Requested logical width */
  width: number;
  /** Requested logical height */
  height: number;
}

/** Round up to the next power of two. */
function nextPow2(v: number): number {
  v = Math.max(1, Math.ceil(v));
  v--;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  return v + 1;
}

/** Size class key: "WxH" where W,H are powers of two. */
function sizeKey(w: number, h: number): string {
  return `${w}x${h}`;
}

const MAX_POOL_SIZE_PER_CLASS = 4;

export class TexturePool {
  private readonly gl: WebGL2RenderingContext;
  private readonly pool = new Map<string, TextureHandle[]>();
  private hasFloatExt: boolean | undefined;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /** Acquire a float texture+FBO. Reuses a pooled one if available. */
  acquire(width: number, height: number): TextureHandle {
    const gl = this.gl;

    // Ensure float render target support (check once)
    if (this.hasFloatExt === undefined) {
      this.hasFloatExt = !!gl.getExtension("EXT_color_buffer_float");
    }

    const allocW = nextPow2(width);
    const allocH = nextPow2(height);
    const key = sizeKey(allocW, allocH);

    // Try to reuse from pool
    const bucket = this.pool.get(key);
    if (bucket && bucket.length > 0) {
      const handle = bucket.pop()!;
      handle.width = width;
      handle.height = height;
      return handle;
    }

    // Allocate new texture + FBO
    const internalFormat = this.hasFloatExt ? gl.RGBA32F : gl.RGBA8;
    const type = this.hasFloatExt ? gl.FLOAT : gl.UNSIGNED_BYTE;

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, allocW, allocH, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { texture, fbo, allocWidth: allocW, allocHeight: allocH, width, height };
  }

  /** Return a texture handle to the pool for reuse. */
  release(handle: TextureHandle): void {
    const key = sizeKey(handle.allocWidth, handle.allocHeight);
    let bucket = this.pool.get(key);
    if (!bucket) {
      bucket = [];
      this.pool.set(key, bucket);
    }

    // Evict oldest if over capacity
    if (bucket.length >= MAX_POOL_SIZE_PER_CLASS) {
      const evicted = bucket.shift()!;
      this.gl.deleteTexture(evicted.texture);
      this.gl.deleteFramebuffer(evicted.fbo);
    }

    bucket.push(handle);
  }

  /** Destroy all pooled resources. */
  dispose(): void {
    for (const bucket of this.pool.values()) {
      for (const handle of bucket) {
        this.gl.deleteTexture(handle.texture);
        this.gl.deleteFramebuffer(handle.fbo);
      }
    }
    this.pool.clear();
  }
}
