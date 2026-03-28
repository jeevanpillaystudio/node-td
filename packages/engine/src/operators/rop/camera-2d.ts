import type { Operator, Camera2D } from "../../kernel/types";

type Inputs = { width: number; height: number };
type Outputs = { camera: Camera2D };

/**
 * Camera 2D — produces a Camera2D currency from viewport dimensions.
 *
 * centerX/centerY default to 0, meaning the camera is centered on the canvas.
 * The evaluate function offsets by width/2, height/2 so (0,0) maps to canvas center.
 */
export const camera2d: Operator<Inputs, Outputs> = {
  id: "camera-2d",
  category: "rop",
  label: "Camera 2D",
  inputs: [
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "camera", type: "camera" }],
  params: [
    { key: "centerX", label: "Center X", min: -2000, max: 2000, step: 1, default: 0 },
    { key: "centerY", label: "Center Y", min: -2000, max: 2000, step: 1, default: 0 },
    { key: "zoom", label: "Zoom", min: 0.1, max: 10, step: 0.1, default: 1 },
    { key: "rotation", label: "Rotation (rad)", min: -Math.PI, max: Math.PI, step: 0.01, default: 0 },
  ],
  evaluate({ width, height }, params) {
    return {
      camera: {
        center: [(params.centerX ?? 0) + width / 2, (params.centerY ?? 0) + height / 2],
        zoom: params.zoom ?? 1,
        rotation: params.rotation ?? 0,
        viewport: [width, height],
      },
    };
  },
};
