# Implementation worker rules — issue wave (read before your task)

**You are the IMPLEMENTATION WORKER, not the conductor.** Edit files directly in this worktree. Do not dispatch
agents and do not ask who dispatches; if something is ambiguous, make the smallest reasonable call and record it
in your report.

1. **Run the narrowest checks yourself before you report** (Node 22: `export PATH=/opt/homebrew/opt/node@22/bin:$PATH`):
   frontend — `cd apps/frontend && npx vitest run <the test files you touched or added>` and, from the repo root,
   `pnpm gate:fe-typecheck` (run `node scripts/generate-routes.mjs` first if the route tree is missing); backend —
   `pnpm --filter @fops/backend exec tsc --noEmit`; then `pnpm exec biome check <every file you touched>` from the
   repo root, fixing only diagnostics on lines you changed (the conductor fixed introduced format errors in four
   PRs of s81). Fix what fails. Put the commands and results in your report.
   Backend integration suites run only as `.review/00-IMPL-RULES-BE.md` allows (your own issue database, the exact
   command your task names). Still **never** run git (commit, stash, reset, checkout, restore), DB commands
   (`db:migrate`, `db:seed`, `psql`), the full integration suite, any other env file, the visual harness, or
   anything else that needs the network; never run `pnpm install`/`add`/`patch`/`update` (an offline install
   emptied a worktree's node_modules in s70 — the conductor pre-installs dependencies); leave all changes
   uncommitted — the conductor commits and runs the full gates.
   In React lifecycle code, never write refs or read the DOM during render; use event handlers, effects, or
   render-phase state adjustment.
   Test runs stay in the foreground and finish: always `vitest run` (never watch mode), and no worker-count flags: the `VITEST_*` env caps
   (`~/.zshenv`, passed through `turbo.json`) own the count (several workers share one machine; each pool child holds 2–3 GB), never a trailing `&` or `nohup`. A runner
   that is killed leaves its pool children orphaned (~18 GB on 2026-10-13); the conductor's tooling reaps them.
2. **Formatting: biome only** (`biome.json`: lineWidth 100, 2-space indent, single quotes). Never run Prettier
   and never reformat a whole file — touch only the lines you change.
3. TypeScript uses `exactOptionalPropertyTypes`: omit an optional prop rather than passing `undefined`.
4. Read first: root `AGENTS.md`, `apps/frontend/AGENTS.md`, the owning feature's `AGENTS.md`, and
   `.claude/rules/frontend-tests.md` (jsdom/Radix traps) before writing any test.
5. **Test first.** Add or extend the failing test, then make the smallest change that passes it. One test per
   acceptance criterion; `it.each` for variants. **Do not change the setup, fixtures, render entry point or
   assertions of existing tests** unless the task says the behaviour they pin is being removed — then say which
   test and why in the report.
6. Scope is exactly the task file, including any pre-existing items it lists as folds. No unrelated refactors.
   A fix item never widens into fetch, cache, placeholder or UI-state behaviour (React Query `placeholderData` /
   `keepPreviousData`, query keys, `staleTime`/`gcTime`, optimistic overlays, retained selection) unless the item
   names that change; such a change is not a "small" UX fix (s81 #1177: one cost a 31-minute FIX2). If the finding
   seems to need one, stop and say so in the report. User-facing copy: reuse `apps/frontend/src/lib/copy/*`
   and the screen's existing wording (ADR-0060). UI chrome is Korean; domain nouns (VOC, Finding, Task, Task
   Request, Survey, Cluster, Managed System, Analytics Area, Milestone, Evidence, Triage) and Task workflow statuses
   stay English (ADR-0057 A2, amended by #675). Update any doc the change makes wrong, in the
   same diff.
7. **Report:** write `.review/W-<issue>-REPORT.md` (a fix round: the report path its task names). It **starts with
   `## Summary`, at most 25 lines**: done / not done, files changed (one line each), tests added and run with
   results, existing tests changed, open questions. Then `## Details` with anything longer (which acceptance
   criterion each test covers, why each existing test changed). The conductor reads only the summary unless it
   disputes something.
   Its **last line** is the sentinel from your task. Write the sentinel only when all edits are finished.
8. **Do not call `orca`.** Terminals, worktrees, and orchestration belong to the conductor. (Workers can reach
   Orca since 2026-10-06: the old EPERM came from a launcher sandbox without network access, now enabled.)
   If a needed command is blocked, finish with the report and state the command and blocker; do not retry it.
