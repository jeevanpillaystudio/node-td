# Roadmap

What is still owed after the refactor (pull request #1), each with its next
step. The refactor's plan lived in `docs/refactor-plan/`, deleted with this
file's first version; git keeps it.

## v0.1: a working node-td

Jeevan, 12 Oct 2026: "Can you define to me when you think you'll be done with
all this work? ANd what the definition of done is? We don't need it perfect
but a somewhat working version of node-td is needed."

Done means, on a Mac (the agent's definition, given to him that day):

1. `bun run dev` opens the editor, and a picker loads any gallery patch.
2. The preview shows only the final artwork; every node in the graph shows
   its own output live, as TouchDesigner's node viewers do: images, drawn
   geometry, palette swatches, a heat map for fields.
3. Changing a param updates the artwork and the affected viewers without a
   visible stall: under about 50 ms at 800 px, re-cooking only what changed.
4. Nodes can be added from the operator list, wired and unwired (a wire of
   the wrong type is refused) and deleted, and the picture follows.
5. Every gallery patch draws a full picture at 256, 400, 800 and 640 × 400.
6. Typecheck, tests, lint, boundaries and the examples build pass in CI.

Not in v0.1: saving and loading files, undo, a GPU path, new operators, and
the artistic questions below.

Next step: after pull request #1 merges, the review phase below, then the
editor work on a new branch.

## Performance review and node viewers

Jeevan, 12 Oct 2026: "once this is done we need a full performance review.
note: we are designing touchdesigner-like ui. the graph node editor needs to
feel smooth and efficient. we only need to show the final artwork in
preview. but in graph view, we should be able to see each of the artwork
during each combination similar to touchdesigner."

- Measure first: full and incremental cook time per patch and per operator,
  memory, and in the browser the frame time with every viewer showing and
  the delay from a slider to pixels.
- Known suspects: the CPU field interpreter per pixel; visibility-cull is
  O(T²); eager Float32 readback; Frame clears its cache after every draw;
  cooking on the main thread; no output retention policy.
- Viewers need: a thumbnail renderer per port type (field, image, grid,
  geo2, geo3, palette, camera); intermediate outputs kept; a pull-based
  `cook(targets)` that cooks only what is shown; cooking off the main
  thread; updates throttled and limited to visible nodes.

## Per-operator review

Jeevan, 12 Oct 2026: "i think we should also review each of the node's
idenpendantly to find any bugs and/or to generalise them more like
touchdesigner — the most primitive component to do something"

Review every operator on its own: bugs, each proven by a failing test before
its fix; and whether it is the most primitive form or a patch-specific bundle
to split into TouchDesigner-style primitives (Noise TOP, Grid SOP, Sprinkle
SOP, Transform SOP, Merge SOP, Camera COMP, Render TOP, Composite TOP, Lookup
TOP/CHOP), or to generalise with params. Output: a primitive operator
catalog, and a plan that rebuilds each artwork from primitives with its
render goldens unchanged or changed only in labelled commits. Run it with
the performance review as one phase, and design the catalog, the viewers and
the performance fixes together, since each constrains the others.

Owed from the bug fixes on pull request #1: composite blends on the canvas
when every layer carries a canvas, and on the CPU otherwise. The CPU blend
is tested against worked values; the canvas blend is tested only by the
operations it records, since no canvas that draws runs in the tests. Next:
in the editor, composite the same transparent and semi-transparent layers
both ways and compare the pixels.

## Deferred

- Per-node random seeds, as TouchDesigner's Seed parameter. Every random
  patch would get a new composition. Next: do it with the fidelity
  recalibration, against reference images.
- Seeded or offset noise operators. They change every noise field. Next:
  with per-node seeds.
- Resolution-independent world units: spatial params are pixels today, and
  `$env.height` stands in for a square scene. Next: needs reference renders
  and the fidelity target.
- Art-changing operator fixes: surface-raymarch penetration and AO;
  flow-tracer and grid-sampler cell sizes, bilinear sampling, RK2;
  poisson-disc partition density and seeds in the margin; tile edges baked
  into base-outline and contour-ring; field-render's scale param. Next: one
  labelled output change each, once the fidelity reference exists.
- A GPU field rasterizer as a host capability. Next: CPU/GPU noise parity, a
  domain mapping and float targets, behind a test against `evalExpr`.
- A field JIT (`kernel/src/field/jit.ts`). Next: behind a JIT-versus-
  `evalExpr` test, with lazy compilation and shared subexpressions.
- Output retention, resource lifecycle, a persistent Frame cache and a
  shared cook scheduler; a Buffer2D storage type per use with lazy readback.
  Next: part of the performance review.
- A display flag and a bypass flag on nodes. Next: with the node viewers.
- COMP subgraphs, patch-level exposed params and param references in place
  of `$env` and copied values; base-outline, contour-ring and point-orient
  as patch-local COMPs. Next: when a second artwork shares a sub-network.
- A CHOP time clock and animated channels. Next: when a work needs motion.
- Camera3D as plain data with a kernel vec3/mat4 module, so visibility-cull
  can use the exact eye direction. Next: before any non-diagonal camera.
- stroke-renderer split into a render TOP, a constant TOP and a line-style
  material; operator ids renamed to TouchDesigner's. Next: decide in the
  per-operator review.
- Vite 7 to match TanStack Start's peer range, and SPA or prerender mode.
  Next: try it; the registry is reachable from agent sandboxes, if slowly.

## Open questions (Jeevan's)

- About 650 lines of uncommitted March 2026 work sit in the main checkout
  (field JIT, cook scheduler, texture pool, edits to cook, types and the
  renderers). Commit it to its own branch, or keep it only as a source of
  ideas?
- The fidelity reference for Meridian and Subscapes: is there a reference
  image, token hash or source script? Subscapes uses values its comments
  disagree with (power 2.0 against 4.5, orthoSize 0.93 against 1.61, 7 steps
  against 4 + 4), and its light is below the horizon, so only steep slopes
  catch it. May the commented values, and a light from above, replace the
  current look?
- The engine's FSL-1.1-Apache-2.0 licence was replaced by MIT in two agent
  commits that give no reason. Is MIT intended for code that came from the
  Lightfast repository?
- The CI workflow runs on every pull request, a new trigger: may it be
  pushed?
