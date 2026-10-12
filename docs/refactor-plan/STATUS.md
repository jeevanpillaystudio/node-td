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

## Where it stands (12 Oct 2026, after batch 2)

| Item | State |
| --- | --- |
| T1 tooling baseline | done, reviewed |
| S1 headless test harness | done, reviewed |
| S2 kernel tests | done, reviewed |
| S3 golden baseline (patches + every operator) | done, reviewed |
| T2 dependency trim, exact pins, typechecked tests, isolated linker | done, reviewed |
| C1 dead code deleted | done, reviewed |
| C2 noise moved into the kernel | done, reviewed |
| C3 CPU-only field path | done, reviewed |
| C4 immutable cook outputs | done, reviewed |
| everything else | not started |

At this point `bun test` (348 pass), `turbo run typecheck test`, `biome lint .`
and the examples build pass; render goldens are unchanged since the baseline
(only point-renderer's own operator snapshot was removed, on purpose).

## Next

Owner: the agent resuming this branch. Run the orchestrator batch by batch:

1. C5a, C5b, K3, C6, C7 (package split, patches registry, frame/editor split).
2. K1, C8, K2, K4, K5, K6a, K6b, G1 (kernel semantics, taxonomy, typed ops).
3. B1, B2, B3, E2, E1 (labelled output changes, bug fixes, docs, format pass).
4. E3 (CI workflow): commit, but push only on Jeevan's go-ahead, because it
   adds a pull-request trigger.

Briefs carry notes added after each batch at the end of their overrides.

Merging pull request #1 waits for Jeevan. The open questions at the end of
`context.md` (uncommitted March work in the main checkout, fidelity reference,
licence) are his.
