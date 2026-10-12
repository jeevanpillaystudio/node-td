import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { basename } from "node:path";
import { allOperators } from "./index";

test("every registered operator has a colocated <id>.golden.test.ts", () => {
  const files = new Set(
    readdirSync(import.meta.dir, { recursive: true, encoding: "utf8" }).map((f) => basename(f)),
  );
  const missing = allOperators
    .map((op) => op.id)
    .filter((id) => !files.has(`${id}.golden.test.ts`));
  expect(missing).toEqual([]);
});
