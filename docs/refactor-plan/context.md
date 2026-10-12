# Audit context (shared by every work item)

## Diagnosis
node-td has a sound core: a small, pure dataflow kernel (CookEngine over a JSON graph) and a field algebra (FieldExpr) that can be evaluated or compiled. Seven problems sit around it, and they make each other worse.

1. Nothing pins behaviour. There are no tests; the only one (meridian.test.ts) was deleted in the scaffold commit. That is why every bug below went unseen, and why no file can be moved safely today. Everything up to the canvas already cooks headless in bun, and the canvas API the renderers use is about 20 methods, so a safety net is cheap: digests of each node's outputs, plus a recorded canvas command stream for each patch.

2. A cook's result does not depend only on its inputs.
- Every random operator draws from one shared RNG stream, in topological order.
- Operators read dpr, _gl and createCanvas from an untyped env, outside dirty tracking.
- composite and blitBuffer2D mutate cached outputs.
So a partial re-cook gives a different picture from a full cook. The gallery hides this by clearing the whole cache after every draw, which switches off the incremental engine the kernel exists for. The editor preview does not clear the cache, so it already shows wrong output.

3. Two interpreters of the same field disagree. The GPU path (GLSL from compileField) uses different noise algorithms, a different coordinate domain and an 8-bit readback. compileField also never terminates on fbm, warp or apply. Which path runs depends on whether GL is present and on viewport width, so the same patch renders differently at different window sizes, and Terrain Heightmap can hang the tab. The CPU path is the only one that is consistent and testable headless. It should be the reference, and the GPU path should return only behind a conformance test.

4. The layering is inverted.
- The kernel imports noise from operators (an import cycle).
- Kernel types name OffscreenCanvas, so the kernel cannot compile without DOM.
- Operators import render/webgl and an undeclared env._gl.
- The engine package ships artworks and a React Flow adapter.
- The frame package mixes the production renderer with a dev editor whose Tailwind classes the app never generates.
The only enforcement available offline is package boundaries: the isolated linker, turbo boundaries and a per-package lib setting. So the fix is to split packages by layer, with moves rather than rewrites.

5. The TouchDesigner taxonomy is decorative.
- `category` only colours a dot.
- Port types are too coarse: one 'geometry' covers 2D and 3D, and one 'buffer' covers angle grids and images.
- 'ROP' is Houdini's term, and here it holds cameras and a compositor.
- 'MAT' holds palettes.
- Palette doubles as per-vertex colour, detected by count === vertexCount.
Wire legality (port-type equality) is the mechanism that actually works, so the fix is sharper port types and family labels that follow from what an operator outputs.

6. Patch content is pinned to accidents:
- param values outside their sliders' ranges;
- defaults restated about 110 times in evaluate bodies (wrong in camera-3d);
- Meridian calibrated at 256 px, so it renders partially in the gallery and blank above about 750 px;
- Subscapes normals mirrored, with its light tuned around the mirroring.

7. The scaffold is unfinished: the lockfile is ignored, the Biome config is in the Biome 1 format, the root tsconfig cannot resolve, typecheck needs a generated file, and there is no CI. Uncommitted March work in the main checkout also touches exactly the kernel, render and frame files this refactor moves.

The plan follows from these problems, in this order:
1. Tooling.
2. A two-tier golden safety net, taken from today's code.
3. Pure moves and deletions that leave both tiers unchanged.
4. Kernel semantics fixed so a full cook stays byte-identical while incremental cooks become correct. The engine replays the shared RNG stream, rather than switching to per-node seeds, which would change every random artwork.
5. The taxonomy and typed operators.
6. Last, the deliberate output changes. Each re-pins goldens in its own labelled commit.

## Target layout
node-td/  (bun 1.3.9 workspace, isolated linker, turbo, biome 2.4.9; internal packages export TS source, no build step)
  package.json            root scripts: lint (biome), typecheck/test/build/dev via turbo; packageManager bun@1.3.9
  bunfig.toml             [install] linker = "isolated"
  bun.lock                committed
  turbo.json              tasks: transit (^transit), typecheck, test, build (dist/**), dev, clean; boundaries rules by layer tag
  biome.json              Biome 2 config; ignores **/routeTree.gen.ts; tailwind directives on
  AGENTS.md               package roles, layering rules, commands, offline-install constraint, golden-test policy
  internal/typescript/    @node-td/typescript-config: base.json (ES2022, no DOM). Depends on nothing.
  internal/testing/       @node-td/testing (test-only): RecordingCanvas stub, digest(), cookGraph(), opGolden(). May depend on kernel and operators; only devDependencies point at it.
  packages/kernel/        @node-td/kernel. Depends on nothing. tsconfig lib ES2022 only, types [] (no DOM, no node).
    src/types.ts          data model: PortType, ParamDef, Operator, Geometry, Buffer2D (opaque CanvasHandle backing), Palette, Camera2D/3D, EnvValues {width,height,dpr,seed} + Capabilities
    src/graph.ts          Graph (+ optional seed), Wire, validateGraph (+ param lint), topoSort, collectParams
    src/env.ts            the declared $env source: its key and typed outputs (width, height)
    src/cook.ts           CookEngine: validate on construction, cookNode(), setEnv/setParams diffing, RNG stream replay, per-node errors
    src/registry.ts       OperatorRegistry
    src/rng.ts            SeededRNG (getState/setState; fork removed)
    src/define.ts         defineOperator() typed helper
    src/geometry.ts       geometry builders and iterators, attribute-preserving withPositions/filterVertices
    src/field/expr.ts     FieldExpr AST, createField, evalExpr (CPU reference interpreter), builders
    src/field/noise.ts    P table, pnoise, simplex2 (the single CPU noise definition)
    src/field/glsl.ts     compileField: pure GLSL codegen, tested, no runtime caller until the deferred GPU rasterizer
    src/index.ts, src/field/index.ts   exports "." (kernel API) and "./field" (field algebra), so generic builder names stay off the root
    (room for the March WIP: field/jit.ts behind evalExpr conformance tests; cookIncremental built on cookNode)
  packages/operators/     @node-td/operators. Depends on kernel only. lib ES2022 + DOM (canvas context types). Never imports render-web, React or another package.
    src/field/            perlin-noise, simplex-noise, fbm, domain-warp, field-math, field-remap, field-gradient, curl-angle
    src/top/              field-render (CPU), grid-sampler (CPU), stroke-renderer, composite
    src/sop/              poisson-disc, circle-pack, binary-subdivide, quadtree-subdivide, parametric-surface, flow-tracer, dash-stroke, transform-2d, merge, diffuse-shade (after G1)
    src/sop/heightfield/  surface-lift, geometric-normal, surface-raymarch
    src/sop/camera/       project-3d, visibility-cull
    src/sop/subscapes/    base-outline, contour-ring (artwork-specific; candidates for a future COMP)
    src/sop/meridian/     point-orient (artwork-specific)
    src/chop/             oklab-palette, procedural-palette, contrast-filter
    src/mat/              diffuse-shade until G1 moves it to sop/
    src/comp/             camera-2d, camera-3d
    src/index.ts          allOperators (the only operator list), createDefaultRegistry, defaultRegistry() (shared instance)
    each operator has a colocated <op>.golden.test.ts
  packages/render-web/    @node-td/render-web. Depends on kernel. Owns all canvas and WebGL resource code.
    src/canvas-2d.ts      blitBuffer2D (drawCanvas2D deleted)
    src/webgl.ts          dormant WebGL2 field backend for the deferred GPU rasterizer capability (March WIP's GPUBuffer2D, texture pool and blitTexture land here)
  packages/patches/       @node-td/patches. Runtime dependency: kernel (types only). Dev dependencies: operators, testing.
    src/meridian.ts, subscapes-terrain-3d.ts, terrain-heightmap.ts, simplex-field.ts, flow-field.ts
    src/index.ts          named graph exports + patches: PatchEntry[] {id, name, kind: 'artwork'|'study', graph}
    src/<id>.nodes.golden.test.ts, src/<id>.render.golden.test.ts (+ __snapshots__)
  packages/frame/         @node-td/frame. Production runtime. Depends on kernel, operators, render-web; react peer. Inline styles only: no Tailwind, no React Flow, no process.env.
    src/frame.tsx         Frame (registry/seed props, one ResizeObserver per mount, error state)
    src/frame-host.ts     FrameHostContext: register/unregister/renderOverlay, implemented by the editor
    (room for the March WIP CookScheduler: src/scheduler.ts)
  packages/editor/        @node-td/editor. Dev tool. Depends on frame, kernel, operators, @xyflow/react, radix, cva, clsx, tailwind-merge.
    src/frame-provider.tsx, frame-shell.tsx (enabled prop), editor/*, graph-adapter.ts (React Flow conversion, handle ids, $env node), ui/*
    styles.css            @source for its own src + default theme tokens; the app imports it
  apps/examples/          @node-td/examples (TanStack Start + Vite). Depends on frame, editor, patches. Gallery is driven by the patches registry; routeTree.gen.ts committed.

## Layering rules
- @node-td/kernel imports nothing outside packages/kernel and compiles with lib ES2022 and types []. Enforced by its tsconfig, `tsc --noEmit -p packages/kernel` and turbo boundaries.
- @node-td/operators imports only @node-td/kernel. It never imports render-web, React or another workspace package. Helpers shared by operators go in kernel (geometry.ts, field/) or in an operators-internal module, never in a second package.
- @node-td/render-web imports only @node-td/kernel. Nothing in kernel, operators or patches imports render-web. All canvas and WebGL resource creation, caching and release lives there or in host code.
- @node-td/patches imports only kernel types at runtime. Its tests may import operators and @node-td/testing.
- @node-td/frame depends on kernel, operators and render-web, with react as a peer. It has no Tailwind, React Flow, radix or process.env. The editor attaches through FrameHostContext; frame never imports the editor.
- @node-td/editor may import frame, kernel and operators. apps/examples is the only package that imports editor and patches together.
- Only devDependencies point at @node-td/testing.
- Operators are pure functions of (inputs, params, env values, the rng the kernel hands them). They never mutate inputs or cached outputs, never call Math.random, and never cast env. Environment reads go through declared EnvValues; capabilities (createCanvas) are typed.
- Wire legality is port-type equality, checked by validateGraph inside the CookEngine constructor. An operator's category label must match its primary output type (field→field, image/grid→top, geo2/geo3→sop, palette→chop, camera→comp). A test enforces this.
- The headless CPU cook is the reference behaviour. A GPU path may be enabled only behind a test that proves it matches the CPU path.
- Every patch passes validateGraph and the param lint. A test enforces this.
- Render-level goldens (<id>.render.golden.test.ts snapshots) may change only in a commit labelled as an intended output change. Node-level goldens may be re-pinned only when the render goldens stay byte-identical.
- File moves are `git mv` commits that contain only the move and import-path edits, so git rename detection can carry other branches (including the March WIP) across them. Mass formatting comes last.

## Taxonomy and operator map
FAMILIES. `category` is a label that must match what the operator outputs; a test enforces this. Statements about TouchDesigner are from my own knowledge (no web access).
- FIELD (new): resolution-free scalar functions, a Field2D that carries a FieldExpr AST. TD has no such family; the closest is a Noise or GLSL TOP before rasterisation. The deviation is deliberate, because SOPs sample fields point by point.
- TOP: rasterised 2D data and images, i.e. rasterisers, renderers and compositing (TD Render TOP, Composite TOP).
- SOP: geometry.
- CHOP: palettes as channel tables (r, g, b per sample). These are today's only CHOP data. Time and animated channels are deferred.
- MAT: holds only diffuse-shade until G1 moves it to SOP. MAT then leaves the union until a line-style material exists.
- COMP: camera objects (TD Camera COMP). A subgraph Base COMP is deferred.
- ROP: removed (Houdini's term).

WIRE DATA TYPES (PortType → value):
- field → Field2D.
- image → Buffer2D for display, RGBA or mono. Producers: field-render, stroke-renderer, composite. Consumers: composite and the hosts.
- grid → Buffer2D data grid, angle in radians. grid-sampler → flow-tracer.
- geo2 / geo3 → Geometry<2> / Geometry<3>.
- palette → Palette, colour table only. After G1, per-vertex colour moves to a Geometry.colors array alongside Geometry.normals.
- camera2d → Camera2D.
- camera3d → Camera3D.
- number → width and height only, from the declared $env source.
- Removed: buffer, geometry, camera, signal. Port names such as "buffer" and "geometry" stay unchanged, so patch wires do not change.

OPERATOR MAP: old packages/engine/src/operators/... → new packages/operators/src/... [category]. Ids are unchanged except where noted.
TOP → FIELD:
- top/perlin-noise → field/perlin-noise [field]; its pnoise moves to kernel/src/field/noise.ts.
- top/simplex-noise → field/simplex-noise [field]; its simplex2 moves to kernel noise.
- top/field/fbm → field/fbm [field].
- top/field/domain-warp → field/domain-warp [field].
- top/field/field-math → field/field-math [field].
- top/field/field-remap → field/field-remap [field].
- top/field/field-gradient → field/field-gradient [field].
- top/field/curl-noise → field/curl-angle [field]; id becomes curl-angle in K4, since it generates no noise and no remaining patch uses it.
TOP → TOP:
- top/field-render → top/field-render [top], outputs image, CPU only.
- top/grid-sampler → top/grid-sampler [top], outputs grid, CPU only.
SOP:
- sop/poisson-disc, circle-pack, binary-subdivide, quadtree-subdivide, parametric-surface, flow-tracer (input grid), dash-stroke, transform-2d, merge → sop/<same> [sop], all geo2. circle-pack is kept: folding it into poisson-disc would change flow-field. Renaming parametric-surface to TD's Grid is deferred.
- sop/continuous-stroke → DELETED. It is an identity; C6 removes it from patches by rewiring.
- sop/surface-lift (geo2→geo3), geometric-normal (geo3), surface-raymarch (geo2 out) → sop/heightfield/<same> [sop].
- sop/project-3d (geo3→geo2), visibility-cull (geo3) → sop/camera/<same> [sop].
- sop/base-outline, contour-ring (geo3) → sop/subscapes/<same> [sop].
- sop/point-orient → sop/meridian/point-orient [sop].
MAT:
- mat/procedural-palette, oklab-palette, contrast-filter → chop/<same> [chop].
- mat/diffuse-shade → mat/diffuse-shade [mat]; G1 moves it to sop/diffuse-shade [sop], geo3 in → geo3 with colors out.
ROP:
- rop/camera-2d, camera-3d → comp/<same> [comp].
- rop/stroke-renderer → top/stroke-renderer [top], the Render TOP equivalent.
- rop/composite → top/composite [top], mode becomes an enum.
- rop/point-renderer → DELETED: no patch uses it, it duplicates stroke-renderer's point mode, and it cannot be composited.
Barrels and placeholders:
- chop/index.ts placeholder and the six per-family barrels plus operators/index.ts → DELETED.
- operators/src/index.ts becomes the single list.

NON-OPERATOR MAP:
- packages/engine/src/kernel/{types,graph,cook,registry,rng}.ts → packages/kernel/src/<same>.ts.
- kernel/field-expr.ts → kernel/src/field/expr.ts.
- kernel/field-compiler.ts → kernel/src/field/glsl.ts.
- src/noise-utils.ts plus pnoise and simplex2 → kernel/src/field/noise.ts.
- src/render/{canvas-2d,webgl,index}.ts → packages/render-web/src/.
- src/patches/{meridian,subscapes-terrain-3d,terrain-heightmap,simplex-field,flow-field,index}.ts → packages/patches/src/. The two debug patch files are deleted.
- src/editor/{types,index}.ts → packages/frame/src/editor/graph-adapter.ts in C5b, then packages/editor/src/graph-adapter.ts in C7.
- src/index.ts is split: kernel API → kernel/src/index.ts, field builders → kernel/src/field/index.ts, allOperators and createDefaultRegistry → operators/src/index.ts. The meridianGraph root export is dropped.

## Deletions
- packages/engine/src/patches/subscapes-debug.ts: 3 debug graphs (215 lines) from a bisection that commit ea49108 closed. Nothing imports them, and they hold out-of-range params.
- packages/engine/src/patches/subscapes-phase2-debug.ts: 6 debug graphs (383 lines) from a comparison that was settled. Nothing imports them. Git keeps them.
- packages/engine/src/operators/{top/index.ts,top/field/index.ts,sop/index.ts,mat/index.ts,rop/index.ts,chop/index.ts}: Per-family barrels that nothing imports. They have drifted: sop lacks surface-lift and project-3d, rop lacks camera-3d. chop is a placeholder comment.
- packages/engine/src/operators/index.ts and the engine package.json "./operators" export: No consumer. It is a third copy of the operator list. Replaced by packages/operators/src/index.ts.
- packages/engine/src/operators/rop/point-renderer.ts: No patch uses it. It duplicates stroke-renderer's camera, background and readback code, and it cannot be layered (no _canvas, always an opaque background).
- packages/engine/src/operators/sop/continuous-stroke.ts: Identity pass-through. C6 rewires the two patches that use it; render output stays identical.
- packages/engine/src/noise-utils.ts: Folded into kernel/src/field/noise.ts together with pnoise and simplex2, which breaks the kernel→operators import cycle.
- packages/engine/src/kernel/graph.ts terminalOutputs/findTerminalOutput: They duplicate CookEngine.findTerminalOutput and have no caller.
- packages/engine/src/kernel/types.ts Signal, PortType 'signal', Operator.shader, Palette.weights; kernel/registry.ts listByCategory; kernel/rng.ts fork: Declared or written but never read. fork also depends on how many draws have been made, so it is not a pure function.
- packages/engine/src/editor/types.ts EditorGraph, inferEnvPortType; editor/index.ts PortDef re-export: Unused type; a function whose two branches both return 'number'; a duplicate export.
- grid-sampler.ts and field-render.ts GPU branches; frame.tsx getSharedGL/_gl; editor-preview.tsx makeGL/_gl: These branches use different noise and coordinates from the CPU path. compileField hangs on fbm. Per-cook WebGL contexts leak. Their results depend on viewport width. With these removed, the CPU path is the only behaviour.
- packages/engine/src/render/canvas-2d.ts drawCanvas2D and the geometry-terminal fallbacks in frame.tsx and editor-preview.tsx: A legacy copy of stroke-renderer's stroke mode. No patch reaches it, and the editor cannot build graphs that would.
- tsconfig.json (root): Its extends cannot resolve (TS6053), and nothing runs tsc -b. Each package's own tsconfig does the real work.
- packages/engine/turbo.json: Tags copied verbatim from the lightfast repo, with no rules behind them. Replaced by real layer tags in C5b.
- packages/engine (the package itself, after C5b): Its content moves to kernel, operators, render-web, patches and frame/editor. There is no facade, because each consumer imports the layer it needs.
- apps/examples devDependencies nitro and @tanstack/router-plugin: Never referenced. nitro makes turbo detect the wrong framework and requires vite 7.
- .gitignore entries bun.lock, .nitro/, .vinxi/, **/routeTree.gen.ts: The lockfile and the generated route tree are committed. The vinxi and nitro leftovers do not apply.
- packages/frame/src/frame-shell.tsx process.env.NODE_ENV gate and @types/node in frame/editor: Replaced by an explicit `enabled` prop that the app sets with import.meta.env.DEV.
- packages/frame/src/ui/button.tsx unused variants (default, destructive, outline, secondary, link, sizes, asChild/Slot): Only ghost/sm is used. Trim it when ui/ moves to the editor package.

## Done checks (whole refactor)
- `bun install --frozen-lockfile` exits 0, and bun.lock, bunfig.toml and apps/examples/src/routeTree.gen.ts are tracked.
- `./node_modules/.bin/turbo run typecheck test` exits 0 for every package. Before E1, `./node_modules/.bin/biome lint .` exits 0; from E1 on, `./node_modules/.bin/biome check .` exits 0.
- `./node_modules/.bin/turbo boundaries` reports no issues, and `./node_modules/.bin/tsc --noEmit -p packages/kernel` passes with lib ES2022 only (no DOM).
- The render-tier goldens (packages/patches/src/__snapshots__/*.render.golden.test.ts.snap) are byte-identical to the S3 baseline, except in the commits labelled as intended output changes (B1 for Meridian above 256 px, B2 for Subscapes boundary normals).
- The property test 'incremental cook equals full cook' passes for all five gallery patches, and no `test.failing` remains in packages/kernel.
- Every patch passes validateGraph and the param lint inside the CookEngine constructor.
- `grep -rnE 'Math\.random|_canvas = undefined|env as Record|as GraphEnv|_gl|params\.[A-Za-z0-9]+ \?\?' packages/operators/src` prints nothing.
- packages/frame/package.json has no Tailwind, React Flow or radix dependency. The built example CSS contains the editor's classes, and the production client bundle contains no react-flow code.
- `bun run --cwd apps/examples build` succeeds, and the gallery is driven by the @node-td/patches registry.

## Deferred
- Per-node RNG seeds (TouchDesigner's per-operator Seed). Every random patch would get a different composition, so this waits for a deliberate recalibration with reference images. K2's stream replay already makes cooks deterministic.
- Resolution-independent world units. Today spatial params are in pixels: noiseScale per pixel, minRadius, stepLength, lineWidth, raymarch amplitude, and $env.height wired into 'width' to fake a square scene. Converting them changes every patch at sizes other than the calibrated one and needs reference renders and the owner's fidelity target.
- Seeded and offset noise operators (a seed-permuted table or a domain offset). This changes every noise field, so it is done together with per-node seeds.
- A GPU field rasterizer as an injected capability. It needs CPU/GPU noise parity, a uDomain mapping, float targets and a conformance test against evalExpr before it can be turned on. The March WIP's GPUBuffer2D, renderFieldToTexture, TexturePool and blitTextureToCanvas would land in render-web as a Buffer2D backing owned by the engine.
- An output retention and resource-lifecycle policy, then a persistent Frame cache with incremental cooks and a shared CookScheduler (the WIP's cookIncremental is built on K1's cookNode). Today's memory comes from eager Float32 readback; keep Frame's clearCache until this policy exists, so memory does not grow.
- A Buffer2D storage type per use (Uint8 RGBA or lazy canvas/texture for images, Float32 for grids) and lazy readback. This belongs with the lifecycle work, because a lazy readback alone keeps canvases alive.
- Field JIT (the WIP's field-jit.ts). Add it as kernel/src/field/jit.ts behind a JIT-versus-evalExpr conformance test, with lazy compilation and memoised subexpressions so code size does not blow up.
- A pull-based cook(targets), an explicit Graph output or display flag, and a node bypass flag. These matter once the editor can view intermediate nodes. All current patches have exactly one terminal.
- COMP subgraphs, patch-level exposed parameters, and parameter references or bindings replacing $env and the amplitude/baseY copies. Also move base-outline, contour-ring and point-orient into patch-local COMPs. Do this once a second artwork shares a sub-network.
- A CHOP time/frame clock and animated channels. The target works are static prints, so nothing needs them yet.
- Camera3D as plain data plus a kernel vec3/mat4 module, so visibility-cull can use the exact eye direction. Current patches use a diagonal orthographic eye, so the guess is right today.
- Split stroke-renderer into a render TOP, a constant/background TOP and a line-style MAT.
- Rename operator ids to TouchDesigner names (Grid, Sprinkle, and so on). It is churn in patches with no behaviour gain.
- Art-changing operator fixes:
- surface-raymarch penetration and AO;
- the flow-tracer versus grid-sampler cell-size mismatch, plus bilinear sampling and RK2 integration;
- poisson-disc partition density having no effect, and seeds in the margin;
- hard-coded visible tile edges in base-outline and contour-ring;
- field-render's scale param.
Each changes a finished artwork, so they wait for a reference image and the owner's fidelity decision.
- Performance work: visibility-cull is O(T²), and the CPU field interpreter could use constant folding and shared subexpressions. Neither is a correctness issue.
- A Vite 7 bump to match TanStack Start's peer range, and SPA or prerender mode. Both need registry access, which this sandbox lacks.
- An examples dev harness (a route per patch, seed and size controls, a stats overlay, reference image side by side). It is a feature, not part of the refactor.
- Graph editing in the editor (connect, delete, persisted layout). The canvas is read-only after C8.

## Open questions
- The main checkout holds about 650 lines of uncommitted March 2026 work that is not this thread's to commit. It touches kernel/cook.ts, kernel/types.ts, render/webgl.ts, render/canvas-2d.ts and frame.tsx, adds field-jit.ts, scheduler.ts and texture-pool.ts, and copies the patches into the app. Will it be committed to its own branch before C5a moves those files? Git can then follow the renames when it is rebased. Or should the plan treat it only as a source of ideas? The final mass format (E1) waits for this answer.
- What is the fidelity reference for the two artworks? The plan pins today's output and changes it only to fix a blank Meridian (B1) and boundary normals (B2). Subscapes currently uses debug values that disagree with its own comments: power 2.0 against 4.5, orthoSize 0.93 against 1.61, 7 steps against 4+4, and light effectively from below. Is there a reference image, token hash or source script the deferred recalibration should match, and may the values in the comments replace the current look?
- The engine's FSL-1.1-Apache-2.0 licence was replaced by MIT in two agent commits that give no reason. Is MIT intended for this code, which came from the Lightfast repository?
- E3 adds a GitHub Actions workflow that runs on every pull request. That is a new trigger. May it be pushed?
