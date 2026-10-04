# Implementation worker rules — issue wave (read before your task)

**You are the IMPLEMENTATION WORKER, not the conductor.** Edit files directly in this worktree. Do not dispatch
agents and do not ask who dispatches; if something is ambiguous, make the smallest reasonable call and record it
in your report.

1. **Run the narrowest checks yourself before you report** (Node 22: `export PATH=/opt/homebrew/opt/node@22/bin:$PATH`):
   frontend — `cd apps/frontend && npx vitest run <the test files you touched or added>` and, from the repo root,
   `pnpm gate:fe-typecheck` (run `node scripts/generate-routes.mjs` first if the route tree is missing); backend —
   `pnpm --filter @fops/backend exec tsc --noEmit`. Fix what fails. Put the commands and results in your report.
   Still **never** run git (commit, stash, reset, checkout, restore), DB commands, integration suites, the visual
   harness, or anything that needs the network; leave all changes uncommitted — the conductor commits and runs the
   full gates.
2. **Formatting: biome only** (`biome.json`: lineWidth 100, 2-space indent, single quotes). Never run Prettier
   and never reformat a whole file — touch only the lines you change.
3. TypeScript uses `exactOptionalPropertyTypes`: omit an optional prop rather than passing `undefined`.
4. Read first: root `AGENTS.md`, `apps/frontend/AGENTS.md`, the owning feature's `AGENTS.md`, and
   `.claude/rules/frontend-tests.md` (jsdom/Radix traps) before writing any test.
5. **Test first.** Add or extend the failing test, then make the smallest change that passes it. One test per
   acceptance criterion; `it.each` for variants. **Do not change the setup, fixtures, render entry point or
   assertions of existing tests** unless the task says the behaviour they pin is being removed — then say which
   test and why in the report.
6. Scope is exactly the task file. No unrelated refactors. User-facing copy: reuse `apps/frontend/src/lib/copy/*`
   and the screen's existing wording (ADR-0060), Korean per issue #580 (Korean-first; domain nouns such as VOC, Finding, Task
   Request, Managed System, Analytics Area, Triage stay English). Update any doc the change makes wrong, in the
   same diff.
7. **Report:** write `.review/W-<issue>-REPORT.md` — files changed (one line why each), tests added (which
   acceptance criterion each covers), existing tests you changed and why, anything not done, open questions.
   Its **last line** is the sentinel from your task. Write the sentinel only when all edits are finished.
