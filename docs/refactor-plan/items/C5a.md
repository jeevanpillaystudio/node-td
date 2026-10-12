# Work item C5a: Extract @node-td/kernel (DOM-free) and @node-td/testing packages

Depends on: C1, C2, C3, C4
Parallel-safe with: none

## Goal
Turn the kernel into its own package that compiles with lib ES2022 only, and that other code reaches only through its exports.

## Files
- packages/kernel/**
- internal/testing/**
- packages/engine/src/kernel/*
- packages/engine/test/support/*
- packages/engine/src/index.ts
- packages/engine/src/operators/**/*.ts (import paths)
- packages/engine/src/render/*.ts (import paths)
- packages/engine/src/editor/types.ts (import paths)
- packages/engine/package.json
- bun.lock

## Steps
- Pre-check that offline workspace linking works: `rsync -a --exclude node_modules ./ "$TMPDIR/ntd-link/" && mkdir -p "$TMPDIR/ntd-link/packages/zz" && echo '{"name":"@node-td/zz","private":true}' > "$TMPDIR/ntd-link/packages/zz/package.json" && (cd "$TMPDIR/ntd-link" && bun install)`. If this fails, use the fallback described under risk and stop.
- Create packages/kernel/package.json:
- name @node-td/kernel, private, type module, sideEffects false.
- exports "." → src/index.ts and "./field" → src/field/index.ts.
- scripts: typecheck `tsc --noEmit`, test `bun test`, clean.
- devDependencies: typescript-config, typescript.
Create tsconfig.json extending base with lib ["ES2022"], types [] and tests excluded.
- Commit A, moves and import paths only:
- git mv kernel/{types,graph,cook,registry,rng}.ts → packages/kernel/src/.
- kernel/field-expr.ts → src/field/expr.ts; kernel/field-compiler.ts → src/field/glsl.ts; kernel/noise.ts → src/field/noise.ts.
- Move the kernel *.test.ts files with them.
- git mv packages/engine/test/support → internal/testing/src, with a @node-td/testing package.json.
- Rewrite engine imports to `@node-td/kernel` and `@node-td/kernel/field`, and add `"@node-td/kernel": "workspace:*"` to engine.
- Run `bun install`.
- Commit B: write kernel/src/index.ts (data model, graph functions, CookEngine, OperatorRegistry, SeededRNG, geometry helpers) and src/field/index.ts (FieldExpr, builders, noise, compileField). For now packages/engine/src/index.ts re-exports these, so frame compiles unchanged.
- Commit C: replace OffscreenCanvas at types.ts:96 and :202 with a kernel-owned `interface CanvasHandle { readonly width: number; readonly height: number }`, used as `_canvas?: CanvasHandle` and `createCanvas?: (w, h) => CanvasHandle`. Add a cast helper `asOffscreen(h)` in engine and use it at the stroke-renderer, composite and canvas-2d sites.
- Add turbo.json tag `layer-kernel` to packages/kernel.

## Verification
Each of these must hold:
- `./node_modules/.bin/tsc --noEmit -p packages/kernel` exits 0 with lib ES2022 only.
- `grep -rnE 'OffscreenCanvas|WebGL|document|window|@node-td/' packages/kernel/src` prints nothing.
- `bun install --frozen-lockfile` exits 0.
- `./node_modules/.bin/turbo run typecheck test` exits 0, with snapshots unchanged.
- `git show -M --stat HEAD~2` shows the moved files as renames.

## Risk
Medium. If bun cannot link new workspace packages offline, fall back: keep the single @node-td/engine package, add packages/engine/src/kernel/tsconfig.json (lib ES2022) with a `typecheck:kernel` script, and extend boundaries.test.ts to forbid imports leaving src/kernel. Bun snapshot files are keyed by test file name, so each test file must move together with its __snapshots__ directory and keep its name.

## Findings addressed
kernel/kernel-dom-coupling, kernel/root-barrel-incoherent, field/naming-leftovers

## Orchestrator overrides (these win over the steps above)
- Workspace packages: create the package dir + package.json, then `BUN_TMPDIR=$TMPDIR BUN_INSTALL_CACHE_DIR=$TMPDIR/bun-cache bun install` (registry reachable since 12 Oct). Commit bun.lock with the change. Fall back to hand-editing bun.lock + `--frozen-lockfile` only if the registry is unreachable.
- Skip the rsync pre-check.
