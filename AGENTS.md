# FeedbackOps Agent Guide

## Operating Rules

- State assumptions when the request can be read in more than one way.
- Prefer the smallest change that satisfies the request. Do not add speculative flexibility.
- Match existing docs and implementation patterns before inventing new structure.
- Every changed line must trace to a user request, a documented invariant, or a failing verification.
- If domain rules conflict with generic framework habits, follow the domain rules.

## Finish Line And Stops

- **Finish line for an issue:** the touched behavior has passing tests, the [gate](#verification) is green, docs affected by the change are updated in the same PR, and a PR to `develop` is open. Merge and close the issue only when auto-merge was granted in this session; otherwise the user merges. Finish one issue before starting the next. For other multi-step work, state the success criteria up front and verify them before claiming completion.
- **Keep going** through steps that don't need the user. **Stop and report** on a documentation conflict that no tiebreak covers ([Source Of Truth](#source-of-truth)), and before any merge, push, or release the user has not authorized in this session.

## Prototype Is The Spec

`docs/design-prototype/` is the **functional + visual + copy specification** for every user-facing surface. Not a reference, not inspiration — the spec.

- **Read first.** Before any frontend chunk (route, screen, panel, component used in a screen), open the matching `screen-*.jsx` + `data.js` and the relevant `screenshots/final-baselines/<page>.png`. If a chunk creates UI without reading prototype, that chunk is rejected on review.
- **Layout, hierarchy, density, spacing, copy come from prototype.** Do not invent placement, group order, or visual rhythm. Mirror what the prototype shows. Deviations require an explicit ADR or a user OK, recorded in the PR body.
- **Copy verbatim, mixed-language allowed.** Copy what the prototype shows verbatim, whether Korean, English, or a mix; do not translate either direction. Per-surface variance (e.g. a `BODY` label in the detail panel next to a Korean label in the create form) is allowed when the reference designs/screenshots show it.
- **Three-shell taxonomy (ADR-0020 / Pack 17).** Every screen is `PageShell`, `ListShell`, or `WorkbenchShell`. Special pages extend the three — never a new shell.
- **Prototype contradicts spec text:** prototype wins for copy/layout; spec wins for behavior/AC. Document the path taken in a one-line code comment.
- **Do NOT port from prototype:** hash routing, `window` globals, `document.execCommand`, synthetic local data, draft-only API intent panels. Production routing is TanStack Router; rich text is TipTap (ADR-0002 / ADR-0011) — not the prototype's `RichEditor`.
- **Design review** compares the implementation against the RENDERED prototype, not prose specs; hand the implementing agent the prototype screen up front.

Frontend enforcement (brief contents, pixel-diff gate): `apps/frontend/AGENTS.md`.

## Git Workflow

- **Per-issue feature branch.** `feature/<issue-number>-<slug>` branched from `develop`. Never commit directly to `develop` or `main`. `fix/<n>-<slug>` for hot-fixes; `chore/<slug>` for housekeeping (may target `develop` via small PR).
- **Issue complete → PR to `develop`.** Delete the feature branch on merge.
- **Slice complete → PR `develop` → `main`.** User owns the final `develop` → `main` merge and any tag/release. No agent push to `main`.
- **Hooks.** Enable once per clone: `git config core.hooksPath .githooks`. `.githooks/pre-commit` refuses commits on `develop` and on `main` (README-only commits on `main` are allowed); `.githooks/pre-push` blocks direct pushes to `main` that touch files other than `README*`. Client-side only; the real gate is GitHub branch protection.

## Monorepo Boundaries

- No source code at the repo root. Cross-app code in `packages/*` only when both apps need it.
- Product systems (VOC, Finding/Insight, Task, Survey, Dashboard, Permission, Entity Linking, Core Platform) are bounded contexts inside the app shells — not separate deployable apps. Do not create `systems/{system}/frontend|backend`.
- Backend implementation lives under `apps/backend/src/modules/*`. Frontend route composition lives under `apps/frontend/src/features/*`.

## Required Reading

Before implementation, read every applicable `AGENTS.md` on the path from the repo root to the target directory and the authorities for every touched subject under [Source Of Truth](#source-of-truth). Cross-system workflow changes also require `docs/design/10-cross-system-workflows.md`; product-system behavior changes require the matching `docs/design/*` contract.

## Source Of Truth

Authority follows subject; there is no universal conflict ladder.

**Authority by subject:**

- `AGENTS.md` (root + per-directory) — agent conduct and repository/ownership boundaries
- `CONTEXT.md` (root) — domain vocabulary and stable domain invariants
- `docs/adr/*.md` — architectural decisions
- `docs/implementation/*.md` and `docs/design/*.md` — detailed contracts

**Tiebreaks — apply, do not escalate:**

- An ADR supersedes any other document — `docs/implementation/*`, `docs/design/*`, `CONTEXT.md`, `docs/design-prototype/`, and any `AGENTS.md` — on the decision it made. Note stale docs and fix them in the same chunk.
- `CONTEXT.md` owns vocabulary and stable domain invariants, not architecture.
- The most specific `AGENTS.md` wins: a per-directory `AGENTS.md` supersedes root within its directory.
- Prototype vs spec text → see [Prototype Is The Spec](#prototype-is-the-spec).

**Stop and report:** A disagreement between detailed contracts (`docs/implementation/*` vs `docs/design/*`) stops by design: neither is a decision record, so no tiebreak can pick a winner without fabricating a decision. A grill-locked Q collision, or any contradiction no tiebreak above covers → report which doc must reopen. Never resolve unilaterally.

**USER-FACING COPY (labels, headers, buttons, microcopy) — fallback chain when a source is silent:**

1. `docs/design-prototype/` (HANDOFF.md + `screen-*.jsx` + `data.js`) — verbatim authority, in whatever language the prototype uses (see [Prototype Is The Spec](#prototype-is-the-spec)).
2. `docs/frontend/specs/*.md` when prototype is silent
3. `CONTEXT.md` when neither has a verbatim string

Shipped user-facing strings are implemented in `apps/frontend/src/lib/copy/*`; update the matching module when canonical wording changes.

**Per-domain pointers:** endpoint behavior → `docs/implementation/03-api-contracts.md` and `docs/implementation/api/`; DB + migrations → `04-database-and-migrations.md`; module ownership → `02-domain-module-boundaries.md`; permissions → `05-permission-policy.md`; entity links → `06-entity-linking-contract.md`; background jobs → `docs/adr/0009-background-jobs-with-pg-boss.md`; frontend routes → `docs/frontend/routes-and-layout.md`; component contracts → `docs/frontend/ui-design-system.md` + `component-inventory.md`. Visual token seed: `docs/frontend/tokens.md` (Pack 17 light tokens / ADR-0021 supersede Pack 20 prototype dark tokens for impl).

## Product Invariants

- VOC is AD-authenticated internal user-submitted voice; never create VOC from Survey Response.
- Finding is the bridge from evidence to execution.
- Task Request protects the Task backlog from unreviewed execution candidates.
- Task status and reporter-facing VOC status are separate state machines.
- Dashboard is an action queue surface, not a chart-only reporting page.
- Analytics Area is managed analytics-menu context, not a forced mirror of routes or code modules.
- Managed System is the MVP scope/filter/defaulting/Developer permission context; do not duplicate VOC, Survey, Task, Finding, Dashboard, or Integration trees per Managed System.
- Cross-system history is canonical through `entity_links`, not convenience columns.

## Implementation Boundaries

- Backend controllers parse HTTP and map responses only.
- Backend application services own transactions, permissions, audits, idempotency, and cross-system commands.
- Repositories write only tables owned by their module.
- Source-shaped routes do not grant write ownership to the source module.
- Frontend screens compose typed API hooks and shared components; they do not enforce backend permissions as truth.
- Frontend feature folders follow these ownership boundaries: `home`, `my-work`, `voc`, `findings`, `voc-cluster`, `surveys`, `tasks`, `cross-system`, `integration`, `admin`.
- Findings feature code lives in `features/findings/` and is mounted at top-level `/findings`. Integration owns the Evidence, Coverage, and Links UI boundaries. Coverage and Links routes stay under `/integration/*`; the Evidence route is planned, not built. VOC Clusters are implemented in `features/voc-cluster/` and mounted at the top-level `/voc-clusters` route.
- Managed System Registry, Analytics Areas, Permission Requests, and workspace settings live under Admin routes.
- `packages/shared` must not import either app. `packages/ui` must not call APIs or own domain mutations.

## Verification

- **The gate is `pnpm --filter backend test:integration` + `pnpm typecheck` + `pnpm check:boundaries` + `pnpm gate:db-migration-drift` + `pnpm gate:fe-typecheck` + `pnpm gate:fe-lint`** (plus the frontend pixel-diff harness for page-level FE work). `pnpm test` / `pnpm --filter backend test` alone is **not** the gate: the backend integration suites are env-gated and all skip without a database, so a green there covers only the unit path (#204). The integration command loads `.env` and **truncates + re-seeds the target database** before the run — point it at a throwaway database if the dev one matters. See `apps/backend/AGENTS.md` → Verification for the env, the reset contract, and the `ALLOW_SKIPPED_INTEGRATION=1` opt-out.
- The FE gates have setup traps (a fresh worktree needs the generated route tree first; the lint gate diffs committed history against a base ref — pass `--base origin/develop`). Read `scripts/gates/AGENTS.md` before running them or touching their baselines/allowlists.
- For behavior changes and bug fixes, write or update the failing test first, then make the smallest change that passes it. If TDD is not practical, state why and still add verification for the touched behavior.
- Add or update tests for product invariants touched by the change.
- For frontend work, verify desktop states when layout or interaction changes (see `apps/frontend/AGENTS.md` for pixel-diff rule).
- For backend work, verify permissions, entity link side effects, and audit behavior when touched.
- If verification cannot run, report the exact command and blocker.

### Test Discipline

Test code is a liability. Fewer, sharper tests beat more tests.

- Test behavior, not implementation. No asserts on private methods, internal state, or mock call counts/order (external side effects excepted).
- Before adding a test, grep for existing coverage. Do not duplicate at a lower level when an integration test already covers it.
- One test = one concept. Parameterize variants via `it.each`, not N copies.
- Do not test trivial passthrough (className, data-attr), getters/setters, framework behavior, or chase 100% coverage.
- Pruning: produce a deletion candidate list with one-line reason per file → wait for user approval → run the suite before/after → small batches, never bulk-delete.

## Workflow Operations

Execution playbook (roles, model tiers, task sizing, review/verify cycles, conductor conduct): the `/agent-workflow` skill (external toolkit). Its files under `.agent-workflow/` and `.claude/skills/agent-workflow` are gitignored, so a fresh worktree lacks them; call its scripts by absolute path from the main checkout.

Target-specific facts for that toolkit (must not migrate into the shared skill):

- **Verify signal traps.** A narrow test filter yields false PASS; a superuser app handle yields false FAIL. Gate runs use a whole-touched-module filter + the low-priv `fops_app` role (`VERIFY_DATABASE_URL`), with migrations applied via the separate `fops_migrate` URL. Cross-module verify noise is known debt (other modules' suites attempt `audit_log` DELETE with the app handle — fails by design).
- **Verify DBs.** Per-issue throwaway DBs via `prepare-verify-db.sh` (admin URL must be `postgres`, port 5434 — `fops_migrate` lacks CREATEDB). Rebuild after crashed runs or migration chunks; crash-polluted DBs produce phantom failures.
- **FE chunks are exempt from AC-ID discovery.** `completion-check.sh` maps AC-IDs by scanning test names, and only backend integration tests carry them here, so no FE chunk can pass that part of the gate. Trust its path and test-count checks; treat the AC-ID mapping as unavailable rather than as a failure to fix. Do not add AC-IDs to frontend test titles to satisfy the parser (#250, wontfix; upstream hjung3113/feedbackops-workflow#80).

## PR Review Priorities

When reviewing a PR, prioritize product invariant violations, ownership boundary violations, missing verification, accidental root source files, mismatches between docs and nested agent guides, and frontend changes that break the dense list-first operational UI model.

## Agent Skills

- **Issue tracker.** GitHub issues on `hjung3113/FeedbackOps` via the `gh` CLI; external PRs are not a request surface. Includes wayfinding operations for `/wayfinder`. See `docs/agents/issue-tracker.md`.
- **Triage labels.** Canonical defaults: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- **Domain docs.** Root `CONTEXT.md` owns the domain glossary and stable invariants; `docs/adr/` owns architectural decisions; per-directory `AGENTS.md` owns technical-layer rules. See `docs/agents/domain.md`.
- **Vendored skills.** `.agents/skills/` holds the vendored `mattpocock/skills`, symlinked into `.claude/skills/`. `caveman` and `zoom-out` are local-only additions. Upstream `code-review` is deliberately not vendored, so `/code-review` resolves to the Claude Code built-in.

<!-- agent-workflow:begin (managed by install-into.sh — do not edit) -->
### Model routing (installed by the agent-workflow toolkit)

Read before any dispatch:
- .agent-workflow/model-alloc.json — project-owned allocation contract
- .agent-workflow/docs/agents/multi-agent-workflow.md — Model Allocation
- .agent-workflow/docs/agents/conductor-persona.md — section 2: product-code writes are delegated by default; direct edits require the narrow explicit path

The allocation file is authoritative. CONDUCTOR dispatches artifact-producing work; workers produce code, docs, plans, and recon.
<!-- agent-workflow:end -->

**Routing precedence (user-set 2026-09-27):** the model routing the user sets for the current session supersedes the tier list in `.agent-workflow/model-alloc.json` above. If they disagree, follow the user's routing and flag the mismatch.
