# FeedbackOps Agent Guide

## Operating Rules

- Think before editing. State assumptions when the request can be read in more than one way.
- Prefer the smallest change that satisfies the request. Do not add speculative flexibility.
- Touch only files required by the task. Mention unrelated issues instead of fixing them.
- Match existing docs and implementation patterns before inventing new structure.
- Every changed line must trace to a user request, a documented invariant, or a failing verification.
- For multi-step work, define success criteria and verify them before claiming completion.
- If domain rules conflict with generic framework habits, follow the domain rules.
- Finish one issue fully (tests + typecheck + boundaries + commit + PR + merge + close) before starting the next.
- Stop on locked-decision ambiguity — see [Source Of Truth](#source-of-truth) → "Stop and report" for the exact condition. Never resolve unilaterally.

## Prototype Is The Spec

`docs/design-prototype/` is the **functional + visual + copy specification** for every user-facing surface. Not a reference, not inspiration — the spec.

- **Read first.** Before any frontend chunk (route, screen, panel, component used in a screen), open the matching `screen-*.jsx` + `data.js` and the relevant `screenshots/final-baselines/<page>.png`. If a chunk creates UI without reading prototype, that chunk is rejected on review.
- **Layout, hierarchy, density, spacing, copy come from prototype.** Do not invent placement, group order, or visual rhythm. Mirror what the prototype shows. Deviations require an explicit ADR or a user OK, recorded in the PR body.
- **Copy verbatim, mixed-language allowed.** Copy may mix Korean and English freely. Prototype text remains the source of truth — copy what the prototype shows verbatim, whether Korean, English, or a mix. Do not blanket-translate one to the other, but variance per surface (e.g. 'BODY' label in detail panel, '설명' in create form) is allowed when reference designs/screenshots so direct.
- **Three-shell taxonomy (ADR-0020 / Pack 17).** Every screen is `PageShell`, `ListShell`, or `WorkbenchShell`. Special pages extend the three — never a new shell.
- **Prototype contradicts spec text:** prototype wins for copy/layout; spec wins for behavior/AC. Document the path taken in a one-line code comment.
- **Do NOT port from prototype:** hash routing, `window` globals, `document.execCommand`, synthetic local data, draft-only API intent panels. Production routing is TanStack Router; rich text is TipTap (ADR-0002 / ADR-0011) — not the prototype's `RichEditor`.

For pixel-diff enforcement on page-level FE issues, see `apps/frontend/AGENTS.md` → Page-Level Pixel-Diff. For the full operating playbook, see the `/agent-workflow` skill (external toolkit).

## Git Workflow

- **Per-issue feature branch.** `feature/<issue-number>-<slug>` branched from `develop`. Never commit directly to `develop` or `main`. `fix/<n>-<slug>` for hot-fixes; `chore/<slug>` for housekeeping (may target `develop` via small PR).
- **Issue complete → PR to `develop`.** After review the user merges; delete the feature branch on merge.
- **Slice complete → PR `develop` → `main`.** User owns the final `develop` → `main` merge and any tag/release. No agent push to `main`.
- **Exception.** Slices 1–3 shipped directly to `main` before this rule landed. From #14 onward, follow the flow above.
- **Pre-push hook.** `.githooks/pre-push` blocks direct pushes to `main` that touch files other than `README*`. Enable once per clone: `git config core.hooksPath .githooks`. Client-side only; the real gate is GitHub branch protection.

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

1. `docs/design-prototype/` (HANDOFF.md + `screen-*.jsx` + `data.js`) — verbatim authority. Korean and English may coexist freely; mirror the prototype string regardless of language. Surface-level convention (what the reference shows) matters more than blanket language consistency; do not reflexively translate either direction.
2. `docs/frontend/specs/*.md` when prototype is silent
3. `CONTEXT.md` when neither has a verbatim string

**Per-domain pointers:** endpoint behavior → `docs/implementation/03-api-contracts.md`; DB + migrations → `04-database-and-migrations.md`; module ownership → `02-domain-module-boundaries.md`; permissions → `05-permission-policy.md`; entity links → `06-entity-linking-contract.md`; frontend routes → `docs/frontend/routes-and-layout.md`; component contracts → `docs/frontend/ui-design-system.md` + `component-inventory.md`. Visual token seed: `DESIGN.md` (Pack 17 light tokens / ADR-0021 supersede Pack 20 prototype dark tokens for impl).

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
- Frontend feature folders follow top-level route ownership: `home`, `my-work`, `voc`, `voc-cluster`, `surveys`, `tasks`, `integration`, `admin`.
- Integration owns Findings, Evidence, Coverage, and Links feature code. Findings routes at top-level `/findings`; Evidence, Coverage, and Links stay under `/integration/*`. VOC Clusters are implemented in `features/voc-cluster/` and mounted at the top-level `/voc-clusters` route.
- Managed System Registry, Analytics Areas, Permission Requests, and workspace settings live under Admin routes.
- `packages/shared` must not import either app. `packages/ui` must not call APIs or own domain mutations.

## Verification

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

Execution playbook (roles, model tiers, task sizing, review/verify cycles, conductor conduct): see the `/agent-workflow` skill (external toolkit). The toolkit installs here via `install-into.sh <target>`, which **copies** four managed leaves as a self-contained snapshot: `.agent-workflow/{scripts,schemas,docs/agents}` + `.claude/skills/agent-workflow`. Existing installs upgrade with `--upgrade`; `--mode`/`--force` no longer exist and are rejected.

The four leaves are gitignored here, and **git worktrees do not inherit ignored files** — a fresh worktree has no `.agent-workflow/`, so a relative `.agent-workflow/scripts/...` call from inside one fails with `No such file or directory`. Until toolkit issue #62 lands, call the scripts by absolute path from the main checkout, or install into the worktree.

### Target Profile (toolkit adapter answers for THIS repo)

Answers to the toolkit's compatibility interview (`references/adoption.md`) — target-specific facts that must not migrate into the shared skill:

- **Verify signal traps.** A narrow test filter yields false PASS; a superuser app handle yields false FAIL. Gate runs use a whole-touched-module filter + the low-priv `fops_app` role (`VERIFY_DATABASE_URL`), with migrations applied via the separate `fops_migrate` URL. Cross-module verify noise is known debt (other modules' suites attempt `audit_log` DELETE with the app handle — fails by design).
- **Verify DBs.** Per-issue throwaway DBs via `prepare-verify-db.sh` (admin URL must be `postgres`, port 5434 — `fops_migrate` lacks CREATEDB). Rebuild after crashed runs or migration chunks; crash-polluted DBs produce phantom failures.
- **FE visual harness.** Committed Playwright harness at `apps/frontend/tests/visual` (vite-preview IPv4, fail-closed Zod-validated mock, CP-pixel sign-off). Sandboxed codex has no browser — the conductor generates baselines outside the sandbox. Every new screen needs fixture + spec.
- **FE design review.** Reviews compare the implementation against the RENDERED prototype (`docs/design-prototype/`), not prose specs; hand the implementing agent the prototype screen up front.
- **Migrations.** Every new drizzle migration must be registered in the drizzle journal in the same chunk (omission has cost a review round).

## PR Review Priorities

When reviewing a PR, prioritize product invariant violations, ownership boundary violations, missing verification, accidental root source files, mismatches between docs and nested agent guides, and frontend changes that break the dense list-first operational UI model.

## Agent Skills

- **Issue tracker.** GitHub issues on `hjung3113/FeedbackOps` via the `gh` CLI; external PRs are not a request surface. Includes wayfinding operations for `/wayfinder`. See `docs/agents/issue-tracker.md`.
- **Triage labels.** Canonical defaults: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- **Domain docs.** Root `CONTEXT.md` owns the domain glossary and stable invariants; `docs/adr/` owns architectural decisions; per-directory `AGENTS.md` owns technical-layer rules. See `docs/agents/domain.md`.
- **Workflow.** Model tiers, REV cycles, dispatch patterns: the `/agent-workflow` skill (external toolkit).
- **Vendored skills.** `.agents/skills/` holds the vendored `mattpocock/skills`, symlinked into `.claude/skills/`. `caveman` and `zoom-out` are local-only additions. Upstream `code-review` is deliberately not vendored, so `/code-review` resolves to the Claude Code built-in.
