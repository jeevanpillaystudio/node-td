export const meta = {
  name: 'node-td-refactor-exec',
  description: 'Execute node-td refactor work items in order: implement on Claude with small commits, verify with GPT-6.1 Sol, repair once, stop on failure',
  phases: [
    { title: 'Implement', detail: 'one agent per work item, commits on the branch' },
    { title: 'Review', detail: 'GPT-6.1 Sol checks three claims per item: checks green, behaviour as intended, plan conformance' },
    { title: 'Repair', detail: 'one repair round when a reviewer finds a blocker or major problem' },
    { title: 'Checkpoint', detail: 'GPT-6.1 Sol runs the whole-repo checks after the batch' },
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

// Verification runs on GPT-6.1 Sol, never on Claude, and Sol never writes code
// (Jeevan, 12 October 2026). Sol is reached through sol_check.py: a cheap Claude
// agent runs it and hands back what it printed. Do not set an agent's model to
// 'gpt-6.1-sol': the desktop app drops it and runs Claude instead.
const SOL_CHECK = '/Users/jeevanpillay/Code/@lightfastai/query-v2/.claude/worktrees/gpt-sol-workflow-integration-4d8903/.agents/connectors/sol_check.py'
const SOL_ALLOW = ['Bash(bun test:*)', 'Bash(bun run --cwd apps/examples build:*)', 'Bash(./node_modules/.bin/tsc:*)',
  'Bash(./node_modules/.bin/turbo:*)', 'Bash(./node_modules/.bin/biome lint:*)', 'Bash(./node_modules/.bin/biome check:*)',
  'Bash(TURBO_TELEMETRY_DISABLED=1 ./node_modules/.bin/turbo:*)', 'Bash(git reflog:*)',
  'Bash(grep:*)', 'Bash(rg:*)', 'Bash(ls:*)', 'Bash(wc:*)']
// sol_check.py allows the git commands that only read, except reflog, and
// matches each rule against the start of a command. Seen on 12 October 2026:
// Sol's chained commands and a grep over a {a,b} brace list were refused.

const CLAIMS = [
  {
    key: 'checks',
    text: `Claim: after this item every check is green and the golden snapshots are unchanged. Run every verification command in the brief (skip any bun install; the orchestrator runs installs), plus \`bun test\` at the root, \`./node_modules/.bin/turbo run typecheck test\`, \`./node_modules/.bin/biome lint .\` and \`bun run --cwd apps/examples build\`. Check that golden snapshot files are byte-identical to <startSha> unless the brief explicitly re-pins them (\`git diff <startSha> <endSha> --stat -M -- ':(glob)**/__snapshots__/**'\`; a pure rename is fine). Report each command and what it printed in checksRun.`,
  },
  {
    key: 'behaviour',
    text: `Claim: the diff from <startSha> to <endSha> changes what the code does only as the brief intends. Read \`git diff <startSha> <endSha>\` line by line for semantic changes the brief did not ask for. Check that move commits are real renames with only import-path edits (\`git show -M --stat <sha>\`), that deleted code had no remaining callers (grep), and that no layering rule in context.md is broken.`,
  },
  {
    key: 'conformance',
    text: `Claim: the item achieved its goal fully and cleanly. Every step of the brief is done or its skip is justified in the report's deviations; the result matches the target layout, layering rules and taxonomy in context.md; nothing out of scope changed without being listed as a deviation; commits are small, conventionally named and end with a Co-Authored-By line, with no stray files (\`git show --stat <each commit>\`); there is no leftover dead code, TODO, debug output or half-renamed identifier; \`git status --porcelain\` is clean.`,
  },
]

const SOL_REVIEW_SCHEMA = {
  ...REVIEW_SCHEMA,
  properties: {
    ...REVIEW_SCHEMA.properties,
    unchecked: { type: 'array', items: { type: 'string' }, description: 'what the verdict rests on that you could not check' },
  },
  required: [...REVIEW_SCHEMA.required, 'unchecked'],
}

// Runs one Sol check and returns its verdict object, or null when no check was made.
async function solCheck(claim, schema, label, phaseName, extraAllow) {
  const allow = [...SOL_ALLOW, ...(extraAllow || [])].map(r => `--allow '${r}'`).join(' ')
  const cmd = `cd ${ROOT} && /usr/bin/python3 -I ${SOL_CHECK} --effort high --schema '${JSON.stringify(schema)}' ${allow} <<'CLAIM'\n${claim}\nCLAIM`
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await run(
      'Run this one shell command with a Bash timeout of 600000 ms, and return its standard output and standard error verbatim, with nothing added:\n\n' + cmd,
      { label: attempt ? `${label}#retry` : label, phase: phaseName, model: 'claude-haiku-5-5', effort: 'low' })
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
    const start = text ? text.indexOf('{') : -1
    const end = text ? text.lastIndexOf('}') : -1
    if (start >= 0 && end > start) {
      try {
        const out = JSON.parse(text.slice(start, end + 1))
        if (out && out.verdict) return { ...out.verdict, solModels: out.models, solSeconds: out.seconds, refused: out.refused }
      } catch (e) { /* fall through to retry */ }
    }
    log(`${label}: Sol check not made (${(text || '').slice(0, 200)})`)
  }
  return null
}

function claimText(id, impl, c) {
  const start = impl.fix ? impl.fix.startSha : impl.startSha
  // The item's own range: later commits may already sit on top of it when
  // items are checked after the next one has started
  const end = (impl.fix ? impl.fix.endSha : impl.endSha) || 'HEAD'
  return `You are verifying work item ${id} of a refactor of this repository (branch claude/touchdesigner-monorepo-refactor-6d0a2d, a git worktree at ${ROOT}). You did not write it. Be skeptical: report only problems you verified in the files or by running a command, and default to pass=false when the evidence does not show the claim holds. Permission rules match the start of a command: run one command per Bash call, with no \`&&\`, \`;\` or pipe, and use the Grep tool where a shell glob or brace list is needed.

${c.text.split('<startSha>').join(start).split('<endSha>').join(end)}

The brief is ${AUDIT}/items/${id}.md; shared context (target layout, layering rules, taxonomy, done checks) is ${AUDIT}/context.md. Shared rules every implementer follows: commits staged by path, git mv for moves, no amend/rebase/push, golden snapshots re-pinned only where the brief says so.
The implementer's report (claims to check, not facts):
${JSON.stringify(impl, null, 1)}

Severity: blocker = broken build or tests, regression, wrong behaviour; major = goal not met, a required step missing, layering or taxonomy broken, unintended snapshot change, wrong files committed; minor = style or polish. pass=false iff any blocker or major.`
}

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
  const verdicts = await parallel(CLAIMS.map(c => () =>
    solCheck(claimText(id, impl, c), SOL_REVIEW_SCHEMA, `sol:${id}:${c.key}`, phaseName)))
  const missing = CLAIMS.filter((c, i) => !verdicts[i]).map(c => c.key)
  if (missing.length) log(`${id}: no Sol verdict for ${missing.join(', ')}`)
  const problems = verdicts.flatMap((v, i) => (v ? v.problems.map(p => ({ ...p, claim: CLAIMS[i].key })) : []))
  const blocking = problems.filter(p => p.severity !== 'minor')
  const unchecked = verdicts.flatMap((v, i) => (v ? v.unchecked.map(u => `${CLAIMS[i].key}: ${u}`) : []))
  return { pass: !missing.length && verdicts.every(v => v && v.pass) && blocking.length === 0, missing, problems, blocking, unchecked }
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
  if (rev.missing.length) { report.push({ id, impl, review: rev }); stopped = `${id}: Sol could not check ${rev.missing.join(', ')}`; break }
  let fix = null
  let rev2 = null
  if (!rev.pass) {
    log(`${id}: ${rev.blocking.length} blocking problem(s); repairing`)
    fix = await run(fixPrompt(id, impl, rev.problems), { label: `fix:${id}`, phase: 'Repair', schema: IMPL_SCHEMA })
    if (fix) rev2 = await review(id, { ...impl, fix }, 'Repair')
  }
  const passed = rev.pass || (rev2 && rev2.pass)
  report.push({ id, impl, review: rev, fix, review2: rev2, passed })
  if (!passed) {
    stopped = `${id}: still failing review after one repair`
    log(stopped)
    break
  }
  log(`${id}: passed review`)
}

phase('Checkpoint')
const CHECKPOINT_SCHEMA = {
  type: 'object',
  properties: {
    green: { type: 'boolean' },
    commands: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, exitCode: { type: 'number' }, summary: { type: 'string' } }, required: ['command', 'exitCode', 'summary'] } },
    doneChecks: { type: 'array', items: { type: 'object', properties: { check: { type: 'string' }, state: { type: 'string', enum: ['pass', 'fail', 'not-yet-applicable'] }, note: { type: 'string' } }, required: ['check', 'state', 'note'] } },
    inconsistencies: { type: 'array', items: { type: 'string' } },
    unchecked: { type: 'array', items: { type: 'string' } },
  },
  required: ['green', 'commands', 'doneChecks', 'inconsistencies', 'unchecked'],
}
const checkpoint = await solCheck(`You are checking the state of this repository (branch claude/touchdesigner-monorepo-refactor-6d0a2d at ${ROOT}) after batch "${BATCH}" of a refactor ran (items: ${ITEMS.join(', ')}${stopped ? `; stopped early: ${stopped}` : ''}).
Claim: the repository is green. Run and report: \`git log --oneline 22fd93a..HEAD | head -60\`; \`git status --porcelain\`; \`./node_modules/.bin/turbo run typecheck test\`; \`bun test\`; \`./node_modules/.bin/biome lint .\`; \`./node_modules/.bin/turbo boundaries\`; \`bun run --cwd apps/examples build\`. Then go through the done checks in ${AUDIT}/context.md and mark each pass, fail or not-yet-applicable at this point. Then list, in plain words, anything in the repository that is now inconsistent or half-done, so the next batch can pick it up. green=true only if every command passed.`,
  CHECKPOINT_SCHEMA, 'sol:checkpoint', 'Checkpoint')

return { batch: BATCH, stopped, report, checkpoint }
