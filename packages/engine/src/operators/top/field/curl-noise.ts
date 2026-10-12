import type { Operator, Field2D } from "@node-td/kernel";
import {
  createField, getFieldExpr, apply, sub, mul, add, div, c, u, X, Y,
  fatan2, neg,
} from "@node-td/kernel/field";
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

    const inputExpr = getFieldExpr(input);
    if (inputExpr) {
      // Scaled coordinates
      const uScale = u("curlScale", scale);
      const uEps = u("curlEps", eps);
      const uInvEps2 = u("curlInvEps2", 1 / (2 * eps));
      const sx = mul(X, uScale);
      const sy = mul(Y, uScale);

      // Central differences for gradient
      const dfdx = mul(
        sub(
          apply(inputExpr, add(sx, uEps), sy),
          apply(inputExpr, sub(sx, uEps), sy),
        ),
        uInvEps2,
      );
      const dfdy = mul(
        sub(
          apply(inputExpr, sx, add(sy, uEps)),
          apply(inputExpr, sx, sub(sy, uEps)),
        ),
        uInvEps2,
      );

      // Curl: atan2(-dfdx, dfdy), normalized to [0, 1]
      const angle = fatan2(neg(dfdx), dfdy);
      const expr = div(add(angle, c(Math.PI)), c(2 * Math.PI));

      return { field: createField(expr) };
    }

    const field: Field2D = (x, y) => {
      const sx = x * scale;
      const sy = y * scale;

      // Central differences for gradient
      const dfdx = (input(sx + eps, sy) - input(sx - eps, sy)) / (2 * eps);
      const dfdy = (input(sx, sy + eps) - input(sx, sy - eps)) / (2 * eps);

      // Curl: rotate gradient 90 degrees
      const angle = Math.atan2(-dfdx, dfdy);

      // Normalize from [-pi, pi] to [0, 1]
      return (angle + Math.PI) / (2 * Math.PI);
    };

    return { field };
  },
};
