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

## Where it stands (12 Oct 2026)

| Item | State |
| --- | --- |
| T1 tooling baseline | done, reviewed |
| S1 headless test harness | done, reviewed |
| S2 kernel tests | done, reviewed |
| S3 golden baseline (patches + every operator) | done, reviewed |
| T2 dependency trim and pins | partial, not reviewed: unused examples devDependencies removed and toolchain pinned exactly. Still owed: `@types/bun` and typechecked tests (fix the strict-mode error in `cook.test.ts`), the isolated-linker trial |
| everything else | not started |

At this point `bun test` (347 pass), `turbo run typecheck` and `biome lint .`
pass, and the tree is clean.

## Next

Owner: the agent resuming this branch.

1. Finish T2, then have it reviewed (run the orchestrator with `items: ["T2"]`;
   its implementer adapts to the two commits already made).
2. C1, C2, C3, C4 (dead code, noise into the kernel, CPU-only fields,
   immutable outputs).
3. C5a, C5b, K3, C6, C7 (package split, patches registry, frame/editor split).
4. K1, C8, K2, K4, K5, K6a, K6b, G1 (kernel semantics, taxonomy, typed ops).
5. B1, B2, B3, E2, E1 (labelled output changes, bug fixes, docs, format pass).
6. E3 (CI workflow): commit, but push only on Jeevan's go-ahead, because it
   adds a pull-request trigger.

Merging pull request #1 waits for Jeevan. The open questions at the end of
`context.md` (uncommitted March work in the main checkout, fidelity reference,
licence) are his.
