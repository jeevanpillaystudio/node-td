import type { Operator, Field2D } from "../../../kernel/types";

type Inputs = { field: Field2D };
type Outputs = { dx: Field2D; dy: Field2D };

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
export const fieldGradient: Operator<Inputs, Outputs> = {
  id: "field-gradient",
  category: "top",
  label: "Field Gradient",
  inputs: [{ name: "field", type: "field" }],
  outputs: [
    { name: "dx", type: "field" },
    { name: "dy", type: "field" },
  ],
  params: [
    { key: "epsilon", label: "Epsilon", min: 0.01, max: 10, step: 0.01, default: 1.0 },
  ],
  evaluate({ field: input }, params) {
    const eps = params.epsilon ?? 1.0;
    const invEps2 = 1 / (2 * eps);

    const dx: Field2D = (x, y) => (input(x + eps, y) - input(x - eps, y)) * invEps2;
    const dy: Field2D = (x, y) => (input(x, y + eps) - input(x, y - eps)) * invEps2;

    return { dx, dy };
  },
};
