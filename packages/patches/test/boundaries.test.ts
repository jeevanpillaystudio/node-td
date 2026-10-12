import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const SRC_DIR = join(import.meta.dir, "../src");

/** Module specifiers in `from "…"`, `import "…"`, `import("…")` and `require("…")`. */
const SPECIFIER = /(?:\bfrom|\bimport|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g;

/** Specifiers of `import type { … } from "…"` statements. */
const TYPE_IMPORT = /\bimport\s+type\s[^;]*?\bfrom\s*["']([^"']+)["']/g;

/**
 * Patches are data: at runtime they import nothing but kernel types.
 * Their tests take the operators, render-web and the test harness as
 * devDependencies, so turbo boundaries has to allow those packages for
 * layer-content; this test keeps them out of the patch source itself.
 */
test("patch source imports only kernel types, and nothing outside src", () => {
  const files = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" }).filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
  );
  expect(files.length).toBeGreaterThan(0);

  const offending: string[] = [];
  for (const file of files) {
    const path = join(SRC_DIR, file);
    const source = readFileSync(path, "utf8");
    let typeOnlyKernel = [...source.matchAll(TYPE_IMPORT)].filter(
      ([, s]) => s === "@node-td/kernel",
    ).length;
    for (const [, specifier] of source.matchAll(SPECIFIER)) {
      if (!specifier) continue;
      const allowed = specifier.startsWith(".")
        ? !relative(SRC_DIR, resolve(dirname(path), specifier)).startsWith("..")
        : specifier === "@node-td/kernel" && typeOnlyKernel-- > 0;
      if (!allowed) offending.push(`${file}: ${specifier}`);
    }
  }
  expect(offending).toEqual([]);
});
