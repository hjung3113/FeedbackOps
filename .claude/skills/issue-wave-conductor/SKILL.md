---
name: issue-wave-conductor
description: Conduct a wave of GitHub issues to merged develop PRs, one issue = one branch = one PR, with codex/omp workers implementing, one final review per issue using the shared routing table, and the conductor verifying on the host. Covers brief writing, launch, watching, host verification, risk-tiered review, visual baselines, merge, and cleanup. Use when the user says "wave 진행", "이슈들 진행해", "다음 이슈", or asks to work through a tracked issue set (e.g. the #578 review remediation) with workers.
---

# Issue wave conductor

Measured in session 58 (2026-09-30): 25+ issues merged from the #578 review wave. The conductor never writes product
code beyond mechanical fixes; workers implement, reviewers judge, the conductor verifies, commits and merges.

Before starting, establish whether auto-merge to `develop` is authorized **this session** (never `main`).
Without that grant, ship an open PR and leave merging to the user.

## Roles and routing

Read `~/.claude/skills/orca-dispatch-recipes/routing.tsv` for the current roles, runtimes, models and efforts.
The user's session overrides win; pass them with `worker-launch.sh --model/--effort` instead of duplicating
model defaults here. All shared scripts are in `~/.claude/skills/orca-dispatch-recipes/scripts/`:
`worker-launch.sh`, `worker-wait.sh`, and `ship-pr.sh`. They must be installed before dispatch.

Use the local `scripts/launch-worker.sh` for FeedbackOps worktree preparation and implementation launch;
use shared `worker-launch.sh` directly for `fix`, `review-final`, and intermediate `review-check` roles.
The shared launcher records PID or terminal state. A report sentinel alone is not completion:
`worker-wait.sh` also checks freshness, the last non-empty line, and worker exit or terminal idleness.
Close a completed worker's terminal immediately; retain its state JSON for the report and later cleanup.

## State

- `WAVE_STATE` — a scratch dir (the session scratchpad): shared worker state JSON files (`W-<n>.json`,
  `W-<n>-FIX<k>.json`, `W-<n>-FINAL.json`, or `W-<n>-CHECK<k>.json`) and `env.verify.<issue>` files.
  Pass `--state-dir "$WAVE_STATE"` on each launch and wait; use distinct names and reports for every round.
- `WAVE_BRIEFS` — brief dir, e.g. `.review/wave/` (gitignored). `FOPS_MAIN` — the main checkout.
- Throwaway Postgres for BE integration (never the dev DB on 5434): a `pgvector/pgvector:pg16` container on **5439**
  with `scripts/db/init.sql`. `verify-db.sh up` runs `db:migrate` on the template; Drizzle skips migrations
  already in its ledger. Each issue DB clones the template and then runs that checkout's migrations with its
  `env.verify.<n>` exported. Drop the DB and env file after the issue merges; `docker rm -f` at wave end.

## Loop per issue

1. **Brief** (`$WAVE_BRIEFS/<n>-task.md`): re-verify every fact on current `origin/develop` (paths, line numbers,
   existing helpers, the owning seam) — issue text goes stale. Sections: *Facts (verified on develop)* / *Do* /
   *Acceptance (tests)* / sentinel line. Name the approved surfaces to reuse, the exact error envelopes to keep, what
   is out of scope, and conductor decisions as "final — do not re-litigate". End the brief with
   `Sentinel (last line of .review/W-<n>-REPORT.md): <!-- W-<n>-DONE -->` — the launcher registers exactly that. Check
   `ls docs/adr` before a brief assigns an ADR number (parallel issues collide). For "use the shared X" refactors say
   "replace only whole-set declarations; keep literals; never touch `db/schema`".
2. **Launch**: `scripts/launch-worker.sh <n> <slug> [be]` (≈5–7 in flight is the sustainable ceiling
   for one conductor; 2–3 when the conductor also runs every harness). It delegates to shared `worker-launch.sh`
   with role `impl`; set `WORKER_ROLE=impl-fallback` when the session selects the fallback, and optionally
   `WORKER_MODEL` / `WORKER_EFFORT` for overrides. Parallelise only issues that touch disjoint files.
3. **Wait**: shared `worker-wait.sh --state "$WAVE_STATE/W-<n>.json" --timeout 3600 --poll 30`.
   For several workers, pass repeated `--state` options and `--any`, then remove the returned finished worker
   from the pending set before waiting again. Act on both its final JSON result and exit code: `0` done → verify
   on the host and close any terminal immediately; `10` failed → inspect the report/log and write a repair brief;
   `11` quota → inspect the worker and use the session-approved fallback after stopping the stalled worker;
   `12` timeout → inspect progress, do not treat it as completion or launch a duplicate; `2` usage → correct
   the arguments. Do not consume a stale report or a sentinel written before the worker stops.
4. **Verify on the host** (workers already ran their touched tests + typecheck per `templates/impl-rules.md`):
   - FE: `scripts/verify-fe.sh <worktree>`; set the working directory to the worktree root before invoking
     `visual.sh` (for the main-checkout copy: `cd <worktree> && "$FOPS_MAIN/.claude/skills/issue-wave-conductor/scripts/visual.sh" run [filter...]`).
     It puts Node 22 on `PATH` and chooses a free `PW_PORT`; use `stable <filter...> --runs 3` for the final
     no-update baseline check.
   - BE: start the shared throwaway database once with `scripts/verify-db.sh up`, then
     `scripts/verify-db.sh create <n> --migrate-from <worktree>` before `scripts/verify-be.sh <worktree> <n> [module filters]` — full
     integration once per BE issue, touched modules after small fix rounds. Use `reset-rate-limits <n>` only
     when needed; drop the issue database after merge and run `down` at wave end.
   - Lint gate after committing: `pnpm gate:fe-lint --base origin/develop`; classify each NEW with
     `scripts/biome-cmp.sh` (introduced → fix with `biome check --write --formatter-enabled=false --linter-enabled=false`
     or `biome format --write`; pre-existing → allowlist).
   - Known FE load flakes (#634) pass when rerun alone; anything else is real.
   - Mutation-check new tests once (break the fix, see the named test fail, restore).
5. **Fix it yourself only if mechanical**: import paths/order, biome, a test expectation that pinned the removed
   behaviour, a missing router-mock hook, a fixture defect. Record each in `.review/W-<n>-VERIFY.md`. Anything with
   judgment → a fix brief (`.review/W-<n>-FIX<k>-TASK.md`) with the host output quoted. Launch it with shared
   `worker-launch.sh --role fix --cwd <worktree> --task <absolute-fix-task> --report <absolute-fix-report>
   --sentinel '<sentinel from the fix task>' --name W-<n>-FIX<k> --state-dir "$WAVE_STATE"`.
   Name the implementation rules in the brief; wait on the resulting state JSON as in step 3 before verifying.
6. **Browser evidence for UI**: use `scripts/visual.sh capture <n> --route <url> [--from <visual-spec>] [--state <label>]...`.
   The tool infers a unique matching spec when possible; pass `--from` when inference is ambiguous or the route is
   dynamic. Pages that call APIs need a matching spec's `installMockApi` setup because unmatched requests fail closed.
   State values name screenshot files; they do not change the route or UI state. Save screenshots into `.review/<n>-shots/`
   and remove generated specs with `scripts/visual.sh capture --clean <n>`. Real-browser checks caught what unit tests
   could not (a blank page on cold `/me` 429, a 404 that spun forever).
7. **One final review per issue** (user, 2026-10-02; reviewer rules: `templates/review-rules.md`, copied to
   `.review/00-REVIEW-RULES.md`). Run the host verification and the visual capture **first** (the conductor's harness run
   found the #719 nested-route BLOCKER before any reviewer), then one final review covering correctness,
   contracts/tests, UI and architecture with a `W-<n>-FINAL-TASK.md` (scope, prior rounds, risks to trace, review
   lens, exact report path and sentinel) and `W-<n>-VERIFY.md`
   (numbers, captures, your own observations to confirm or reject). Batch every finding into one fix round; the conductor
   verifies it and ships — no second final review. Launch with shared `worker-launch.sh --role review-final
   --cwd <worktree> --task <absolute-final-task> --report <absolute-final-report> --sentinel '<task sentinel>'
   --name W-<n>-FINAL --state-dir "$WAVE_STATE"` and wait as in step 3. Intermediate checks, when needed,
   use the same interface with role `review-check` and distinct CHECK task/report/state names.
   No review at all after copy-only or mechanical changes. For a refactor of a
   hardened invariant (e.g. the #678 Survey denial barrier), tell the reviewer the history and to trace every branch
   against `origin/develop`. Permission-sensitive reads: "no restricted text may leak" goes first in the brief.
8. **Visual baselines**: sub-threshold changes pass against stale baselines — regenerate deliberately with
   `scripts/visual.sh update <filter...>`. This runs `baseline-keep.py` in read-only report mode and writes
   before/after crops under `.review/baseline-keep-crops/`; inspect the changed PNG list and crops before acting.
   To restore only selected files use `baseline-keep.py --root <worktree> --revert '<regex>'`; to keep only selected tracked PNGs
   and restore the other changed tracked PNGs, use `baseline-keep.py --root <worktree> --keep '<regex>'`. Existing `--region`
   (sidebar-only, e.g. `0,0,300,960`) and `--name` qualifiers apply to `--keep`. Pixel count alone never decides
   whether a change is retained. Finish with `scripts/visual.sh stable <filter...> --runs 3`. On a PNG rebase
   conflict take develop's file and regenerate on the branch.
9. **Ship**: rerun touched suites + typecheck after rebasing (full FE suite + visual once before merge).
   Use shared `ship-pr.sh --branch feature/<n>-<slug> --base develop --title '<title>' --body-file <body-file>
   --ci --ci-timeout 3600` (body: change, review verdict and applied/deferred findings, verification numbers).
   The script fetches/rebases before pushing; if the pinned head changes after host verification, verify that
   head before authorizing merge. Never use base `main` or `master`. Without session auto-merge authorization,
   omit `--merge` and leave the PR open. Only when the user granted auto-merge **this session**, set
   `SHIP_AUTOMERGE=1` and add `--merge --issue <n> --close-comment '<verification and outcome>'`.
   Pass only finished resources via repeated `--worktree <path>` / `--terminal <handle>`; never pass a worktree
   still needed for verification, review or user merge. Exit `20` leaves a rebase conflict for resolution;
   `21` means CI failed; `22` means CI timed out; `30`/`31` reject forbidden or unauthorized merge. Inspect the
   final JSON and confirm the pinned head before claiming shipped/merged. Close every finished terminal and
   remove every finished worktree; drop the issue's throwaway verify DB only after merge.
10. Keep the session handoff current every few merges: one local-only file at the repo root, `HANDOFF.md`, updated
    in place (no dated copies). File follow-ups (flakes, deferred nits, owner decisions) as issues in the wave's
    milestone.

## Tools

- `scripts/visual.sh`: `run`, `update`, `stable`, and `capture`; it selects the current checkout from the working
  directory (or `VISUAL_ROOT`). `capture --clean <name>` moves its temporary spec to Trash when available.
- `scripts/verify-db.sh`: `up`, `create <n> [--migrate-from <checkout>]`, `drop <n>`, `reset-rate-limits <n>`,
  and `down` for throwaway Postgres on port 5439. `drop` removes the matching env file after a successful drop.
- `scripts/release-gate.sh <develop-checkout>`: fetches develop/main and requires a clean checkout at
  `origin/develop`; it refreshes the release DB and prints a complete PR command on success without creating or
  merging the PR.

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
- Orca can hang at `runtimeState: starting`; use the shared launcher's session-selected codex routing for
  `review-check` instead. It supplies `< /dev/null` so the worker cannot wait on stdin forever.
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
  - omp workers stall silently on their 5-hour quota; read the worker terminal with `orca terminal read --screen`
    (the stream read shows only the splash) and trust `Provider requested Nms wait`, not the printed reset time.
