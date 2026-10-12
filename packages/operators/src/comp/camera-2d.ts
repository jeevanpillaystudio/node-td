import { defineOperator } from "@node-td/kernel";

/**
 * Camera 2D — produces a Camera2D currency from viewport dimensions.
 *
 * The camera looks at the world point (width/2 + centerX, height/2 + centerY),
 * which lands at the middle of the canvas: Center X/Y pan the view, and
 * zoom and rotation turn it about that point. At centerX = centerY = 0 the
 * view is the canvas as it is.
 */
export const camera2d = defineOperator({
  id: "camera-2d",
  category: "comp",
  label: "Camera 2D",
  inputs: [
    { name: "width", type: "number" },
    { name: "height", type: "number" },
  ],
  outputs: [{ name: "camera", type: "camera2d" }],
  params: [
    { key: "centerX", label: "Center X", min: -2000, max: 2000, step: 1, default: 0 },
    { key: "centerY", label: "Center Y", min: -2000, max: 2000, step: 1, default: 0 },
    { key: "zoom", label: "Zoom", min: 0.1, max: 10, step: 0.1, default: 1 },
    { key: "rotation", label: "Rotation (rad)", min: -Math.PI, max: Math.PI, step: 0.01, default: 0 },
  ],
  evaluate({ width, height }, params) {
    return {
      camera: {
        center: [params.centerX + width / 2, params.centerY + height / 2],
        zoom: params.zoom,
        rotation: params.rotation,
        viewport: [width, height],
      },
    };
  },
});
