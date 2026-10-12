import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OPERATORS_DIR = join(import.meta.dir, "../src");

/** Module specifiers in `from "…"`, `import "…"`, `import("…")` and `require("…")`. */
const SPECIFIER = /(?:\bfrom|\bimport|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g;

/** A specifier with a `render` path segment: ../../render/webgl, @node-td/engine/render, … */
const RENDER = /(?:^|\/)render(?:\/|$)/;

test("operators import nothing from render/", () => {
  const files = readdirSync(OPERATORS_DIR, { recursive: true, encoding: "utf8" }).filter((f) =>
    /\.tsx?$/.test(f),
  );
  expect(files.length).toBeGreaterThan(0);

  const offending: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(OPERATORS_DIR, file), "utf8");
    for (const [, specifier] of source.matchAll(SPECIFIER)) {
      if (specifier && RENDER.test(specifier)) offending.push(`${file}: ${specifier}`);
    }
  }
  expect(offending).toEqual([]);
});
