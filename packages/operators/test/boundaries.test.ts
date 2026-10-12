import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const PACKAGE_DIR = join(import.meta.dir, "..");
const SRC_DIR = join(PACKAGE_DIR, "src");

/** Module specifiers in `from "…"`, `import "…"`, `import("…")` and `require("…")`. */
const SPECIFIER = /(?:\bfrom|\bimport|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g;

/** The only packages an operator may import: the kernel and its field algebra. */
const OPERATOR_PACKAGES = new Set(["@node-td/kernel", "@node-td/kernel/field"]);

/** Tests may also import the test runner, node built-ins and the test harness. */
const TEST_PACKAGE = /^(?:bun:test|node:.+|@node-td\/testing)$/;

/** Whether `path` lies inside `dir`. */
function inside(dir: string, path: string): boolean {
  const rel = relative(dir, path);
  return !rel.startsWith("..") && !rel.startsWith("/");
}

/**
 * Operators depend on the kernel only: never on render-web, React or
 * another workspace package. turbo boundaries enforces the same through
 * the package's declared dependencies and its layer-ops tag; this keeps
 * the rule in `bun test` as well. Operator source stays inside src/;
 * tests may also reach the package's test/ helpers.
 */
test("operators import only the kernel, and nothing outside their package", () => {
  const files = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" }).filter((f) =>
    /\.tsx?$/.test(f),
  );
  expect(files.length).toBeGreaterThan(0);

  const offending: string[] = [];
  for (const file of files) {
    const path = join(SRC_DIR, file);
    const isTest = /\.test\.tsx?$/.test(file);
    for (const [, specifier] of readFileSync(path, "utf8").matchAll(SPECIFIER)) {
      if (!specifier) continue;
      const allowed = specifier.startsWith(".")
        ? inside(isTest ? PACKAGE_DIR : SRC_DIR, resolve(dirname(path), specifier))
        : OPERATOR_PACKAGES.has(specifier) || (isTest && TEST_PACKAGE.test(specifier));
      if (!allowed) offending.push(`${file}: ${specifier}`);
    }
  }
  expect(offending).toEqual([]);
});
