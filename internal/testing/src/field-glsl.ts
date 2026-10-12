import { serialize } from "bun:jsc";
import type { Field2D } from "@node-td/kernel";
import { type FieldExpr, getFieldExpr } from "@node-td/kernel/field";

/**
 * GLSL checks for the fields a cook carries. compileField has no runtime
 * caller until the deferred GPU rasterizer; these keep it compiling every
 * FieldExpr the operators and patches actually build. The kernel's own
 * glsl.test.ts covers the compiler in isolation, with the same deadline
 * and function-order check (the kernel cannot depend on this package).
 */

/** Every distinct FieldExpr carried by a field among a cook's outputs, labelled node.port. */
export function cookedFields(
  cooked: ReadonlyMap<string, Record<string, unknown>>,
): [string, FieldExpr][] {
  const seen = new Set<FieldExpr>();
  const fields: [string, FieldExpr][] = [];
  for (const [key, outputs] of cooked) {
    for (const [port, value] of Object.entries(outputs)) {
      if (typeof value !== "function") continue;
      const expr = getFieldExpr(value as Field2D);
      if (!expr || seen.has(expr)) continue;
      seen.add(expr);
      fields.push([`${key}.${port}`, expr]);
    }
  }
  return fields;
}

/**
 * Ample for a child bun to start and compile a fixture's or patch's
 * fields (tens of milliseconds); short, because a compiler that loops
 * grows memory by gigabytes a second until the child is killed.
 */
const DEADLINE_MS = 2_000;

/** Compiles each expression and writes one JSON line per result as soon as it has it. */
const COMPILE_SCRIPT = `
import { deserialize } from "bun:jsc";
import { writeSync } from "node:fs";
import { compileField } from ${JSON.stringify(import.meta.resolve("@node-td/kernel/field"))};
const exprs = deserialize(new Uint8Array(await Bun.stdin.arrayBuffer()));
for (const expr of exprs) {
  let result;
  try {
    result = { source: compileField(expr).fragmentSource };
  } catch (error) {
    result = { error: error instanceof Error ? error.message : String(error) };
  }
  writeSync(1, JSON.stringify(result) + "\\n");
}
`;

/**
 * What is wrong with the order of a shader's field functions. GLSL needs
 * a function defined before any call to it, and forbids recursion.
 */
function functionOrderIssues(source: string): string[] {
  const issues: string[] = [];
  const defined = new Set<string>();
  let current: string | undefined;
  for (const line of source.split("\n")) {
    const definition = /^float (field_fn_\d+)\(/.exec(line)?.[1];
    if (definition) {
      if (defined.has(definition)) issues.push(`${definition} is defined twice`);
      current = definition;
      continue;
    }
    if (line === "}") {
      if (current) defined.add(current);
      current = undefined;
      continue;
    }
    for (const [, name] of line.matchAll(/\b(field_fn_\d+)\(/g)) {
      if (name === current) issues.push(`${name} calls itself`);
      else if (name && !defined.has(name)) issues.push(`${name} is called before it is defined`);
    }
  }
  return issues;
}

/**
 * Compile every field to GLSL and list what went wrong, one line per
 * problem: [] when each compiles to a shader with a main() and its field
 * functions in order. The compiles run in a child bun process killed at
 * a deadline, because bun cannot time out code that never yields; the
 * fields cross as a structured clone, which keeps shared sub-trees shared.
 */
export function fieldGlslIssues(fields: readonly (readonly [string, FieldExpr])[]): string[] {
  const child = Bun.spawnSync({
    cmd: [process.execPath, "-e", COMPILE_SCRIPT],
    stdin: serialize(
      fields.map(([, expr]) => expr),
      { binaryType: "nodebuffer" },
    ),
    timeout: DEADLINE_MS,
    killSignal: "SIGKILL",
  });
  if (!child.success && !child.exitedDueToTimeout) {
    return [`the compile process failed:\n${child.stderr.toString()}`];
  }

  const results = child.stdout
    .toString()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as { source?: string; error?: string });

  const issues: string[] = [];
  fields.forEach(([label], i) => {
    const result = results[i];
    if (!result) {
      issues.push(
        i === results.length
          ? `${label}: compileField did not return within ${DEADLINE_MS} ms`
          : `${label}: not compiled`,
      );
    } else if (result.source === undefined) {
      issues.push(`${label}: ${result.error}`);
    } else {
      if (!/^void main\(\) \{$/m.test(result.source)) issues.push(`${label}: no main()`);
      for (const issue of functionOrderIssues(result.source)) issues.push(`${label}: ${issue}`);
    }
  });
  return issues;
}
