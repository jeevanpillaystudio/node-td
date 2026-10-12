# Refactor status

This folder holds the working plan for the monorepo refactor on branch
`claude/touchdesigner-monorepo-refactor-6d0a2d` (pull request #1). It is a
temporary working record: the AGENTS.md / docs/roadmap.md work item (E2)
replaces it and deletes this folder.

- `context.md`: diagnosis, target layout, layering rules, operator taxonomy,
  deletions, done checks, deferred work, open questions.
- `items/<ID>.md`: one brief per work item, in execution order (below).
  "Orchestrator overrides" in a brief win over its steps.
- `findings.json`: the 192 verified audit findings, keyed `subsystem/id`.
- `orchestrator.js`: the workflow script that runs items (implement, two
  reviewers, one repair round, checkpoint). Its "Environment facts" block was
  correct on 12 Oct 2026; recheck registry and GitHub reachability before reuse.
  Pass `{"title": "...", "items": ["C1", ...]}` as its args.

## Where it stands (12 Oct 2026, paused inside batch 4)

| Item | State |
| --- | --- |
| T1, S1, S2, S3, T2 tooling and safety net | done, reviewed |
| C1, C2, C3, C4 dead code, kernel noise, CPU-only fields, immutable outputs | done, reviewed |
| C5a, C5b package split (kernel, testing, operators, render-web, patches) | done, reviewed |
| K3, C6, C7 GLSL emitter, patches registry, frame/editor split | done, reviewed |
| K1 graph validation in the constructor, per-node error isolation | done, reviewed |
| C8 editor adapter: layout, handle ids, read-only canvas, frame/editor boundary tags | done, reviewed |
| K2 typed env, seed on the graph, RNG stream replay (incremental = full cook) | done, reviewed |
| K4 operator families and port types | done, reviewed |
| K5 defineOperator, param lint, widened ranges | done, reviewed |
| K6a defineOperator for field, top, chop, mat, comp; restated defaults gone | done, reviewed by Sol |
| K6b defineOperator for every SOP; restated defaults gone | done, reviewed by Sol |
| G1 colours and attributes on the geometry, kernel geometry helpers, MAT retired | done, reviewed by Sol |
| B1 Meridian raymarch reaches the terrain at every size (labelled output change) | done, reviewed by Sol; one scope finding answered in the brief |
| B2 geometric-normal sign, Subscapes light mirrored (labelled output change) | done, reviewed by Sol; boundary-only check not read by Sol |
| B3, E2, E1, E3 | not started |

At this point `turbo run typecheck test` (12 tasks), `bun test` (517 pass),
`biome lint .`, `turbo boundaries` and the examples build pass; the five
render goldens are byte-identical to the baseline; no `test.failing` remains.

Jeevan paused all work on 12 Oct 2026 while he reworks which agents run which
jobs: "Do not run any extra ultracode/workflow until I lift the restriction."
The batch-4 workflow was stopped after K5's review, before K6a made any change.

Who does what (Jeevan, 12 October 2026, relayed by the session that set it
up): code work runs on Claude Opus 5.5; review and verification run on
GPT-6.1 Sol, which never writes code; Codex is not used. `orchestrator.js`
follows this: implementers and the repair round run on the session's Claude
model, and every review claim and the checkpoint go to Sol through
`sol_check.py` (in the query-v2 worktree `gpt-sol-workflow-integration-4d8903`
until that branch merges), run by a `claude-haiku-5-5` agent that only carries
the claim and the verdict. A single Sol check from this worktree was run on
12 Oct 2026 and passed in 40 s.

Since the restriction holds only workflows, items now run by hand in the
main session (Claude Opus 5.5), with Sol's three claims run through
`sol_check.py` from a shell, and one repair round. K6a ran this way on
12 Oct 2026: Sol's checks found the build, tests, lint, boundaries,
examples build and snapshots green; its one open finding is that the field
commit (7d4e98d) was amended twice before push, against the implementers'
no-amend rule. Work done by hand follows the same shared rules as the
workflow's implementers, including no amend. While Sol checks an item the
worktree stays as it is, with no edit or commit until all three verdicts
are in: a G1 conformance check failed on 12 Oct 2026 because B2 was being
edited under it. Sol reads only inside the worktree, so a check script
written for it goes in `.sol/` (listed in the repository's info/exclude, never
committed) and is run as `bun test ./.sol/<file>`.

After one repair round each, two findings stay open by the rule of one round:
- B1: Sol's checks claim held that the surface-raymarch op-golden re-pins were
  not authorised by the brief; they follow from the change, and the brief now
  says so (behaviour and conformance passed).
- B2: Sol could not read the boundary-only check, which was then outside the
  worktree. It is now `.sol/B2-boundary.test.ts`: before and after draw the
  same polylines at all five golden sizes, and the 9, 23, 121, 23 and 23
  recoloured strokes all start on the grid's edge; with the light left
  unmirrored the same check fails at every size (behaviour passed).

## Next

Owner: the agent resuming this branch, once Jeevan lifts the restriction and
says which agents to use.

1. B3 (operator bug fixes), then E2, E1 (docs, format pass).
2. E3 (CI workflow): commit, but push only on Jeevan's go-ahead, because it
   adds a pull-request trigger.
4. After pull request #1: the review phase in `next-phase.md` (performance
   review with node viewers, and a per-operator review), on a new branch.

Briefs carry notes added after each batch at the end of their overrides.

Merging pull request #1 waits for Jeevan. The open questions at the end of
`context.md` (uncommitted March work in the main checkout, fidelity reference,
licence) are his.
