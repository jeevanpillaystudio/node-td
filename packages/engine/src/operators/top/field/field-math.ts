import type { Operator, Field2D } from "../../../kernel/types";
import { createField, getFieldExpr, add as fAdd, mul, fmin, fmax, mix as fMix, c, u } from "../../../kernel/field-expr";
import type { FieldExpr } from "../../../kernel/field-expr";

type Inputs = { a: Field2D; b: Field2D };
type Outputs = { field: Field2D };

/** Binary operations on two Field2D inputs */
const MODES = [
  { label: "Add", value: 0 },
  { label: "Multiply", value: 1 },
  { label: "Min", value: 2 },
  { label: "Max", value: 3 },
  { label: "Lerp", value: 4 },
] as const;

/**
 * Field Math — combines two Field2D inputs with a selectable
 * binary operation: add, multiply, min, max, or lerp.
 *
 * For lerp mode, the `mix` parameter controls the blend factor
 * (0 = field A, 1 = field B).
 */
export const fieldMath: Operator<Inputs, Outputs> = {
  id: "field-math",
  category: "top",
  label: "Field Math",
  inputs: [
    { name: "a", type: "field" },
    { name: "b", type: "field" },
  ],
  outputs: [{ name: "field", type: "field" }],
  params: [
    {
      key: "mode",
      label: "Mode",
      kind: "enum",
      options: [...MODES],
      default: 0,
    },
    { key: "mix", label: "Mix (Lerp)", min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  evaluate({ a, b }, params) {
    const mode = Math.round(params.mode ?? 0);
    const mixVal = params.mix ?? 0.5;

    const aExpr = getFieldExpr(a);
    const bExpr = getFieldExpr(b);
    if (aExpr && bExpr) {
      let expr: FieldExpr;
      switch (mode) {
        case 0: expr = fmin(fAdd(aExpr, bExpr), c(1)); break;  // add (clamped)
        case 1: expr = mul(aExpr, bExpr); break;                 // multiply
        case 2: expr = fmin(aExpr, bExpr); break;                // min
        case 3: expr = fmax(aExpr, bExpr); break;                // max
        case 4: expr = fMix(aExpr, bExpr, u("mix", mixVal)); break;     // lerp
        default: expr = aExpr;
      }
      return { field: createField(expr) };
    }

    const field: Field2D = (x, y) => {
      const va = a(x, y);
      const vb = b(x, y);
      switch (mode) {
        case 0: return Math.min(va + vb, 1);        // add (clamped)
        case 1: return va * vb;                       // multiply
        case 2: return Math.min(va, vb);              // min
        case 3: return Math.max(va, vb);              // max
        case 4: return va + (vb - va) * mixVal;       // lerp
        default: return va;
      }
    };

    return { field };
  },
};
