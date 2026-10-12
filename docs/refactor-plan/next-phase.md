# After the refactor: performance review and node viewers

Jeevan, 12 Oct 2026: "once this is done we need a full performance review. note: we are designing touchdesigner-like ui. the graph node editor needs to feel smooth and efficient. we only need to show the final artwork in preview. but in graph view, we should be able to see each of the artwork during each combination similar to touchdesigner."

Builder's reading: gallery/preview shows only the terminal image; the graph editor shows a live viewer on every node (TouchDesigner node viewers), rendered from that node's cached output, and stays smooth while params change.

To carry into docs/roadmap.md (E2) and the performance review (new branch after PR #1):
- Measure: headless per-patch full cook and per-param incremental cook times per operator; memory; browser frame time, React Flow pan/zoom/drag with all nodes showing viewers, slider-to-pixels latency.
- Known suspects from the audit: CPU field interpreter cost per pixel; visibility-cull O(T^2); eager Float32 readback; Frame clearCache after every draw; cooking on the main thread; no output retention policy; deferred GPU field rasterizer.
- Viewers need: per-type thumbnail renderers (field, image, grid, geo2, geo3, palette, camera); every intermediate output retained; cook only what is displayed (pull-based cook(targets)); off-main-thread cooking; throttled, visible-only thumbnail updates.

## Per-operator review

Jeevan, 12 Oct 2026: "i think we should also review each of the node's idenpendantly to find any bugs and/or to generalise them more like touchdesigner — the most primitive component to do something"

Builder's reading: after the refactor lands, review every operator on its own: (1) bugs, each proven by a failing test before a fix; (2) is it the most primitive form, or a patch-specific bundle that should be split into TouchDesigner-style primitives (e.g. a TD equivalent exists: Noise TOP, Grid SOP, Sprinkle SOP, Transform SOP, Merge SOP, Camera COMP, Render TOP, Composite TOP, Lookup TOP/CHOP), or generalised (params instead of hard-coded values). Output: a primitive operator catalog and a migration plan where each artwork is rebuilt from primitives and its render goldens stay byte-identical, or change only in labelled commits.

Order: run it together with the performance review as one review phase (a per-operator lens and a performance lens, each operator reviewed once by each, adversarially verified), then one synthesis that designs the primitive catalog, the node-viewer architecture and the perf fixes together, because they constrain each other (e.g. a finer-grained graph means more nodes to cook and more viewers to draw).
