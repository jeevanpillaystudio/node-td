# node-td

A node-based generative visual programming system inspired by TouchDesigner. GPU-accelerated engine with field expressions, GLSL compilation, WebGL rendering, and a React frame renderer with node editor UI.

## Structure

```
apps/examples/        TanStack Start + Vite showcase app
packages/engine/      Core kernel, operators, render, patches, editor
packages/frame/       React frame renderer + node editor overlay
internal/typescript/  Shared TypeScript config
```

## Packages

### @node-td/engine

Zero-dependency generative engine with 4 export paths:

- `.` — kernel types, CookEngine, Graph, SeededRNG, OperatorRegistry, and the built-in operators (`allOperators`, `createDefaultRegistry`) in the TOP, SOP, MAT and ROP categories. CHOP exists only as a category name: there are no CHOP operators.
- `./render` — Canvas2D drawing, WebGL2 GPU field rendering
- `./patches` — pre-built graph templates (meridian, terrain, subscapes)
- `./editor` — React Flow graph conversion utilities

### @node-td/frame

React components for rendering and editing generative graphs:

- `Frame` — canvas renderer with shared WebGL2 context, visibility gating, staggered cook scheduling
- `FrameShell` — dev-only editor overlay wrapper (zero overhead in production)
- `FrameProvider` — context for frame registry and editing state
- Editor — React Flow canvas, parameter inspector, live preview

## Development

```bash
bun install
bun run dev              # start examples app
bun run typecheck        # typecheck all packages
bun run lint             # biome check
```

## Tooling

- **Package manager**: bun
- **Linting + formatting**: biome
- **Build orchestration**: turborepo
- **App framework**: TanStack Start + Vite
