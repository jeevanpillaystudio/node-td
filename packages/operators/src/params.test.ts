import { expect, test } from "bun:test";
import { isEnumParam, lintParamDefs } from "@node-td/kernel";
import { allOperators } from "./index";

test("every operator's param defaults are legal for their own params", () => {
  expect(allOperators.flatMap(lintParamDefs)).toEqual([]);
});

test("every numeric param has a positive step and min < max", () => {
  const issues: string[] = [];
  for (const op of allOperators) {
    for (const p of op.params) {
      if (isEnumParam(p)) continue;
      if (!(p.step > 0)) issues.push(`${op.id}.${p.key}: step ${p.step}`);
      if (!(p.min < p.max)) issues.push(`${op.id}.${p.key}: [${p.min}, ${p.max}]`);
    }
  }
  expect(issues).toEqual([]);
});

test("every operator declares each param key once", () => {
  const duplicates = allOperators.flatMap((op) => {
    const keys = op.params.map((p) => p.key);
    return keys.filter((key, i) => keys.indexOf(key) !== i).map((key) => `${op.id}.${key}`);
  });
  expect(duplicates).toEqual([]);
});
