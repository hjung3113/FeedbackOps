---
name: issue-wave-conductor
description: Conduct a wave of GitHub issues to merged develop PRs, one issue = one branch = one PR, with Orca-launched codex workers (luna implements, sol reviews) and the conductor verifying on the host. Covers brief writing, launch, watching, host verification, risk-tiered review, visual baselines, merge, and cleanup. Use when the user says "wave 진행", "이슈들 진행해", "다음 이슈", or asks to work through a tracked issue set (e.g. the #578 review remediation) with workers.
---

# Issue wave conductor

Measured in session 58 (2026-09-30): 25+ issues merged from the #578 review wave. The conductor never writes product
code beyond mechanical fixes; workers implement, reviewers judge, the conductor verifies, commits and merges.

Before starting, confirm with the user: (1) auto-merge to `develop` is authorized **this session** (never `main`);
(2) the model routing below is still current (memory `project_model_routing_tiers`).

## Roles and routing (user-set 2026-09-30)

| Role | Model | Launch |
|---|---|---|
| Implementation / fix rounds | `gpt-6-luna` max | `scripts/launch-worker.sh` (new) or `orca terminal send` into the same terminal (fix rounds) |
| Routine review (correctness, round-2 re-checks) | `gpt-6.1-sol` medium | `codex --model gpt-6.1-sol -c model_reasoning_effort=medium -s workspace-write -a never` |
| UI/UX review (layout changes) | `gpt-6.1-sol` xhigh (max for the final whole-set judgment) | same, `model_reasoning_effort=xhigh` |

Codex reviewers: `orca terminal create` → `terminal wait --for tui-idle` → `orchestration task-create` → `dispatch --inject`;
confirm the status bar shows the model/effort. A codex terminal refuses a second `dispatch --inject` (its first
`worker_done` never arrives — sandbox EPERM): send follow-up rounds with `orca terminal send --text … --enter`.

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
2. **Launch**: `scripts/launch-worker.sh <n> <slug> [be]` (≈5–7 in flight is the sustainable ceiling for one conductor).
3. **Watch**: `scripts/watch-any.sh` with the Bash tool's `run_in_background`; it exits on the first new sentinel —
   restart it after each notification. A sentinel can land before codex finishes: wait until the terminal no longer
   shows `Working`, then **close that terminal immediately**.
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
7. **Review, risk-tiered** (reviewer rules: `templates/review-rules.md`, copied to `.review/00-REVIEW-RULES.md`):
   - docs / test infra / pure refactor → one sol medium;
   - behaviour or contract change → sol medium; add sol xhigh when the rendered layout changes;
   - permission-sensitive reads → tell the correctness reviewer "no restricted text may leak" first;
   - fix round that only applied nits/minors → no round 2; the conductor verifies and merges.
   Give reviewers `VERIFY.md` with captures and your own observations to confirm or reject.
8. **Visual baselines**: sub-threshold changes pass against stale baselines — regenerate deliberately with
   `--update-snapshots=all`, then `python3 <skill>/scripts/baseline-keep.py --region 0,0,300,960` (sidebar-only
   changes) or `--name '<regex>'`, and view before/after PNGs before committing. On a PNG rebase conflict take
   develop's file and regenerate on the branch.
9. **Merge**: rebase on `origin/develop`; rerun touched suites + typecheck (full FE suite + visual once before
   merge); push `--force-with-lease`; `gh pr create --base develop` (body: change, review verdicts and what was
   applied/deferred, verification numbers); `gh pr merge <n> --squash` from the main checkout; `git push origin
   --delete <branch>`; `gh issue close <n> --comment`; close the issue's terminals; `orca worktree rm --force`; drop
   its verify DB.
10. Keep the session handoff (`.review/HANDOFF-*.md`) current every few merges; file follow-ups (flakes, deferred
    nits, owner decisions) as issues in the wave's milestone.

## Traps (measured)

- Workers placed new helpers on a barrel (`@/lib/api`) — partial `vi.mock` of the barrel drops them (48 failures).
  Import new helpers from the defining module.
- A split into a subfolder breaks relative imports (`../shared` vs `./shared`, `../scenarios` vs `../../scenarios`).
- `insertVocDirectly(…, reporterActorId, …)` — a recipient who is the reporter keeps reading after a grant revoke.
- TanStack Router merges the root's raw search into child matches; dropped keys must be overwritten with `undefined`.
- zsh: never name a variable `path` (tied to `PATH`) or `status` (read-only).
- Rebase conflicts between parallel issues are mostly import lists and the biome allowlist: keep both sides. A later
  merge can add a required DTO field that an earlier branch's new test fixture lacks — typecheck after every rebase.
- The worktree's own `.review/` is gitignored — copy briefs/rules in; `orca worktree create` may fail to return a
  terminal handle (retry `terminal create`).
