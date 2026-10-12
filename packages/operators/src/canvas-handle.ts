import type { CanvasHandle } from "@node-td/kernel";

/**
 * The kernel types canvases as opaque CanvasHandles so it compiles
 * without DOM types. Every handle the host's createCanvas makes is an
 * OffscreenCanvas (RecordingCanvas stands in for one in tests); this is
 * the one place in the operators that says so, for the ones that draw
 * into a handle. render-web keeps its own copy: neither package may
 * import the other.
 */
export function asOffscreen(handle: CanvasHandle): OffscreenCanvas {
  return handle as OffscreenCanvas;
}
