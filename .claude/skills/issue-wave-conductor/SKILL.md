---
name: issue-wave-conductor
description: Conduct a wave of GitHub issues to merged develop PRs, one issue = one branch = one PR, with codex/omp workers implementing, role-split reviewers chosen per issue by trigger (code always; UX, UI performance when the diff calls for them; code quality once per slice) using the shared routing table, and the conductor verifying on the host. Covers brief writing, launch, watching, host verification, risk-tiered review, visual baselines, merge, and cleanup. Use when the user says "wave 진행", "이슈들 진행해", "다음 이슈", or asks to work through a tracked issue set (e.g. the #578 review remediation) with workers.
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

Use the local `scripts/launch-worker.sh` for FeedbackOps worktree preparation and implementation launch.
Use shared `worker-launch.sh` directly for `fix`, every reviewer role (`review-final`, `review-ux`, `review-perf`,
`review-quality`) and intermediate `review-check`.
Reviewer runtimes:

- codex roles run in an Orca terminal;
- `claude` roles run as a background `claude -p` with the prompt on stdin. When `.claude/agents/<role>.md` exists in
  the cwd they also get `--agent <role>`, and the routing table's `--model`/`--effort` override the agent's
  frontmatter. Measured 2026-10-07: `--model` beats the agent's `model:`.
The shared launcher records PID or terminal state. A report sentinel alone is not completion:
`worker-wait.sh` also checks freshness, the last non-empty line, and worker exit or terminal idleness.
Close a completed worker's terminal immediately; retain its state JSON for the report and later cleanup.

## State

- `WAVE_STATE` — a scratch dir (the session scratchpad): shared worker state JSON files (`W-<n>.json`,
  `W-<n>-FIX<k>.json`, `W-<n>-FINAL.json`, `W-<n>-UX.json`, `W-<n>-PERF.json`, `W-<n>-CHECK<k>.json`, or
  `SLICE-<m>-QUALITY.json`), `env.verify.<issue>` files, and `preview-<label>.json` from `app-preview.py`.
  Pass `--state-dir "$WAVE_STATE"` on each launch and wait; use distinct names and reports for every round.
- `WAVE_BRIEFS` — brief dir, e.g. `.review/wave/` (gitignored). `FOPS_MAIN` — the main checkout.
- Throwaway Postgres for BE integration (never the dev DB on 5434): a `pgvector/pgvector:pg16` container on **5439**
  with `scripts/db/init.sql`. `verify-db.sh up` runs `db:migrate` on the template. Drizzle applies only migrations
  newer than the latest ledger timestamp; after each issue migration, `create` checks the checkout journal's SQL
  hashes against the cloned DB ledger and fails on any missing or extra entry. Each issue DB clones the template and
  then runs that checkout's migrations with its `env.verify.<n>` exported. Drop the DB and env file after the issue
  merges; `docker rm -f` at wave end.

## Loop per issue

1. **Brief** (`$WAVE_BRIEFS/<n>-task.md`): re-verify every fact on current `origin/develop` (paths, line numbers,
   existing helpers, the owning seam) — issue text goes stale. Sections: *Facts (verified on develop)* / *Do* /
   *Acceptance (tests)* / sentinel line. Name the approved surfaces to reuse, the exact error envelopes to keep, what
   is out of scope, and conductor decisions as "final — do not re-litigate". End the brief with
   `Sentinel (last line of .review/W-<n>-REPORT.md): <!-- W-<n>-DONE -->` — the launcher registers exactly that. Check
   `ls docs/adr` before a brief assigns an ADR number (parallel issues collide). For "use the shared X" refactors say
   "replace only whole-set declarations; keep literals; never touch `db/schema`".
   **Self-check before launch.** Each of these cost a review round in session 63:
   - Name only helpers and schemas that exist; `grep` each one. "Parse with the shared schema" made a worker invent one
     (#813).
   - Copy cardinality and validation rules (one parent vs many children, required fields) from the backend
     validator, not from memory (#827).
   - When a lifecycle event drives behaviour ("closing collapses"), `grep` every representation the call sites use,
     e.g. an absent prop vs `detailPanel={null}` (#838).
   - Before replacing an exact lookup with a capped prefix or contains search, check that the exact hit stays
     reachable under the cap (#821: `VOC-1` was lost among 100+ newer `VOC-1…`).
2. **Launch**: `scripts/launch-worker.sh <n> <slug> [be]` (≈5–7 in flight is the sustainable ceiling
   for one conductor; 2–3 when the conductor also runs every harness). It delegates to shared `worker-launch.sh`
   with role `impl`; set `WORKER_ROLE=impl-fallback` when the session selects the fallback, and optionally
   `WORKER_MODEL` / `WORKER_EFFORT` for overrides. Parallelise only issues that touch disjoint files.
   **Complex issues go to `WORKER_ROLE=impl-complex`** (grok 4.7 high, headless; user decision 2026-10-08), and so do
   their fix rounds: pass `--role impl-complex` instead of `fix`. An issue is complex when any of these hold:
   - it changes a backend contract and its frontend consumer together, or touches three or more modules;
   - it touches permissions, a privacy or no-leak rule, auth, a migration, or SQL definer functions;
   - it carries ordering or state logic: state machines, idempotency or undo, save ordering (the #813–#832 builder
     saves), or concurrency;
   - an earlier GLM round on the same issue failed or needed a second fix round.
   Record the choice and the reason in `W-<n>-VERIFY.md`. Everything else uses `impl` (GLM), and a GLM quota stop
   uses `impl-luna` as before.
3. **Wait**: shared `worker-wait.sh --state "$WAVE_STATE/W-<n>.json" --timeout 3600 --poll 30`.
   For several workers, pass repeated `--state` options and `--any`, then remove the returned finished worker
   from the pending set before waiting again. Act on both its final JSON result and exit code: `0` done → verify
   on the host and close any terminal immediately; `10` failed → inspect the report/log and write a repair brief;
   `11` quota → stop the stalled worker, then relaunch in the same worktree with shared `worker-launch.sh
   --role impl-luna` (not `launch-worker.sh`, which creates a new worktree) and a task that says the worktree holds
   partial edits; this fallback is a standing user decision (2026-10-07);
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
6. **Browser evidence for UI**: use `scripts/visual.sh capture <n> --route <url> [--from <visual-spec>] [--mock '<installMockApi options object>'] [--state <label>]...`.
   The tool infers a unique matching spec when possible; pass `--from` when inference is ambiguous or the route is
   dynamic. Pages that call APIs need a matching spec's `installMockApi` setup because unmatched requests fail closed.
   Pass `--mock` to replace the copied `installMockApi` options object. For custom mock overrides that need request
   handlers, use a temporary spec with `page.route`. State values name screenshot files; they do not change the route or UI
   state. Save screenshots into `.review/<n>-shots/`
   and remove generated specs with `scripts/visual.sh capture --clean <n>`. Real-browser checks caught what unit tests
   could not (a blank page on cold `/me` 429, a 404 that spun forever).
   For the conductor's own check against live data, `scripts/app-preview.py start <worktree>` serves the branch
   frontend against the user's :3011 backend. Reviewers never use that mode; see 7b. Stop it in the same turn.
7. **Role-split review, chosen by trigger** (owner decisions: one review round per issue, 2026-10-02; role split,
   2026-10-07; design reviewed by Opus 5.5 max on 2026-10-08). Run the host verification and the visual capture
   **first**: the conductor's harness run found the #719 nested-route BLOCKER before any reviewer.

   **a. Plan.** Run `python3 scripts/review-plan.py <worktree>` on the committed branch; it refuses uncommitted
   changes. Record its output in `W-<n>-VERIFY.md`.
   - `code`: launch `review-final`.
   - `ux: required`: launch `review-ux`.
   - `ux: optional`: the conductor decides and records a one-line reason.
   - `perf`: measure. Launch `review-perf` only on a breach (7d).
   - `flags.permission`: put "no restricted text may leak" first in every reviewer task, and give the UX reviewer a
     restricted persona.
   - `flags.instructions`: read the branch's `.claude/**`, `AGENTS.md` and `CLAUDE.md` diff yourself before
     launching anyone. Reviewers load those files from the branch.

   | Role (routing.tsv) | Task / report / sentinel | Rules |
   |---|---|---|
   | `review-final` (code: correctness, contracts, tests, architecture in the diff) | `W-<n>-FINAL-TASK.md` / `-FINAL-REPORT.md` / `<!-- W-<n>-FINAL-DONE -->` | `templates/review-rules.md` → `.review/00-REVIEW-RULES.md` |
   | `review-ux` (design and UX in the running app, one role) | `W-<n>-UX-TASK.md` / `-UX-REPORT.md` / `<!-- W-<n>-UX-DONE -->` | `.claude/agents/review-ux.md` (`--agent`) |
   | `review-perf` (UI performance, only on a breach) | `W-<n>-PERF-TASK.md` / `-PERF-REPORT.md` / `<!-- W-<n>-PERF-DONE -->` | `templates/review-rules-perf.md` → `.review/00-REVIEW-RULES-PERF.md` |
   | `review-quality` (code quality across the slice, step 11) | `SLICE-<m>-QUALITY-TASK.md` / `-QUALITY-REPORT.md` / `<!-- SLICE-<m>-QUALITY-DONE -->` | `.claude/agents/review-quality.md` |

   **b. Launch the code reviewer at once.** It needs no preview, so start it right after the plan and let it run
   while the previews come up.

   **c. Previews**, only for UX or perf, and always on the issue's **throwaway DB**:
   - **Never the dev DB.** A branch backend boots pg-boss with supervise and schedule on, and logging in writes
     session and audit rows.
   - **DB:** run `verify-db.sh create <n> --migrate-from <worktree>` if it does not exist yet.
   - **Baseline:** rebase the branch onto `origin/develop` first, so the merge-base is the develop tip. Keep one
     baseline worktree per wave, detached at `origin/develop`:
     `git worktree add --detach <wave>/baseline origin/develop`, then `pnpm install --frozen-lockfile`. Refresh it with
     `git -C <wave>/baseline checkout --detach origin/develop` (re-run the install if the lockfile moved). Never use
     `$FOPS_MAIN`.
   - **Start both**, each on its own `<label>.localhost` host (the session cookie is per host, not per port):
     - `scripts/app-preview.py start <baseline> --backend --env "$WAVE_STATE/env.verify.<n>" --seed --name <n>-develop`;
     - `scripts/app-preview.py start <worktree> --backend --env "$WAVE_STATE/env.verify.<n>" --name <n>-branch`.
   - `--seed` creates one `[preview]` record per drawer surface after the backend is healthy (Finding,
     Task Request (one converted, one pending), Task, Milestone, VOC Cluster, Survey and a response,
     outcome follow-up, Permission request). The branch preview shares that throwaway database, so it sees
     the same records without its own `--seed`. A fixtures failure is a warning on the start JSON
     (`fixtures`), not a failed start.
   - **Browser stages run one at a time across the wave.** At most one claude reviewer runs at a time, because they
     share the conductor's Claude quota. With 2–3 screen issues in flight, UX reviews queue.

   **d. Measure, then UX.** The perf flag comes first:
   - Run `verify-db.sh reset-rate-limits <n>` first. The API rate limit is per actor and stored in the shared
     throwaway DB.
   - `scripts/nav-perf.sh --base develop=<url> --base branch=<url> --targets <rail and touched hrefs> --out
     <worktree>/.review/<n>-perf/nav-perf.json`. Each base logs in as its own admin (`mock-admin-1`, `mock-admin-2`),
     and samples that saw a 429 are kept out of the medians.
   - **Breach:** for any target, the median `branch.readyMs > develop × 1.2 + 50`, a new `reloaded`, `apiCalls` +2,
     or `timedOut`. A new list query with no bound or index decision also counts.
   - On a breach, launch `review-perf`. Otherwise paste the comparison table into the code reviewer's task, or into
     VERIFY if the code reviewer has already started.
   - Then launch `review-ux` with the two preview URLs, the persona(s), at most three scenarios from the brief, and
     an absolute screenshot directory under `.review/` that you create first.
   - Launch every role with shared `worker-launch.sh --role <role> --cwd <worktree> --task <abs task> --report <abs
     report> --sentinel '<task sentinel>' --name <name> --state-dir "$WAVE_STATE"`.

   **e. Wait, with reviewer exit codes.** Loop `worker-wait.sh --any --kill-on-timeout --state …` over the running
   reviewers. Use `--timeout 5400` for UX, and 3600 for the others.
   - `0`: read the report.
   - `10` (failed):
     - if a partial report exists, use it;
     - if it covered nothing, relaunch once;
     - after a second failure, record the gap in VERIFY.
   - `11` (quota): wait for the reset, or skip the role and record the reason in VERIFY and the PR body.
   - `12` (timeout): the process group is already killed. Treat it like `10`.
   - **Tripwire.** Record `git rev-parse HEAD`, `git status --porcelain` and `git stash list | wc -l` in the worktree
     and in `$FOPS_MAIN` before the launch, and compare them after the reviews. The allowlist narrows accidents, but
     `ego-browser` runs arbitrary Node.
   - Stop both previews (`app-preview.py stop <label>`) as soon as UX and perf are done.

   **f. Merge findings.** Read every report and drop duplicates.
   - Resolve conflicts in this order:
     1. product invariants and permission or no-leak rules;
     2. ADRs, specs and recorded owner decisions;
     3. correctness and contracts;
     4. the brief;
     5. UX on the shipped pattern;
     6. performance;
     7. style.
   - A UX finding that contradicts the brief, or one that is really a product question, is never auto-decided. It
     goes to the owner:
     - an **Owner questions** section in the PR body;
     - a `needs-triage` issue.
     If it is a `blocker` (the actor cannot finish the task), hold the merge until the owner answers.
   - An owner decision marked "final — do not re-litigate" is never reversed in a fix round. Only evidence that it
     causes a blocker goes up.
   - `pre-existing` findings (also on develop) and anything outside the issue's scope become follow-up issues, not
     fixes.
   - Put every kept finding, tagged with its role, into **one** fix brief (`W-<n>-FIX1-TASK.md`). The conductor
     verifies the fix round and ships. There is no second review.
   - For a fixed UX or perf `blocker`/`major`:
     - re-run that scenario and its neighbouring flow, or `nav-perf.sh`, on fresh previews, and record the result;
     - run the full visual harness when the fix touched `packages/ui`.
     - When a `blocker` fix spreads past the files the reviewer saw, `review-check` (medium) reviews just that fix
       diff before the ship (owner decision 2026-10-08). It is the one exception to "no second review".

   **Mock wave (2026-10-08).** #838 and #821 were replayed at their pre-review commits.
   - **Code reviewer (Sol xhigh, background):** 3.7–5 min per issue. It caught 6 of the 8 planted code-level
     defects.
   - **UX reviewer (Opus high):** 6–10 min, 50–66 turns and $1.9–2.6 per issue.
     - It caught 1 of the 3 planted UI defects. It missed the #838 null-close because the seed has no
       Task/Finding/Survey records (#853), and missed #821's tab-scoped search because it was brief-consistent
       (now an expectation check in the agent).
     - It found 4 real issues no code review had (#849–#852).
     - Tripwires were clean, and no preview or orphan was left.
   - A `--seed` preview has one `[preview]` record per drawer surface (Finding,
     Task Request (one converted, one pending), Task, Milestone, VOC Cluster, discovery Survey with a
     response, outcome Survey follow-up, and a Permission request). UX tasks can open those drawers.

   **g. Rules that still hold:**
   - No review at all after copy-only or mechanical changes; the plan reports no roles for them.
   - For a refactor of a hardened invariant (e.g. the #678 Survey denial barrier), tell the code reviewer the history
     and to trace every branch against `origin/develop`.
   - Intermediate checks use role `review-check` with distinct CHECK task, report and state names.
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
11. **Slice close (before `release-gate.sh`).** When the slice's last issue has merged:
    - **`review-quality`:** run it from a disposable worktree detached at `origin/develop`:
      `worker-launch.sh --role review-quality --cwd <disposable> --task <abs SLICE-<m>-QUALITY-TASK.md> --report <abs
      report> --sentinel '<!-- SLICE-<m>-QUALITY-DONE -->' --name SLICE-<m>-QUALITY --state-dir "$WAVE_STATE"`.
      Act on its classes:
      - `release-blocker`: a normal issue loop before the release;
      - `fix-in-slice`: one chore PR;
      - `follow-up`: issues in the next milestone.
    - **Slice walkthrough:** previews of `origin/main` and `origin/develop` (throwaway DB, as in 7c). Then:
      - one `review-ux` run over the slice's user flows. Several session-63 defects showed only when the app was
        used, not in any one diff;
      - one `nav-perf.sh` comparison over the rail targets, as a safety net for perf triggers the plan missed.
    - Then run the release gate. The user owns the `main` merge, which is always a merge commit.
    - Before any handoff, `app-preview.py status` must show no previews and no orphans.

## Tools

- `scripts/visual.sh`: `run`, `update`, `stable`, and `capture`; it selects the current checkout from the working
  directory (or `VISUAL_ROOT`). `capture --clean <name>` moves its temporary spec to Trash when available.
- `scripts/verify-db.sh`: `up`, `create <n> [--migrate-from <checkout>]`, `drop <n>`, `reset-rate-limits <n>`,
  and `down` for throwaway Postgres on port 5439. `drop` removes the matching env file after a successful drop.
- `scripts/release-gate.sh <develop-checkout>`: fetches develop/main and requires a clean checkout at
  `origin/develop`; it refreshes the release DB and prints a complete PR command on success without creating or
  merging the PR. The user merges the release PR, or the conductor does with explicit approval in the session,
  using `gh pr merge <n> --merge`. A ruleset on `main` allows only merge commits; a squash there made the next
  release conflict (#811 → #837).
- `scripts/review-plan.py <checkout> [--base origin/develop] [--head HEAD]`: step 7a.
  - It prints `code`, `ux` (`required`/`optional`/false), `perf` and `flags` (`backend`, `migration`, `permission`,
    `instructions`) with reasons, and refuses uncommitted changes.
  - `scripts/test-review-plan.py` holds the rule table on a throwaway git repo (14 cases).
  - Checked against merged PRs: #820, #817 and #835 → code+ux; #842 and #846 → code+ux+perf; #839 → code only.
- `scripts/nav-perf.sh --base <label>=<url> [--base …] --targets <href,…> --out <json> [--runs 3] [--persona
  mock-admin-1]`: step 7d.
  - It times in-app navigation in the ego-browser runtime from the page's own click event to quiet: no fetch in
    flight and nothing loading for 300 ms, capped at 30 s.
  - Each pass logs in through the mock-login API, with one equivalent persona per base (`--personas`, default
    `mock-admin-1,mock-admin-2`). The rate limit is per actor and stored in Postgres, so a shared persona drained
    one bucket in the 2026-10-08 mock wave.
  - There is one warm-up pass, then the bases alternate for `--runs` passes, and per-target medians are compared.
  - Samples that saw a 429 are excluded (`rateLimitedSamples`).
  - Failures are recorded per target, and the JSON (with `fs`) is always written.
  - Validated 2026-10-08:
    - noise floor, develop vs develop: ≤4 ms;
    - positive control, the commit before #840 vs develop: reloads on every click, ~290 vs ~100 ms, 15–21 vs 3–11
      API calls;
    - a reload-heavy build can hit the `/me` rate limit and drop a sample.
- `scripts/app-preview.py start <checkout> [--backend --env <throwaway env> [--seed]] [--name <label>]` / `stop <label>|--all` / `status`:
  - It serves the checkout's vite at `http://<label>.localhost:<port>`. Each label gets its own host so logins do not
    collide.
  - `--backend` requires a throwaway `--env` and refuses an env whose DB is on port 5434. `--seed` runs the
    idempotent personas seed, then `scripts/preview-fixtures.mjs` against the healthy backend. That script
    creates one `[preview]` record per drawer surface, including Task Request (one converted, one pending).
    A fixtures failure is a warning on the start JSON (`fixtures`), not a failed start. Child stdout and
    stderr go to `$WAVE_STATE/preview-<label>-fixtures.log`, not into that JSON.
  - Without `--backend` the proxy goes to the user's :3011. That mode is for the conductor's own checks only.
  - It generates an `.mts` vite config (a `.ts` one outside the package bundles as CJS) and stops each process group
    (npx children).
  - `status` reports dead PIDs and untracked orphans found by `ps` markers; `stop --all` clears both.
  - Verified 2026-10-08:
    - two seeded previews on one throwaway DB kept separate logins (`/me` = admin vs user);
    - the dev-DB env was refused.

## Traps (measured)

- `orca terminal create` accepts only Orca-managed worktrees. A plain `git worktree add` checkout (a step-7c
  baseline, a mock-wave replay) cannot host a `codex-orca` reviewer. Run previews there, or launch codex in the
  background (`--role impl-fallback --model gpt-6.1-sol --effort xhigh`) for a replay.

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
- Implementation workers run in an Orca terminal so the user can watch them: GLM 5.3 flash max via omp since
  2026-10-07 (codex `impl-luna` on a GLM quota stop); complex issues run headless grok (`impl-complex`, 2026-10-08); code and perf reviewers run as codex (`codex-orca`), and UX and quality reviewers as background `claude -p --agent` (no terminal). The state JSON records
  the terminal handle — close it after verification or pass it to `ship-pr.sh --terminal`.
  If Orca hangs at `runtimeState: starting`, launch with `WORKER_ROLE=impl-fallback` (background `codex exec`
  with stdin from `/dev/null`), which needs no Orca terminal.
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
