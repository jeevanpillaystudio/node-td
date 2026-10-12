# node-td

A node-based system for generative art, after TouchDesigner. A patch is a
graph of typed operators (FIELD, TOP, SOP, CHOP and COMP families); the
CookEngine cooks it on the CPU, headless, and a React Frame draws the final
image. The gallery holds reconstructions of Matt DesLauriers' Meridian and
Subscapes, and three studies.

Rendering is CPU and Canvas 2D only. A GLSL compiler for fields and a WebGL
backend exist but do not run: they wait for a GPU path that matches the CPU
one.

## Packages

```
packages/kernel/       data model, graph validation, CookEngine, registry, RNG, defineOperator, geometry and field algebra
packages/operators/    every built-in operator, one folder per family; allOperators lists them
packages/render-web/   canvas and WebGL resource code (blitBuffer2D)
packages/patches/      the gallery graphs and their registry
packages/frame/        Frame: cooks a patch and draws its final image
packages/editor/       the dev editor: graph view, inspector, live preview
internal/testing/      golden-test kit: recording canvas, digests, opGolden, patchGoldens
internal/typescript/   shared tsconfig
apps/examples/         TanStack Start + Vite gallery
```

`AGENTS.md` has each package's role, the layering rules and the golden-test
policy; `docs/roadmap.md` has what is still to do.

## Development

```bash
bun install
bun run dev          # the gallery and editor
bun test             # every test
bun run typecheck    # typecheck all packages
bun run lint         # biome
```

## Tooling

bun workspaces with the isolated linker, Turborepo, Biome, TypeScript, and
TanStack Start with Vite for the app.
