import type { Operator, Field2D } from "../../../kernel/types";

type Inputs = { field: Field2D };
type Outputs = { field: Field2D };

/**
 * Curl Noise — produces a divergence-free flow field from a scalar
 * Field2D by rotating its gradient 90 degrees.
 *
 * In 2D, the curl of scalar field f is:
 *   curl_x =  df/dy
 *   curl_y = -df/dx
 *
 * The output is a Field2D where the value at (x,y) is the angle
 * of the curl vector, normalized to 0..1 (compatible with
 * grid-sampler's 0..2pi mapping).
 *
 * This produces organic, contour-following flow: strokes naturally
 * orbit ridges and valleys of the input terrain. This is the key
 * technique that gives subscapes its topographic aesthetic.
 */
export const curlNoise: Operator<Inputs, Outputs> = {
  id: "curl-noise",
  category: "top",
  label: "Curl Noise",
  inputs: [{ name: "field", type: "field" }],
  outputs: [{ name: "field", type: "field" }],
  params: [
    { key: "epsilon", label: "Epsilon", min: 0.01, max: 10, step: 0.01, default: 1.0 },
    { key: "scale", label: "Scale", min: 0.1, max: 5.0, step: 0.1, default: 1.0 },
  ],
  evaluate({ field: input }, params) {
    const eps = params.epsilon ?? 1.0;
    const scale = params.scale ?? 1.0;

    const field: Field2D = (x, y) => {
      const sx = x * scale;
      const sy = y * scale;

      // Central differences for gradient
      const dfdx = (input(sx + eps, sy) - input(sx - eps, sy)) / (2 * eps);
      const dfdy = (input(sx, sy + eps) - input(sx, sy - eps)) / (2 * eps);

      // Curl: rotate gradient 90 degrees
      // curl_x = dfdy, curl_y = -dfdx
      const angle = Math.atan2(-dfdx, dfdy);

      // Normalize from [-pi, pi] to [0, 1]
      return (angle + Math.PI) / (2 * Math.PI);
    };

    return { field };
  },
};
