# node-td

A TouchDesigner-like node system for generative art, in TypeScript. A patch is
a graph of operators; the CookEngine cooks it headless on the CPU, and a host
(Frame, the editor) draws the result. The gallery artworks are reconstructions
of Matt DesLauriers' Meridian and Subscapes.

## Packages

Each package exports TypeScript source; there is no build step except the app.

| Package | Owns | May import |
| --- | --- | --- |
| `packages/kernel` (@node-td/kernel) | Data model (types.ts), Graph and validateGraph, CookEngine, OperatorRegistry, SeededRNG, defineOperator, geometry helpers, field algebra (field/: expr, noise, glsl) | nothing; lib ES2022, no DOM |
| `packages/operators` (@node-td/operators) | Every built-in operator, by family (field/, top/, sop/, chop/, comp/), and `allOperators` in src/index.ts, the one list | kernel |
| `packages/render-web` (@node-td/render-web) | Canvas and WebGL resource code: blitBuffer2D; a dormant WebGL field backend | kernel |
| `packages/patches` (@node-td/patches) | The gallery graphs and the `patches` registry | kernel (types); dev: operators, render-web, testing |
| `packages/frame` (@node-td/frame) | Production renderer: `Frame` cooks a patch and draws its terminal image; FrameHostContext for an editor to attach | kernel, operators, render-web; react as a peer |
| `packages/editor` (@node-td/editor) | Dev editor: React Flow graph view, inspector, preview, FrameShell/FrameProvider | frame, kernel, render-web; takes the registry from the FrameEntry |
| `internal/testing` (@node-td/testing) | Test kit: RecordingCanvas, digest, cookGraph, opGolden, patchGoldens | kernel; only devDependencies point at it |
| `internal/typescript` | Shared tsconfig | nothing |
| `apps/examples` | TanStack Start + Vite gallery and editor | frame, editor, patches |

## Layering rules

- The kernel compiles without DOM and imports no other package.
- Operators import only the kernel: never render-web, React or another package. Code shared by operators goes in the kernel (geometry.ts, field/) or in a module inside operators.
- Kernel, operators and patches source never imports render-web; canvas and WebGL resources live there or in host code. Patches' tests do import it (blitBuffer2D, as a dev dependency) to draw the render goldens.
- Each package binds the golden helpers to its own registry in its `test/goldens.ts`.
- `./node_modules/.bin/turbo boundaries` enforces the layer tags in each package's turbo.json.

## Operators

- Write them with `defineOperator`: inputs, params and outputs are typed from the declaration. The engine fills every declared param, so never write `params.x ?? literal`.
- An operator is a pure function of its inputs, params, declared env values (`envReads`) and `env.rng`. It never mutates its inputs or a cached output, never calls `Math.random`, never casts env.
- Its `category` (field, top, sop, chop, comp) follows from its first output's port type; a test checks this. There is no MAT: shading is a SOP that writes `colors` onto the geometry.
- A wire joins ports of the same type. Geometry carries `normals` and `colors` (3 floats per vertex) and named `attributes` (1 float per vertex); keep them with `withPositions` and `filterVertices` (kernel geometry.ts).
- The headless CPU cook is the reference. The GLSL compiler and WebGL backend are dormant: none runs today, and a GPU path may return only behind a test that it matches the CPU path.
- Invalid input is an error thrown from evaluate; the engine records it per node (`engine.stats.errors`) and cooks the independent branches.

## Commands

Run from the repository root. bun is at `~/.bun/bin/bun`.

```bash
bun install --frozen-lockfile
TURBO_TELEMETRY_DISABLED=1 ./node_modules/.bin/turbo run typecheck test
bun test                                   # every test, or a path: bun test packages/operators
bun run lint                               # biome
TURBO_TELEMETRY_DISABLED=1 ./node_modules/.bin/turbo boundaries
bun run --cwd apps/examples build
bun run dev                                # the gallery and editor
```

## Environment

- The npm registry is reachable from agent sandboxes but slow: a lockfile-only
  install took five minutes on 12 Oct 2026. Add a dependency only when the work
  needs one, and say why in the commit.
- `bun install` needs writable temp and cache directories there: set `BUN_TMPDIR` and `BUN_INSTALL_CACHE_DIR` to directories under `$TMPDIR`.
- Set `TURBO_TELEMETRY_DISABLED=1` for turbo.

## Golden tests

- Every operator has a colocated `<op>.golden.test.ts` (opGolden): digests of every node's outputs for small fixture graphs. Every patch has `<id>.nodes.golden.test.ts` and `<id>.render.golden.test.ts` (patchGoldens): node digests and the recorded canvas command stream at five sizes.
- A render golden (`*.render.golden.test.ts.snap`) changes only in a commit whose subject starts `intended output change:` and says what changed and why.
- A node or op golden may be re-pinned only when the render goldens stay byte-identical, or in such a labelled commit.
- `bun test` writes new snapshot entries itself: check `git diff` on `__snapshots__` before committing.

## Working here

- Small commits, staged by path. A file move is a `git mv` commit with only the move and import-path edits.
- Work on a branch and open a pull request; merge with a merge commit, never a squash.
- What is still owed lives in `docs/roadmap.md`.
