---
name: issue-wave-conductor
description: Conduct a wave of GitHub issues to merged develop PRs, one issue = one branch = one PR, with codex/omp workers implementing, one sol xhigh final review per issue, and the conductor verifying on the host. Covers brief writing, launch, watching, host verification, risk-tiered review, visual baselines, merge, and cleanup. Use when the user says "wave 진행", "이슈들 진행해", "다음 이슈", or asks to work through a tracked issue set (e.g. the #578 review remediation) with workers.
---

# Issue wave conductor

Measured in session 58 (2026-09-30): 25+ issues merged from the #578 review wave. The conductor never writes product
code beyond mechanical fixes; workers implement, reviewers judge, the conductor verifies, commits and merges.

Before starting, confirm with the user: (1) auto-merge to `develop` is authorized **this session** (never `main`);
(2) the model routing below is still current (memory `project_model_routing_tiers`).

## Roles and routing

The models are the user's per-session call — read memory `project_model_routing_tiers` and confirm before the first
dispatch. As of session 59 (2026-10-02):

| Role | Model | Launch |
|---|---|---|
| Implementation / fix rounds | omp `glm-5.3-flash` thinking max; codex `gpt-6-luna` max while omp is over quota | `scripts/launch-worker.sh` (`WORKER=omp` or default `exec`); fix rounds: `codex exec` in the worktree with a `W-<n>-FIX<k>-TASK.md` |
| The single final review per issue | `gpt-6.1-sol` **xhigh** (or claude-opus-5-5 high) | `codex exec -m gpt-6.1-sol -c model_reasoning_effort=xhigh -s workspace-write "<read W-<n>-FINAL-TASK.md …>" < /dev/null` |
| Intermediate checks only | `gpt-6.1-sol` medium | same, `model_reasoning_effort=medium` |

`codex exec … < /dev/null` (no Orca terminal) is the default path for reviews and fix rounds: nothing to close, the log goes
to `.review/*.log`, and completion arrives as a background-task notification. Without `< /dev/null` it waits on stdin
forever. A sentinel can land before the process exits — act on the process exit, not the sentinel.

Orca-terminal codex (only if needed): `orca terminal create` → `terminal wait --for tui-idle` → `orchestration task-create`
→ `dispatch --inject`; a codex terminal refuses a second `dispatch --inject` (sandbox EPERM), so later rounds go through
`orca terminal send --text … --enter`.

## State

- `WAVE_STATE` — a scratch dir (the session scratchpad): `run.txt` (`RUN=<orca run id>`), `handles.txt`
  (`<key> <term handle> <worktree name>`), `watch-spec.txt` (`ID|/abs/report|<!-- SENTINEL -->`), `seen.txt`,
  `env.verify.<issue>` files.
- `WAVE_BRIEFS` — brief dir, e.g. `.review/wave/` (gitignored). `FOPS_MAIN` — the main checkout.
- Throwaway Postgres for BE integration (never the dev DB on 5434): a `pgvector/pgvector:pg16` container on **5439**
  with `scripts/db/init.sql`, migrated once (`db:migrate` with the env exported), then one DB per issue:
  `CREATE DATABASE feedbackops_<n> TEMPLATE feedbackops OWNER <owner>`, env file = the root `.env` with the URL
  pointed at it (`fops_app` / `fops_migrate` roles). Drop the DB when the issue merges; `docker rm -f` at wave end.

## Loop per issue

1. **Brief** (`$WAVE_BRIEFS/<n>-task.md`): re-verify every fact on current `origin/develop` (paths, line numbers,
   existing helpers, the owning seam) — issue text goes stale. Sections: *Facts (verified on develop)* / *Do* /
   *Acceptance (tests)* / sentinel line. Name the approved surfaces to reuse, the exact error envelopes to keep, what
   is out of scope, and conductor decisions as "final — do not re-litigate". End the brief with
   `Sentinel (last line of .review/W-<n>-REPORT.md): <!-- W-<n>-DONE -->` — the launcher registers exactly that. Check
   `ls docs/adr` before a brief assigns an ADR number (parallel issues collide). For "use the shared X" refactors say
   "replace only whole-set declarations; keep literals; never touch `db/schema`".
2. **Launch**: `[WORKER=omp|exec] scripts/launch-worker.sh <n> <slug> [be]` (≈5–7 in flight is the sustainable ceiling
   for one conductor; 2–3 when the conductor also runs every harness). Parallelise only issues that touch disjoint files.
3. **Watch**: `scripts/watch-any.sh` with the Bash tool's `run_in_background`; it exits on the first new sentinel —
   restart it after each notification. A sentinel can land before the worker finishes: for `codex exec` wait for the
   process to exit; for a terminal worker wait until it is idle, then **close that terminal immediately**.
4. **Verify on the host** (workers already ran their touched tests + typecheck per `templates/impl-rules.md`):
   - FE: `scripts/verify-fe.sh <worktree>`; visual harness `cd apps/frontend && PW_PORT=<unique> env -u NODE_OPTIONS npx playwright test -c playwright.config.ts`.
   - BE: `scripts/verify-be.sh <worktree> <n> [module filters]` — full integration once per BE issue, touched modules
     after small fix rounds.
   - Lint gate after committing: `pnpm gate:fe-lint --base origin/develop`; classify each NEW with
     `scripts/biome-cmp.sh` (introduced → fix with `biome check --write --formatter-enabled=false --linter-enabled=false`
     or `biome format --write`; pre-existing → allowlist).
   - Known FE load flakes (#634) pass when rerun alone; anything else is real.
   - Mutation-check new tests once (break the fix, see the named test fail, restore).
5. **Fix it yourself only if mechanical**: import paths/order, biome, a test expectation that pinned the removed
   behaviour, a missing router-mock hook, a fixture defect. Record each in `.review/W-<n>-VERIFY.md`. Anything with
   judgment → a fix brief (`.review/W-<n>-FIX<k>-TASK.md`) with the host output quoted, sent to the same worker.
6. **Browser evidence for UI**: a temporary `tests/visual/zz-<n>-capture.visual.spec.ts` (mock overrides via
   `page.route`), screenshots into `.review/<n>-shots/`, then `trash` the spec. Real-browser checks caught what unit
   tests could not (a blank page on cold `/me` 429, a 404 that spun forever).
7. **One final review per issue** (user, 2026-10-02; reviewer rules: `templates/review-rules.md`, copied to
   `.review/00-REVIEW-RULES.md`). Run the host verification and the visual capture **first** (the conductor's harness run
   found the #719 nested-route BLOCKER before any reviewer), then one sol xhigh review covering correctness + UI +
   architecture with a `W-<n>-FINAL-TASK.md` (scope, prior rounds, risks to trace, review lens) and `W-<n>-VERIFY.md`
   (numbers, captures, your own observations to confirm or reject). Batch every finding into one fix round; the conductor
   verifies it and merges — no second review. No review at all after copy-only or mechanical changes. For a refactor of a
   hardened invariant (e.g. the #678 Survey denial barrier), tell the reviewer the history and to trace every branch
   against `origin/develop`. Permission-sensitive reads: "no restricted text may leak" goes first in the brief.
8. **Visual baselines**: sub-threshold changes pass against stale baselines — regenerate deliberately with
   `--update-snapshots=all`, then `python3 <skill>/scripts/baseline-keep.py --region 0,0,300,960` (sidebar-only
   changes) or `--name '<regex>'`, and view before/after PNGs before committing. On a PNG rebase conflict take
   develop's file and regenerate on the branch.
9. **Merge**: rebase on `origin/develop`; rerun touched suites + typecheck (full FE suite + visual once before
   merge); push `--force-with-lease`; `gh pr create --base develop` (body: change, review verdicts and what was
   applied/deferred, verification numbers); `gh pr merge <n> --squash` from the main checkout; `git push origin
   --delete <branch>`; `gh issue close <n> --comment`; close the issue's terminals; `orca worktree rm --force`; drop
   its verify DB.
10. Keep the session handoff current every few merges: one local-only file at the repo root, `HANDOFF.md`, updated
    in place (no dated copies). File follow-ups (flakes, deferred nits, owner decisions) as issues in the wave's
    milestone.

## Traps (measured)

- Workers placed new helpers on a barrel (`@/lib/api`) — partial `vi.mock` of the barrel drops them (48 failures).
  Import new helpers from the defining module.
- A split into a subfolder breaks relative imports (`../shared` vs `./shared`, `../scenarios` vs `../../scenarios`).
- `insertVocDirectly(…, reporterActorId, …)` — a recipient who is the reporter keeps reading after a grant revoke.
- TanStack Router merges the root's raw search into child matches; dropped keys must be overwritten with `undefined`.
- zsh: never name a variable `path` (tied to `PATH`) or `status` (read-only).
- Rebase conflicts between parallel issues are mostly import lists and the biome allowlist: keep both sides. A later
  merge can add a required DTO field that an earlier branch's new test fixture lacks — typecheck after every rebase.
- `gate:fe-typecheck` checks only the frontend; the root `pnpm typecheck` also builds `packages/ui` with its tests
  (#661 fixed three test-only TS errors that passed vitest). `verify-fe.sh` runs both.
- The main checkout's `node_modules` goes stale across merges (a wave-end gate failed on a missing `nodemailer`):
  `pnpm install --frozen-lockfile` before the final gate there.
- Orca can hang at `runtimeState: starting`; review without it via
  `codex exec -m gpt-6.1-sol -c model_reasoning_effort=medium -s workspace-write "<spec>" < /dev/null` (without
  `< /dev/null` it waits on stdin forever).
- A FE test that stubs `fetch` for any URL hides a 4xx contract error (#653's query was a 422): parse the sent
  query/body with the shared Zod schema in the test.
- The worktree's own `.review/` is gitignored — copy briefs/rules in; `orca worktree create` may fail to return a
  terminal handle (retry `terminal create`).
- Session 59 (2026-10-02, Slice 22/23 wave):
  - **TanStack flat-file nesting**: `$surveyId.respond.tsx` became a child of the `$surveyId.tsx` management layout, which
    renders `<Outlet/>` only for its known children — the respondent form never rendered and the parent fired a
    `survey.read`-gated detail read. Unit tests rendered the page component directly and passed. Briefs that add a route
    under an existing `$param.tsx` must require a **real route-tree test**; un-nest with a trailing underscore
    (`$surveyId_.respond.tsx`).
  - A merge that adds dependencies (#721 webfonts) breaks other worktrees' `vite build` (`ENOENT
    @fontsource-variable/inter`) until `pnpm install --frozen-lockfile` runs there; the Playwright webServer just reports
    "was not able to start".
  - Pixel-preserving refactors: changing a label's line box inside a **vertically centred dialog** shifts the whole
    modal by a subpixel (8k-pixel diff across every glyph). Leave such sites local.
  - A rebase that crosses a mass-baseline merge (#721 regenerated 70 PNGs) conflicts on every PNG: take develop's
    (`git checkout --ours` during a rebase), finish the rebase, regenerate once.
  - Tests written before a copy sweep pin the old labels (#706 tests vs #679): after rebasing a copy sweep, expect label
    failures in tests that landed in between; update the expectations, not the copy.
  - omp `glm-5.3-flash` stalls silently on its 5-hour quota; read its terminal with `orca terminal read --screen`
    (the stream read shows only the splash) and trust `Provider requested Nms wait`, not the printed reset time.
