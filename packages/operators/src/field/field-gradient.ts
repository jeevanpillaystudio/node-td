import { defineOperator, type Field2D } from "@node-td/kernel";
import { add, apply, createField, getFieldExpr, mul, sub, u, X, Y } from "@node-td/kernel/field";

/**
 * Field Gradient — computes the partial derivatives of a Field2D
 * using central finite differences.
 *
 * Outputs two Field2D:
 * - `dx`: rate of change in X (horizontal)
 * - `dy`: rate of change in Y (vertical)
 *
 * Essential for:
 * - Computing surface normals (cross product of tangent vectors)
 * - Diffuse lighting (dot product of normal and light direction)
 * - Curl noise (90-degree rotation of gradient)
 */
export const fieldGradient = defineOperator({
  id: "field-gradient",
  category: "field",
  label: "Field Gradient",
  inputs: [{ name: "field", type: "field" }],
  outputs: [
    { name: "dx", type: "field" },
    { name: "dy", type: "field" },
  ],
  params: [{ key: "epsilon", label: "Epsilon", min: 0.01, max: 10, step: 0.01, default: 1.0 }],
  evaluate({ field: input }, params) {
    const eps = params.epsilon;
    const invEps2 = 1 / (2 * eps);

    const inputExpr = getFieldExpr(input);
    if (inputExpr) {
      const uEps = u("gradEps", eps);
      const uInvEps2 = u("gradInvEps2", invEps2);

      // dx = (input(x+eps, y) - input(x-eps, y)) / (2*eps)
      const dxExpr = mul(
        sub(apply(inputExpr, add(X, uEps), Y), apply(inputExpr, sub(X, uEps), Y)),
        uInvEps2,
      );

      // dy = (input(x, y+eps) - input(x, y-eps)) / (2*eps)
      const dyExpr = mul(
        sub(apply(inputExpr, X, add(Y, uEps)), apply(inputExpr, X, sub(Y, uEps))),
        uInvEps2,
      );

      return { dx: createField(dxExpr), dy: createField(dyExpr) };
    }

    const dx: Field2D = (x, y) => (input(x + eps, y) - input(x - eps, y)) * invEps2;
    const dy: Field2D = (x, y) => (input(x, y + eps) - input(x, y - eps)) * invEps2;

    return { dx, dy };
  },
});
