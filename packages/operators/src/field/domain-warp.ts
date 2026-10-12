import type { Operator, Field2D } from "@node-td/kernel";
import { createField, getFieldExpr, warpExpr, u } from "@node-td/kernel/field";

type Inputs = { field: Field2D; warp: Field2D };
type Outputs = { field: Field2D };

/**
 * Domain Warp — displaces the sampling coordinates of one field
 * using values from another field.
 *
 * For X displacement, warp is sampled at (x, y).
 * For Y displacement, warp is sampled at (x + offsetX, y + offsetY)
 * to produce independent distortion per axis.
 *
 * Creates organic, turbulent distortion — the signature look of
 * warped terrain in generative landscapes.
 */
export const domainWarp: Operator<Inputs, Outputs> = {
  id: "domain-warp",
  category: "field",
  label: "Domain Warp",
  inputs: [
    { name: "field", type: "field" },
    { name: "warp", type: "field" },
  ],
  outputs: [{ name: "field", type: "field" }],
  params: [
    { key: "amount", label: "Warp Amount", min: 0, max: 300, step: 1, default: 50 },
    { key: "offsetX", label: "Offset X", min: 0, max: 1000, step: 10, default: 100 },
    { key: "offsetY", label: "Offset Y", min: 0, max: 1000, step: 10, default: 100 },
  ],
  evaluate({ field: input, warp }, params) {
    const amt = params.amount ?? 50;
    const ox = params.offsetX ?? 100;
    const oy = params.offsetY ?? 100;

    const inputExpr = getFieldExpr(input);
    const warpExprNode = getFieldExpr(warp);
    if (inputExpr && warpExprNode) {
      const expr = warpExpr(
        inputExpr,
        warpExprNode,
        u("warpAmount", amt),
        u("warpOffsetX", ox),
        u("warpOffsetY", oy),
      );
      return { field: createField(expr) };
    }

    const field: Field2D = (x, y) => {
      const wx = (warp(x, y) - 0.5) * 2 * amt;
      const wy = (warp(x + ox, y + oy) - 0.5) * 2 * amt;
      return input(x + wx, y + wy);
    };

    return { field };
  },
};
