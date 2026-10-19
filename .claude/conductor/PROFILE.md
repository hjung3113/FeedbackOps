# Conductor profile — FeedbackOps

Repo specifics for the global `issue-wave-conductor` skill (`~/.agents/skills/issue-wave-conductor/SKILL.md`,
#1197). The loop, the roles and the shared traps are there; this file holds only what differs here. Root `AGENTS.md`
wins over both. `$CONDUCTOR` is this folder (`$FOPS_MAIN/.claude/conductor`); `$ENGINE` is
`~/.agents/skills/issue-wave-conductor/scripts`. Common engines live there; repo-local tools stay in `scripts/`.
This repo's settings and rules live in `conductor.json` + `addenda/`; shared templates live in
`~/.agents/skills/issue-wave-conductor/templates/`. The launcher composes shared rules with the configured addenda.
This repo is a consumer of the private provider repo **conductor-engine** (#1280): it keeps only this folder
(`conductor.json`, `addenda/`, this profile, repo-specific `scripts/`) and no copies of skills, personas or engines.

## Flow

- `<base>` is `develop`; a slice ships as a `develop` → `main` release PR. Feature PRs squash-merge into `develop`
  (`ship-pr.sh`); the `main` merge is always a **merge commit** (a ruleset allows only that) and is the
  user's, or the conductor's only with explicit approval this session. Never ship with base `main` or `master`.
- **Merge grant** (asked once at slice start, re-asked every session): the recommended option is "merge into
  `develop` on green CI and review, report afterwards". `main` (the release PR, or an owner-approved hotfix PR with
  a back-merge PR `main` → `develop`) needs explicit owner approval in the session.
- Branch `feature/<n>-<slug>`. `$MAIN` is `FOPS_MAIN` (the main checkout). Worktrees live at
  `~/orca/workspaces/FeedbackOps/<n>-<slug>`.
- `WAVE_STATE` also holds `env.verify.<n>` (issue databases) and `preview-<label>.json` (`app-preview.py`).
  `WAVE_BRIEFS` is `$FOPS_MAIN/.review/wave/`.
- Session handoff: the local-only root `HANDOFF.md`; its "In flight" section has one line per issue (worktree, state
  JSON, the exact next command), so a rotated session can re-arm `worker-wait.sh` at once.

## Launch

- `python3 "$ENGINE/launch-worker.py" <n> <slug> [be] --checkout "$FOPS_MAIN"` (needs `WAVE_STATE`, `WAVE_BRIEFS`, `FOPS_MAIN`): Orca
  worktree from `origin/develop`, branch rename, rules copied into `.review/` (`00-IMPL-RULES.md`, `-BE.md` with
  `be`, the reviewer rules), wait for the setup install, close the setup shells, `PRE_ADD`, route-tree build, then the
  shared `worker-launch.sh` with `WORKER_ROLE` (default `impl`) and optional `WORKER_MODEL`/`WORKER_EFFORT`.
- **`be` issues get their own throwaway database.** Run `verify-db.sh up` once per wave first. The launcher then runs
  `verify-db.sh create <n> --migrate-from <worktree>` (or reuses an existing `env.verify.<n>`), copies it to
  `<worktree>/.review/env.verify`, and puts the exact command in the task's first lines:
  `FEEDBACKOPS_ENV_FILE=<abs worktree>/.review/env.verify pnpm --filter backend test:integration <files>`. Workers run
  only the integration files they added or touched (`addenda/impl-rules-be.md` rule 2). `scripts/test-integration.sh`
  refuses port 5434 unless `FEEDBACKOPS_ALLOW_DEV_DB=1`; never set that for a worker.
- In flight: ≈5–7 workers is the ceiling for one conductor; 2–3 while the conductor also runs every harness
  (16 GB machine; vitest is capped at 2 workers by `~/.zshenv`).
- Brief extras: name the exact error envelopes to keep; for "use the shared X" refactors say "replace only whole-set
  declarations; keep literals; never touch `db/schema`". Check `ls docs/adr` before assigning an ADR number.

## Complexity

`impl-complex` when any of these hold:

- it changes a backend contract and its frontend consumer together, or touches three or more modules;
- it touches permissions, a privacy or no-leak rule, auth, a migration, or SQL definer functions;
- it carries ordering or state logic: state machines, idempotency or undo, save ordering (the #813–#832 builder
  saves), concurrency, or fetch/cache semantics (React Query keys, `placeholderData`, optimistic overlays).

## Verify

Host checks in order; each must exit 0 before a commit. Every background verify command exports `WAVE_STATE` first.

- **FE:** `scripts/verify-fe.sh <worktree>` (full vitest, `packages/ui` vitest when touched, `gate:fe-typecheck`,
  root typecheck, boundaries and their fixture test, design lint, backend tsc, FE→BE route drift, worker hygiene).
- **Visual:** from the worktree root, `"$CONDUCTOR/scripts/visual.sh" run [filter...]` (Node 22 and a free
  `PW_PORT` are set for you); the full harness when `packages/ui` changed.
- **BE:** the shared throwaway Postgres: a `pgvector/pgvector:pg16` container on **5439** with
  `scripts/db/init.sql`, capped at 2 GB (`VERIFY_DB_MEMORY` overrides; the cap applies when `up` creates the
  container, so `down` then `up` to change it). `verify-db.sh up` migrates the template; each issue DB clones it and
  runs that checkout's migrations, and `create` fails when the checkout journal's SQL hashes differ from the cloned
  ledger (Drizzle applies only migrations newer than the latest ledger timestamp). A `be` issue's DB already exists
  from launch: reuse it, or when the branch adds a migration, `verify-db.sh drop <n>` then `create <n>
  --migrate-from <worktree>`. Then `scripts/verify-be.sh <worktree> <n> [module filters]`: full integration once per
  BE issue, touched modules after small fix rounds. `reset-rate-limits <n>` only when needed.
- **Lint gate** after committing: `pnpm gate:fe-lint --base origin/develop`; classify each NEW with
  `scripts/biome-cmp.sh` (introduced → `biome check --write --formatter-enabled=false --linter-enabled=false` or
  `biome format --write`; pre-existing → allowlist in `scripts/gates/frontend-biome-allowlist.txt`).
- Known FE load flakes (#634) pass when rerun alone; anything else is real.
- **Final head (after the last fix round):** only what CI does not run: the mutation check on the fix (and the
  fix-diff check when required), `visual.sh run <touched specs>` (full when `packages/ui` changed),
  `python3 "$ENGINE/worker-hygiene.py" <worktree>` and `pnpm gate:fe-lint --base origin/develop`. CI
  (`scripts/ci/gate.sh` static, unit, integration) is the gate of record for the rebased head; no full
  `verify-fe.sh`/`verify-be.sh` rerun after a fix or a rebase.
- **Visual baselines.** Sub-threshold changes pass against stale baselines: regenerate deliberately with
  `visual.sh update <filter...>`, which runs `baseline-keep.py` in report mode and writes before/after crops under
  `.review/baseline-keep-crops/`; inspect the changed PNGs and crops first. `baseline-keep.py --root <worktree>
  --revert '<regex>'` restores selected files; `--keep '<regex>'` keeps only those and restores the rest (`--region`,
  e.g. sidebar-only `0,0,300,960`, and `--name` qualify `--keep`). Pixel count alone never decides. Finish with
  `visual.sh stable <filter...> --runs 3`. On a PNG rebase conflict take develop's file and regenerate.
- Drop the issue DB and its env file (`verify-db.sh drop <n>`) after the merge; `verify-db.sh down` at wave end.

## Browser evidence

- **Captures:** `scripts/visual.sh capture <n> --route <url> [--from <visual-spec>] [--mock '<installMockApi
  options>'] [--state <label>]...`. It infers a unique matching spec; pass `--from` when ambiguous or the route is
  dynamic. Pages that call APIs need a spec's `installMockApi` (unmatched requests fail closed); `--mock` replaces
  the copied options, and handler-level overrides need a temporary spec with `page.route`. `--state` only names
  files. Save into `.review/<n>-shots/`; `visual.sh capture --clean <n>` removes the generated spec.
- **Conductor live check:** `scripts/app-preview.py start <worktree>` (no `--backend`) proxies to the user's :3011.
  Never for reviewers.
- **Previews for UX/perf, always on the issue's throwaway DB** (a branch backend boots pg-boss and logging in
  writes session and audit rows, so never the dev DB). Baseline worktree install: `pnpm install
  --frozen-lockfile`. Start each on its own `<label>.localhost` host (cookies are per host):
  - `scripts/app-preview.py start <baseline> --backend --env "$WAVE_STATE/env.verify.<n>" --seed --name <n>-develop`;
  - `scripts/app-preview.py start <worktree> --backend --env "$WAVE_STATE/env.verify.<n>" --name <n>-branch`.
  `--seed` only on a fresh issue DB; omit it to restart on a seeded one (the personas seed then fails on the
  `[preview]` Cluster's member FK). For 5k data run `SEED_MODE=scale npx tsx src/seed/index.ts` from
  `apps/backend` with the issue env after `--seed`.
- Stop previews (`app-preview.py stop <label>`) as soon as UX and perf are done.
- **`ux-prep.sh <n> <worktree> [--scale] [--targets <hrefs>] [--no-perf]`** (§Tools) runs the whole lane in the
  background. Rebase the worktree onto `origin/develop` and refresh `$WAVE_STATE/baseline` (skill step 7c) first,
  then launch it with `run_in_background` as soon as the code review launches: it creates or reuses the issue DB,
  reseeds only when the `[preview]` fixtures are gone, starts or reuses the `<n>-develop` and `<n>-branch`
  previews, curls the targets, probes Ego Lite (one automatic restart) and runs nav-perf, writing
  `$WAVE_STATE/ux-prep-<n>.json`. It leaves both previews running for the UX reviewer: stop them
  (`app-preview.py stop <n>-develop`, `stop <n>-branch`) before rebasing the worktree or refreshing the baseline
  again — the preview backends are not watched and would keep serving the old checkout.

## Review

- Plan: `python3 "$ENGINE/review-plan.py" <worktree> [--base origin/develop] [--head HEAD]` → `code`, `ux`
  (`required`/`optional`/false), `perf`, `flags` (`backend`, `migration`, `permission`, `instructions`). Checked
  against merged PRs: #820, #817, #835 → code+ux; #842, #846 → code+ux+perf; #839 → code only.
- Rules: `review-final` → the shared `review-rules.md` + `addenda/review-rules.md` (copied as `.review/00-REVIEW-RULES.md`); `review-ux` →
  global `~/.agents/agents/review-ux.md` with § Review lens: UX; `review-perf` → `addenda/review-rules-perf.md` (`.review/00-REVIEW-RULES-PERF.md`);
  `review-quality` → global `~/.agents/agents/review-quality.md` with § Review lens: quality; brief check → the shared `brief-check.md` + `addenda/brief-check.md`.
- **Perf measurement** (before UX, never while another lane's UX review or a vitest/integration run is on the
  host): when `ux-prep.sh` already ran for the issue, read `$WAVE_STATE/ux-prep-<n>.json` instead of rerunning
  `reset-rate-limits` + nav-perf. Otherwise `scripts/nav-perf.sh --base develop=<url> --base branch=<url>
  --targets <hrefs> --out <worktree>/.review/<n>-perf/nav-perf.json --reset-db <n>`, with `run_in_background`;
  nav-perf curls each target first, clears the shared rate-limit bucket immediately before every attempt, and
  retries the browser + summary step once. Targets are rail
  hrefs the harness clicks: `/home,/vocs?view=inbox,/vocs?view=triage,/findings,/tasks?view=board,/surveys/participate`
  plus touched rail links (`/`, `/vocs` or `?action=create` give no samples). Stdout is a text table ending in
  `breach: none|<hrefs>`; read numbers from `--out`.
- **Breach:** a target's median `branch.readyMs > develop × 1.2 + 50`, a new `reloaded`, `apiCalls` +2, or
  `timedOut`; also a new list query with no bound or index decision. On a breach launch `review-perf`; otherwise
  paste the table into the code reviewer's task or VERIFY.
- Conflict order starts with the product invariants in root `AGENTS.md` and permission or no-leak rules.
- A fixed UX/perf blocker or major is re-checked on fresh previews (or `nav-perf.sh`).

## Review lens: UX

Read first by the global `review-ux` persona. Report in English.

- **Previews:** `branch` and `develop`, each on its own host (`http://<label>.localhost:<port>`), both on the issue's
  throwaway database seeded with the mock personas. Writes through the UI are allowed on these two origins only.
  **Never touch `localhost:3010` or `:3011`** (the owner's dev data).
- **Login:** on each preview host run
  `fetch('/auth/mock-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ external_id }) })`
  from a page on that host, then confirm `GET /me`. The cookie is per host, so log in once per host. Personas are
  `external_id`s (e.g. `mock-admin-1`, plus a restricted one when the plan flags permissions).
- **Data gaps:** create missing records on the branch preview through the API the UI uses, several in one
  `page.evaluate` loop.
- **Authority:**
  - root `AGENTS.md` → UI Authority (ADR-0060): the shipped UI is the authority, so extend the current pattern;
    Korean UI chrome, domain nouns (`VOC`, `Finding`, `Task`, …) stay English; three shells only (ADR-0020);
  - `apps/frontend/AGENTS.md` and `PRODUCT.md` (Operate register: dense, list-first, restrained, one primary action
    per toolbar or panel);
  - `docs/frontend/ui-design-system.md`, `docs/frontend/component-inventory.md`, and the spec under
    `docs/frontend/specs/` for the touched surface;
  - generic lenses only where the project is silent: `~/.agents/skills/impeccable/reference/critique.md` (heuristics)
    and `~/.agents/skills/impeccable/reference/audit.md` (accessibility).
- **Project checks:**
  - keyboard baseline: `docs/frontend/ui-design-system.md` → Accessibility Rules (Windows users with both keyboard
    and mouse);
  - copy: existing `lib/copy` strings reused, Korean chrome, glossary nouns, no em dash in UI strings;
  - consistency: density and the 50px header rhythm;
  - emphasis (owner, s84): judge each screen on whether its ≤3 most important things stand out. Duplicate emphasis
    (severity stripe + icon + badge, a status repeated, red zero-counts) is a finding, not a style choice.

## Review lens: quality

Read first by the global `review-quality` persona. Report in English.

- **Range:** normally `origin/main...origin/develop`, in a disposable worktree detached at `origin/develop`.
- **Authority:** root `AGENTS.md` (Monorepo Boundaries, Implementation Boundaries, Product Invariants, and Test
  Discipline: test behaviour not implementation, one concept per test, no duplicate coverage at a lower level, no
  trivial passthrough tests); `docs/implementation/02-domain-module-boundaries.md`; `apps/backend/AGENTS.md`,
  `apps/frontend/AGENTS.md` and the nested `AGENTS.md` files on touched paths.
- **Boundary leaks:** a repository writing another module's table; a controller doing service work; `packages/ui`
  calling APIs or owning domain logic; `packages/shared` importing an app; frontend code enforcing permissions as
  truth.
- **release-blocker:** only a product-invariant or ownership-boundary violation that would ship wrong behaviour or
  data.

## Fold scope

Besides the issue's diff: the feature folder of a route that diff changes (`apps/frontend/src/features/<f>/`,
`apps/backend/src/modules/<m>/`) and `apps/frontend/src/lib/copy/*`. Never `packages/ui`, `packages/shared`,
`lib/layout` or another feature. React Query `placeholderData`/`keepPreviousData`, query keys,
`staleTime`/`gcTime`, optimistic overlays and retained selection are state code: file such a finding unless the
issue is about that behaviour.

## Deferrals

- Owner or conductor deferrals and accepted limits: a row in `docs/design/14-post-mvp-backlog.md` (item, reason,
  reopen condition), in the same PR or the next docs PR; an accepted contract or ADR collision also gets an ADR
  amendment. A deferred GitHub issue moves to the `Post-MVP` milestone with a comment giving the reason.
- Small noted items (`minor`/`nit` outside the touched area): a checkbox in the open grouped polish issue (#1214);
  open a new grouped issue if it is closed.

## Slice close

- **Release slice:** Slice 62 — Hardening, then Slice 63 — Production and release. The cut line applies (skill
  §Decisions): a new finding enters only for a data leak, data loss, a permission bypass or an actor who cannot
  finish the task; everything else is deferred per §Deferrals.
- Quality review range: previous release tag or slice start `...origin/develop`.
- **Walkthrough:** previews of `origin/main` and `origin/develop` on a throwaway DB (as above), `review-ux` over at
  most three issue-sized flows per run, plus one `nav-perf.sh` comparison over the rail targets as a safety net.
- Release: `scripts/release-gate.sh <develop-checkout>` (clean checkout at `origin/develop`; refreshes the release DB,
  runs verify-fe, verify-be and the visual harness, and prints the PR command without creating or merging it). The
  release PR merges with `gh pr merge <n> --merge`; a squash on `main` made the next release conflict (#811 → #837).
- Before any handoff `app-preview.py status` shows no previews and no orphans.
- At slice close move the slice's finished `W-*.json` state files out of `$WAVE_STATE` (to `.review/archive/`, or
  `trash`) so `/resume` lists only live workers (s80/s87: ~50 stale files were re-triaged every resume).

## Tools

| Script | What it does | Pinned by |
| --- | --- | --- |
| `python3 "$ENGINE/launch-worker.py" <n> <slug> [be] --checkout "$FOPS_MAIN"` | §Launch | – |
| `scripts/verify-fe.sh <worktree>` / `verify-be.sh <worktree> <n> [filters]` | §Verify; logs in `$WAVE_STATE/verify-<wt>/` and `$WAVE_STATE/vbe-<n>/` | – |
| `scripts/verify-db.sh up` / `create <n> [--migrate-from <checkout>]` / `drop <n>` / `reset-rate-limits <n>` / `has-preview-fixtures <n>` / `down` | throwaway Postgres on 5439; `drop` removes the env file; `has-preview-fixtures` reports the `[preview]` fixture cluster | – |
| `scripts/visual.sh run` / `update` / `stable` / `capture` | visual harness; picks the checkout from the cwd (or `VISUAL_ROOT`); `capture --clean` trashes its spec | – |
| `scripts/baseline-keep.py` | baseline keep/revert with crops | – |
| `scripts/biome-cmp.sh <worktree> <file>...` | biome error categories on develop vs branch | – |
| `python3 "$ENGINE/worker-hygiene.py" <worktree>` | fails on a new `biome-ignore`; reports whitespace-only churn | engine repo tests |
| `python3 "$ENGINE/review-plan.py" <worktree>` | §Review plan; refuses uncommitted changes | engine repo tests |
| `scripts/nav-perf.sh` (+ `nav-perf.mjs`, `nav-perf-summary.py`) | §Review perf. Times click → quiet (no fetch, nothing loading for 300 ms, cap 30 s) in ego-browser; one warm-up pass, then bases alternate for `--runs`; one admin persona per base (`--personas`, default `mock-admin-1,mock-admin-2`); 429 samples excluded; an error or inconclusive target exits 1 (`--reset-db` plus the one retry handle it); output log `<out>.log`; curls every target and `--start` once first; `--reset-db <n>` clears the rate limits immediately before every attempt; the browser + summary step is retried once (first log kept as `<out>.attempt1.log`). Noise floor ≤4 ms | – |
| `scripts/ux-prep.sh <n> <worktree> [--baseline <checkout>] [--scale] [--targets <hrefs>] [--no-perf]` | §Browser evidence: issue DB + seeded `<n>-develop`/`<n>-branch` previews + curl warm-up + Ego Lite probe (one restart) + nav-perf in one background run; writes `$WAVE_STATE/ux-prep-<n>.json` (last stdout line) and leaves the previews running | – |
| `scripts/app-preview.py start <checkout> [--backend --env <env> [--seed]] [--name <label>]` / `stop <label>\|--all` / `status` | §Browser evidence. Refuses an env on 5434; `--seed` runs the personas seed then `preview-fixtures.mjs` (one `[preview]` record per drawer surface); a fixtures failure is a warning in the start JSON, its output in `$WAVE_STATE/preview-<label>-fixtures.log`; generates an `.mts` vite config; `status` reports dead PIDs and orphans, `stop --all` clears both | – |
| `scripts/release-gate.sh <develop-checkout>` | §Slice close | – |
| `python3 "$ENGINE/wave-status.py" [--json] [--prs] [--state-dir <dir>] --checkout <worktree>` | read-only wave snapshot (workers, previews, worktrees, containers, PR CI); the `/wave` mod draws it | engine repo tests |

Shared pieces (the conductor skill with its engines and templates, `orca-dispatch-recipes`, `session-handoff`, the
reviewer personas, the workflow hooks) are installed by the provider's `install.sh` from its canonical checkout
`~/orca/projects/conductor-engine`; the SessionStart context names the installed commit, and when it reports
edited copies run `install.sh --check` there (edit the provider, never the installed copy). A problem with a shared
piece is filed upstream with `engine/scripts/upstream-file.sh` (`--batch` for several); a repo-side workaround goes
in §Traps with the upstream issue link, never only in memory or `HANDOFF.md`. This repo carries configuration and
addenda, not engine forks or their tests.
`scripts/test-integration.test.mjs` (repo root `scripts/`, CI static stage) pins the 5434 guard.

## Traps

- `verify-fe.sh`/`verify-be.sh` exit at once with `WAVE_STATE: set WAVE_STATE` when a background command does not
  export it.
- `verify-be.sh` stdout lists only FAIL names; the assertion text is in `$WAVE_STATE/vbe-<n>/integration.log`.
- An integration run truncates and re-seeds the issue DB, so the scale seed and preview fixtures are gone afterwards:
  reseed (`--seed`, `SEED_MODE=scale`) before nav-perf or UX previews, and run perf/UX before integration reruns when
  possible.
- nav-perf medians are skewed by concurrent host load (vitest, integration): measure on a quiet host. A cold vite
  gives `PageEvaluationTimeoutError`: nav-perf.sh curls each target first and retries the browser step once.
- `insertVocDirectly(…, reporterActorId, …)`: a recipient who is the reporter keeps reading after a grant revoke.
- TanStack Router merges the root's raw search into child matches; dropped keys must be overwritten with `undefined`.
- A route added under an existing `$param.tsx` becomes its child and renders only through the parent's `<Outlet/>`;
  require a real route-tree test and un-nest with a trailing underscore (`$surveyId_.respond.tsx`).
- `gate:fe-typecheck` checks only the frontend; root `pnpm typecheck` also builds `packages/ui` with its tests
  (#661). `verify-fe.sh` runs both.
- Rebase conflicts also hit the biome allowlist: keep both sides.
- A merge that adds dependencies makes the Playwright webServer report only "was not able to start" in other
  worktrees until they reinstall.
- A FE test that stubs `fetch` for any URL hides a 4xx contract error (#653's 422): parse the sent query/body with
  the shared Zod schema in the test.
- Changing a label's line box inside a vertically centred dialog shifts the whole modal by a subpixel; keep
  pixel-preserving refactors local there.
- Both previews of one issue share the issue DB, so the `<n>-develop` backend's pg-boss worker takes jobs of a new
  event type the branch adds and fails them (s88 false UX blocker "no notifications arrive"). When a branch adds a
  job payload or event type, stop the `<n>-develop` preview before the UX run and check `pgboss.job` before calling
  "nothing arrives" a code bug.
- `ux-prep.sh` can report `probe: failed` after its Ego Lite restart while a manual probe a minute later passes:
  re-probe by hand once before relaunching anything. Quote its `--targets` list from zsh (`?` globs).
- Create every worktree that will host a worker or reviewer, or be shipped, with `orca worktree create`; a plain
  `git worktree add` cannot host codex-orca and `ship-pr.sh` does not clean it (s84/s88). `orca terminal create` can
  fail transiently and leave an empty terminal: retry once, close the orphan. After two "Timed out waiting for
  terminal handle" on one codex-orca launch, use `worker-launch.sh --role impl-fallback` with the row's
  `--model`/`--effort` and record it in VERIFY (s90; conductor-engine#10).
- Never overwrite an existing `.review/wave/<n>-task.md` from an older session (s88 lost a brief): pick a new name
  or pass `--brief <path>` (conductor-engine#33).
- Rate-limit buckets (`core.rate_limits`) outlive test files and are keyed `<workspace_id>:<actor_id>`; the
  `mutation` tier is 10/min per actor. A 429 in an untouched integration suite means a neighbour spent the shared
  persona's budget: the suite clears its cohort's buckets in `beforeEach`/`beforeAll` (#1275, #1281). A delete by bare
  `actor.id::text` matches nothing (#1214).
