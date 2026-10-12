import type { CanvasHandle } from "./kernel/types";

/**
 * The kernel types canvases as opaque CanvasHandles so it compiles
 * without DOM types. Every handle the host's createCanvas makes is an
 * OffscreenCanvas (RecordingCanvas stands in for one in tests); this is
 * the one place that says so, for the code that draws into a handle.
 */
export function asOffscreen(handle: CanvasHandle): OffscreenCanvas {
  return handle as OffscreenCanvas;
}
