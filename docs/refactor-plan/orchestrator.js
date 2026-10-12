export const meta = {
  name: 'node-td-refactor-exec',
  description: 'Execute node-td refactor work items in order: implement with small commits, review through two independent lenses, repair once, stop on failure',
  phases: [
    { title: 'Implement', detail: 'one agent per work item, commits on the branch' },
    { title: 'Review', detail: 'behaviour-preservation and plan-conformance reviewers per item' },
    { title: 'Repair', detail: 'one repair round when a reviewer finds a blocker or major problem' },
    { title: 'Checkpoint', detail: 'run the whole-repo checks after the batch' },
  ],
}

const ITEMS = args.items
const BATCH = args.title || 'batch'

const MAX_CONCURRENT = 2
let active = 0
const waiters = []
async function acquire() {
  if (active < MAX_CONCURRENT) { active++; return }
  await new Promise(r => waiters.push(r))
  active++
}
function release() { active--; const n = waiters.shift(); if (n) n() }
async function sleep(ms) { if (typeof setTimeout === 'function') await new Promise(r => setTimeout(r, ms)) }
async function run(prompt, opts) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await acquire()
    let r = null
    try { r = await agent(prompt, attempt ? { ...opts, label: `${opts.label}#${attempt}` } : opts) } finally { release() }
    if (r) return r
    log(`${opts.label}: no result (attempt ${attempt + 1}), backing off`)
    await sleep(60000 * (attempt + 1))
  }
  return null
}

const ROOT = '/Users/jeevanpillay/Code/@jeevanpillaystudios/node-td/.claude/worktrees/touchdesigner-monorepo-refactor-6d0a2d'
const MAIN = '/Users/jeevanpillay/Code/@jeevanpillaystudios/node-td'
const AUDIT = '/Users/jeevanpillay/Code/@jeevanpillaystudios/node-td/.claude/worktrees/touchdesigner-monorepo-refactor-6d0a2d/docs/refactor-plan'

const SHARED = `
You are working on node-td, a bun + turbo + biome TypeScript monorepo for a TouchDesigner-style generative node engine (operators reverse-engineered from Matt DesLauriers' artworks Meridian and Subscapes). A verified audit produced an ordered refactor plan; you execute or review one work item of it.

Where things are:
- Repository root (a git worktree; always work here, with absolute paths): ${ROOT}. Branch: claude/touchdesigner-monorepo-refactor-6d0a2d.
- Your work item brief: ${AUDIT}/items/<ID>.md. Shared context (diagnosis, target layout, layering rules, taxonomy/operator map, deletions, done checks, deferred list, open questions): ${AUDIT}/context.md. Full audit findings keyed "subsystem/id" (the brief's "Findings addressed"): ${AUDIT}/findings.json — e.g. \`bun -e 'const f=require("${AUDIT}/findings.json"); console.log(JSON.stringify(f["kernel/some-id"],null,1))'\`.
- The plan was written before earlier items ran. Earlier items may have moved files or changed line numbers. Adapt to the tree as it is now (\`git log --oneline 22fd93a..HEAD\` shows what earlier items did). If a step is already done or no longer applies, skip it and say so.
- "Orchestrator overrides" in a brief win over its steps.

Environment facts (tested; trust them):
- Network: the npm registry is reachable (since 12 Oct). GitHub is reachable, but you must never push, open pull requests or call GitHub; the orchestrator does that. Telemetry hosts are blocked.
- bun 1.3.9 is on PATH. Every bun install/add/remove must run with writable temp and cache dirs: \`BUN_TMPDIR=$TMPDIR BUN_INSTALL_CACHE_DIR=$TMPDIR/bun-cache bun install\` (TMPDIR is /tmp/claude-501). Add an external dependency only when your brief calls for it, and commit bun.lock together with the package.json change. If the registry turns out unreachable, fall back to hand-editing bun.lock (workspaces section entries; "packages" entries like \`"@node-td/x": ["@node-td/x@workspace:packages/x"],\`) plus \`--frozen-lockfile\`.
- Linker: whatever bunfig.toml says (work item T2 decides whether to adopt bun's isolated linker). Do not change it outside T2.
- Tools: ./node_modules/.bin/tsc, ./node_modules/.bin/biome (2.4.9), ./node_modules/.bin/turbo (2.8.21; prefix with TURBO_TELEMETRY_DISABLED=1; an "IO error: Operation not permitted" warning from turbo is harmless). Tests: \`bun test <path>\` (bun:test, toMatchSnapshot writes __snapshots__/<file>.snap next to the test). The examples app builds with \`bun run --cwd apps/examples build\`.
- Never try to delete node_modules (the sandbox blocks some paths inside it). Ignore the stray directory .tmp-linktest/ (gitignored scratch).
- No browser testing is needed. If you ever do browser checks, never use Google Chrome.
- The main checkout at ${MAIN} has someone else's uncommitted work. Never read-modify-write anything there; never touch its files.

Rules for changes:
- Commit your own work in small commits, staging by explicit path (\`git add <paths>\`, or \`git add -A <dir>\` for a directory you own in this item). Never \`git add -A\` / \`git add .\` at the root. Use \`git mv\` for moves, in commits that contain only the move and import-path edits.
- Commit messages: conventional style (feat/fix/refactor/chore/test/docs/style), descriptive, no plan item ids. End every commit message with a blank line then exactly: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- Never amend, rebase, reset, stash, or push. Never commit to any other branch.
- Golden snapshots (*.golden.test.ts snapshots, once they exist): never run bun test with -u / --update-snapshots unless your brief explicitly re-pins them, and then only in the commit and with the label the brief names. A snapshot changing unexpectedly is a regression in your change — fix the code, not the snapshot.
- Do not touch LICENSE, .claude/, .github/, or docs/refactor-plan/ (the orchestrator keeps that folder).
- Match surrounding code style and comment density. Prefer moving and deleting over rewriting.
`

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    startSha: { type: 'string' },
    endSha: { type: 'string' },
    commits: { type: 'array', items: { type: 'object', properties: { sha: { type: 'string' }, subject: { type: 'string' } }, required: ['sha', 'subject'] } },
    verification: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, exitCode: { type: 'number' }, summary: { type: 'string' } }, required: ['command', 'exitCode', 'summary'] } },
    deviations: { type: 'array', items: { type: 'string' }, description: 'Where you departed from the brief and why' },
    deferred: { type: 'array', items: { type: 'string' }, description: 'Anything in scope you could not do, with reason' },
    notes: { type: 'string', description: 'Facts the next items need (new paths, gotchas)' },
  },
  required: ['status', 'startSha', 'endSha', 'commits', 'verification', 'deviations', 'deferred', 'notes'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean', description: 'false if any blocker or major problem' },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          what: { type: 'string' },
          where: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'what', 'where', 'fix'],
      },
    },
    checksRun: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
  },
  required: ['pass', 'problems', 'checksRun'],
}

const LENSES = [
  {
    key: 'behaviour',
    text: `Lens: BEHAVIOUR PRESERVATION. Your job is to find any way this item changed what the code does that the brief did not intend. Check: every verification command in the brief (run them all); \`bun test\` across the repo passes; golden snapshot files are byte-identical to before the item unless the brief explicitly re-pins (\`git diff <startSha> HEAD --stat -- ':(glob)**/__snapshots__/**'\`); moves are real renames (\`git show -M --stat\`) with no hidden logic edits in move commits; deleted code truly had no callers (grep); typecheck of every package (TURBO_TELEMETRY_DISABLED=1 ./node_modules/.bin/turbo run typecheck); the examples app still builds. Read the diff (\`git diff <startSha> HEAD\`) line by line for semantic changes.`,
  },
  {
    key: 'conformance',
    text: `Lens: PLAN CONFORMANCE AND QUALITY. Your job is to check the item achieved its goal fully and cleanly. Check: every step of the brief is done or its skip is justified; the result matches the target layout, layering rules and taxonomy in context.md; nothing out of scope was changed without being listed as a deviation; commits are small, staged by path, conventionally named, end with the Co-Authored-By line, and no stray files were committed (\`git show --stat <each commit>\`); no leftover dead code, TODOs, debug output, or half-renamed identifiers; new code reads like the surrounding code; package.json/tsconfig/turbo/biome configs are coherent; \`./node_modules/.bin/biome lint .\` (or \`biome check .\` once the format commit exists) passes; \`git status --porcelain\` is clean.`,
  },
]

function implPrompt(id) {
  return `${SHARED}

Your task: implement work item ${id}. Read ${AUDIT}/items/${id}.md and ${AUDIT}/context.md first, and look up the findings it addresses when you need detail.

Procedure:
1. Record startSha = \`git rev-parse HEAD\`. Check \`git status --porcelain\` is empty; if not, stop with status "blocked" and say what is dirty.
2. Do the steps, committing as you go.
3. Run every verification command in the brief, plus \`bun test\` at the repo root and \`TURBO_TELEMETRY_DISABLED=1 ./node_modules/.bin/turbo run typecheck\`. Fix what fails. Report each command with its exit code.
4. End with a clean \`git status --porcelain\`. Record endSha.
Return status "done" only if every verification passes. Use "partial" if some step had to be deferred but the tree is consistent and green; "blocked" if you could not leave it green (then explain exactly what is broken).`
}

function reviewPrompt(id, impl, lens) {
  return `${SHARED}

You are an independent reviewer of work item ${id}. You did not write it. Be skeptical: default to reporting a problem when unsure, but only report problems you verified in the code or by running a command. You may run any read-only command and tests. Never run git checkout, switch, reset, restore or stash: to look at an older commit use \`git show <sha>:<path>\`, or \`git worktree add --detach $TMPDIR/<name> <sha>\` and remove it with \`git worktree remove\` when done. Do NOT modify, stage or commit anything; if a command writes files (e.g. a snapshot appearing), restore them with \`git restore -- <path>\` (the one git command allowed for this) / delete the new untracked file before you finish, and report it as a problem.

${lens.text}

Brief: ${AUDIT}/items/${id}.md. Context: ${AUDIT}/context.md.
The implementer reported (treat as claims to check, not facts):
${JSON.stringify(impl, null, 1)}

Severity guide: blocker = broken build/tests, regression, data loss, wrong behaviour; major = goal not met, a required step missing, layering/taxonomy violated, unintended snapshot change, wrong files committed; minor = style or polish. pass=false iff any blocker or major.`
}

function fixPrompt(id, impl, problems) {
  return `${SHARED}

Work item ${id} was implemented (report below) and independent reviewers found problems. Fix every blocker and major problem with NEW commits (do not amend or rewrite history). Fix minor problems too when cheap and in scope. If you judge a reported problem wrong, do not change code for it; explain why in deviations. Then rerun the brief's verification commands, \`bun test\` at the root and the typecheck, and leave \`git status --porcelain\` clean.

Brief: ${AUDIT}/items/${id}.md. Context: ${AUDIT}/context.md.
Implementer report:
${JSON.stringify(impl, null, 1)}

Problems:
${JSON.stringify(problems, null, 1)}

Return the same report shape: startSha = HEAD before your fixes, endSha = HEAD after, commits = your fix commits only.`
}

async function review(id, impl, phaseName) {
  const verdicts = await parallel(LENSES.map(l => () =>
    run(reviewPrompt(id, impl, l), { label: `review:${id}:${l.key}`, phase: phaseName, schema: REVIEW_SCHEMA })))
  const ok = verdicts.filter(Boolean)
  if (ok.length < LENSES.length) log(`${id}: ${LENSES.length - ok.length} reviewer(s) returned nothing`)
  const problems = ok.flatMap((v, i) => v.problems.map(p => ({ ...p, lens: LENSES[i] ? LENSES[i].key : '?' })))
  const blocking = problems.filter(p => p.severity !== 'minor')
  return { pass: ok.length > 0 && blocking.length === 0, problems, blocking }
}

const report = []
let stopped = null
for (const id of ITEMS) {
  phase('Implement')
  const impl = await run(implPrompt(id), { label: `impl:${id}`, phase: 'Implement', schema: IMPL_SCHEMA })
  if (!impl) { stopped = `${id}: implementer returned nothing`; log(stopped); break }
  log(`${id}: ${impl.status}, ${impl.commits.length} commits`)
  if (impl.status === 'blocked') { report.push({ id, impl }); stopped = `${id}: blocked`; break }

  let rev = await review(id, impl, 'Review')
  let fix = null
  let rev2 = null
  if (!rev.pass) {
    log(`${id}: ${rev.blocking.length} blocking problem(s); repairing`)
    fix = await run(fixPrompt(id, impl, rev.problems), { label: `fix:${id}`, phase: 'Repair', schema: IMPL_SCHEMA })
    if (fix) rev2 = await review(id, { original: impl, fix }, 'Repair')
  }
  const passed = rev.pass || (rev2 && rev2.pass)
  report.push({ id, impl, review: rev.problems, fix, review2: rev2 ? rev2.problems : null, passed })
  if (!passed) {
    stopped = `${id}: still failing review after one repair`
    log(stopped)
    break
  }
  log(`${id}: passed review`)
}

phase('Checkpoint')
const checkpoint = await run(`${SHARED}

Batch "${BATCH}" of the refactor has run (items: ${ITEMS.join(', ')}${stopped ? `; stopped early: ${stopped}` : ''}). Read-only checkpoint: do not modify or commit anything (restore any file a command writes).
Run and report: \`git log --oneline 22fd93a..HEAD\`; \`git status --porcelain\`; \`BUN_TMPDIR=$TMPDIR bun install --frozen-lockfile\`; \`TURBO_TELEMETRY_DISABLED=1 ./node_modules/.bin/turbo run typecheck test\`; \`bun test\`; \`./node_modules/.bin/biome lint .\`; \`bun run --cwd apps/examples build\`; and every done check in ${AUDIT}/context.md that is already applicable at this point (say which are not yet applicable). Then list, in plain words, anything in the repository that is now inconsistent or half-done (e.g. README describing a layout that no longer exists), so the next batch can pick it up.`, {
  label: 'checkpoint', phase: 'Checkpoint',
  schema: {
    type: 'object',
    properties: {
      green: { type: 'boolean' },
      commands: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, exitCode: { type: 'number' }, summary: { type: 'string' } }, required: ['command', 'exitCode', 'summary'] } },
      doneChecks: { type: 'array', items: { type: 'object', properties: { check: { type: 'string' }, state: { type: 'string', enum: ['pass', 'fail', 'not-yet-applicable'] }, note: { type: 'string' } }, required: ['check', 'state', 'note'] } },
      inconsistencies: { type: 'array', items: { type: 'string' } },
    },
    required: ['green', 'commands', 'doneChecks', 'inconsistencies'],
  },
})

return { batch: BATCH, stopped, report, checkpoint }
