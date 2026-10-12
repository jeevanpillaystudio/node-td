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

## Where it stands (12 Oct 2026, after batch 3)

| Item | State |
| --- | --- |
| T1, S1, S2, S3, T2 tooling and safety net | done, reviewed |
| C1, C2, C3, C4 dead code, kernel noise, CPU-only fields, immutable outputs | done, reviewed |
| C5a @node-td/kernel (no DOM types) and @node-td/testing | done, reviewed |
| C5b operators, render-web, patches; @node-td/engine deleted | done, reviewed |
| K3 compileField terminates, ordered, tested | done, reviewed |
| C6 patches registry drives the gallery; continuous-stroke removed | done, reviewed |
| C7 frame (runtime) split from editor (dev) | done, reviewed |
| everything else | not started |

At this point `turbo run typecheck test` (12 tasks), `bun test` (440 pass),
`biome lint .`, `turbo boundaries` and the examples build pass; the five
render goldens are byte-identical to the baseline.

## Next

Owner: the agent resuming this branch. Run the orchestrator batch by batch:

1. K1, C8, K2, K4, K5, K6a, K6b, G1 (kernel semantics, taxonomy, typed ops).
2. B1, B2, B3, E2, E1 (labelled output changes, bug fixes, docs, format pass).
3. E3 (CI workflow): commit, but push only on Jeevan's go-ahead, because it
   adds a pull-request trigger.
4. After pull request #1: the review phase in `next-phase.md` (performance
   review with node viewers, and a per-operator review), on a new branch.

Briefs carry notes added after each batch at the end of their overrides.

Merging pull request #1 waits for Jeevan. The open questions at the end of
`context.md` (uncommitted March work in the main checkout, fidelity reference,
licence) are his.
