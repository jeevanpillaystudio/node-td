# Work item C5b: Split the rest of @node-td/engine into operators, render-web and patches; delete engine

Depends on: C5a
Parallel-safe with: K3

## Goal
Give each layer its own package, with turbo boundaries enforcing the import direction. Operators are grouped into family folders in a single move.

## Files
- packages/operators/**
- packages/render-web/**
- packages/patches/**
- packages/engine/**
- packages/frame/package.json
- packages/frame/src/**/*.tsx (import paths)
- apps/examples/package.json
- apps/examples/src/routes/index.tsx (import path)
- turbo.json
- packages/*/turbo.json
- bun.lock

## Steps
- Create packages/operators (@node-td/operators: depends on kernel; devDependency testing; lib ES2022+DOM; tag layer-ops). Run git mv for every operator and its golden test into the family folders given in the taxonomy map: field/, top/, sop/, sop/heightfield/, sop/camera/, sop/subscapes/, sop/meridian/, chop/, mat/, comp/. Operator ids and category values stay unchanged in this item.
- Move allOperators and createDefaultRegistry from packages/engine/src/index.ts into packages/operators/src/index.ts. Add `defaultRegistry()`, which returns one shared instance.
- Create packages/render-web (@node-td/render-web: depends on kernel; tag layer-render) and git mv render/{canvas-2d,webgl,index}.ts into it.
- Create packages/patches (@node-td/patches: depends on kernel; devDependencies operators and testing; tag layer-content) and git mv the patches, their golden tests and __snapshots__ into it.
- git mv packages/engine/src/editor/types.ts → packages/frame/src/editor/graph-adapter.ts and delete editor/index.ts.
- Point packages/frame dependencies at kernel, operators and render-web, and replace its 3 createDefaultRegistry() calls with defaultRegistry(). Point apps/examples at @node-td/patches.
- Delete packages/engine.
- Add root turbo boundaries rules so that kernel depends on nothing; ops and render on kernel only; content on kernel only; frame and editor on kernel, ops, render and each other in one direction; app on any. Check the syntax with `./node_modules/.bin/turbo boundaries --help` and node_modules/turbo/schema.json. Tag frame layer-ui and examples layer-app.
- Run `bun install` and commit the lockfile. Keep moves in their own commits.

## Verification
Each of these must hold:
- `bun install --frozen-lockfile` exits 0.
- `./node_modules/.bin/turbo run typecheck test` exits 0.
- `./node_modules/.bin/turbo boundaries` reports no issues.
- `test ! -d packages/engine` succeeds.
- After the tests, `git status --porcelain -- ':(glob)**/__snapshots__/**'` is empty.
- `bun run --cwd apps/examples build` exits 0.
- `grep -rn 'createDefaultRegistry()' packages/frame/src` prints nothing.

## Risk
Medium. The diff is large but mechanical, and conflicts with the March WIP grow here, so keep moves as pure `git mv` commits. A boundaries config with the wrong syntax only fails the check; it does not break the build.

## Findings addressed
patches-examples/patches-in-engine, sop/sop-family-structure, td-fidelity/patch-specific-in-engine, infra-history/turbo-boundaries-inert, infra-history/wip-patches-copied-not-moved, frame-editor/module-global-state, mat-rop-chop/barrel-drift, kernel/root-barrel-incoherent

## Orchestrator overrides (these win over the steps above)
- Same install procedure as C5a.
- turbo boundaries: confirm the config shape against node_modules/turbo/schema.json before writing it (tags in each package's turbo.json, rules in root turbo.json "boundaries"). Run with TURBO_TELEMETRY_DISABLED=1.
