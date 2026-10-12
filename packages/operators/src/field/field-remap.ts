import type { Operator, Field2D } from "@node-td/kernel";
import {
  createField, getFieldExpr, clamp as fClamp, abs as fAbs,
  mul, sub, add, c, u, div, round as fRound, fpow, smoothstep as fSmooth,
} from "@node-td/kernel/field";
import type { FieldExpr } from "@node-td/kernel/field";

type Inputs = { field: Field2D };
type Outputs = { field: Field2D };

/** Unary transfer functions for Field2D values */
const MODES = [
  { label: "Clamp", value: 0 },
  { label: "Quantize", value: 1 },
  { label: "Ridge", value: 2 },
  { label: "Smoothstep", value: 3 },
  { label: "Power", value: 4 },
  { label: "Invert", value: 5 },
  { label: "Abs", value: 6 },
] as const;

function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/**
 * Field Remap — applies a unary transfer function to a Field2D.
 *
 * - Clamp: clamps to [lo, hi]
 * - Quantize: snaps to discrete steps (creates terraced terrain)
 * - Ridge: abs(2v - 1) — creates sharp ridgelines from noise
 * - Smoothstep: S-curve between lo and hi
 * - Power: raises value to exponent (contrast control)
 * - Invert: 1 - v
 * - Abs: absolute value (folds negative noise values)
 */
export const fieldRemap: Operator<Inputs, Outputs> = {
  id: "field-remap",
  category: "field",
  label: "Field Remap",
  inputs: [{ name: "field", type: "field" }],
  outputs: [{ name: "field", type: "field" }],
  params: [
    {
      key: "mode",
      label: "Mode",
      kind: "enum",
      options: [...MODES],
      default: 2, // ridge
    },
    { key: "steps", label: "Steps (Quantize)", min: 2, max: 32, step: 1, default: 6 },
    { key: "power", label: "Power", min: 0.1, max: 5.0, step: 0.1, default: 1.5 },
    { key: "lo", label: "Low", min: 0, max: 1, step: 0.01, default: 0 },
    { key: "hi", label: "High", min: 0, max: 1, step: 0.01, default: 1 },
  ],
  evaluate({ field: input }, params) {
    const mode = Math.round(params.mode ?? 2);
    const steps = Math.round(params.steps ?? 6);
    const power = params.power ?? 1.5;
    const lo = params.lo ?? 0;
    const hi = params.hi ?? 1;

    const inputExpr = getFieldExpr(input);
    if (inputExpr) {
      let expr: FieldExpr;
      switch (mode) {
        case 0: // clamp
          expr = fClamp(inputExpr, u("lo", lo), u("hi", hi));
          break;
        case 1: // quantize: round(v * steps) / steps
          expr = div(fRound(mul(inputExpr, u("steps", steps))), u("stepsDiv", steps));
          break;
        case 2: // ridge: abs(2v - 1)
          expr = fAbs(sub(mul(c(2), inputExpr), c(1)));
          break;
        case 3: // smoothstep
          expr = fSmooth(u("lo", lo), u("hi", hi), inputExpr);
          break;
        case 4: // power
          expr = fpow(fClamp(inputExpr, c(0), c(1)), u("power", power));
          break;
        case 5: // invert
          expr = sub(c(1), inputExpr);
          break;
        case 6: // abs
          expr = fAbs(inputExpr);
          break;
        default:
          expr = inputExpr;
      }
      return { field: createField(expr) };
    }

    const field: Field2D = (x, y) => {
      const v = input(x, y);
      switch (mode) {
        case 0: // clamp
          return Math.max(lo, Math.min(hi, v));
        case 1: // quantize
          return Math.round(v * steps) / steps;
        case 2: // ridge
          return Math.abs(2 * v - 1);
        case 3: // smoothstep
          return smoothstep(lo, hi, v);
        case 4: // power
          return Math.pow(Math.max(0, Math.min(1, v)), power);
        case 5: // invert
          return 1 - v;
        case 6: // abs
          return Math.abs(v);
        default:
          return v;
      }
    };

    return { field };
  },
};
