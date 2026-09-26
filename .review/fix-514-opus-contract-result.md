# PR #526 Opus review follow-up result

Scope: reconcile the live Milestone data contract and the three authorized
status comments; investigate P3-5 and P3-6 without editing schemas, tests, or
backend behavior. `MilestoneDetailPanel.tsx` and frontend product tests were
outside this change.

The initial status check was clean at `da0f969`. While this work was in
progress, the shared branch advanced to `4123b24` and later status checks
showed modifications in `MilestoneDetailPanel.tsx`, its component test,
`MilestonesRoute.tsx`, and its edit test. Those paths were left untouched and
unstaged; this follow-up stages only the four authorized source/doc paths and
this report.

## P3-1 — Accepted Milestone status

Updated `docs/design/15-data-contracts.md` to state the status CHECK and the
four values fixed by Accepted ADR-0050. Updated the comments in
`apps/backend/src/modules/milestones/repo.ts`,
`apps/backend/src/modules/tasks/service.ts`, and
`apps/frontend/src/lib/api/milestones.ts` to refer to ADR-0050; the API comment
now records optional create/PATCH status and the `planning` default on omitted
create status. No executable statements changed.

The Opus review's `MilestoneCreatePanel` comment is inside
`apps/frontend/src/features/tasks/components/MilestoneDetailPanel.tsx` at
lines 237–242, so it remains untouched per the explicit ownership boundary.
`MilestoneStatusBadge.tsx` also has an “open G-status set” comment; that file
was not authorized. Migration 0049 and the approved plan retain their
historical pre-ADR wording. No other status wording was changed.

## P3-5 — Impossible calendar dates

**Finding: real validation gap; the predicted HTTP 500 is strongly supported
by the current path, but was not reproduced end to end.**

- `packages/shared/src/tasks/index.ts:11` defines `isoDateSchema` as only the
  `YYYY-MM-DD` regular expression. The Milestone create and PATCH schemas reuse
  it for `start_date` and `target_date` (`packages/shared/src/milestones/index.ts:40–41,55–56`).
  Therefore strings such as `2026-13-45` satisfy the visible schema shape.
- The schema test checks malformed shapes such as `2026-10-1` and
  `2026/12/31`, but not impossible month/day values
  (`packages/shared/src/milestones/__tests__/schema.test.ts:98–104`). The
  Milestone API contract describes invalid request bodies as 422
  (`docs/implementation/api/milestones.md:19–30,141–153`).
- The service passes these values to repository insert/update fields backed by
  PostgreSQL `date` columns (`apps/backend/src/modules/milestones/service.ts:207–218,381–399`,
  `apps/backend/migrations/0049_milestone_domain.sql:15–16`). An impossible
  calendar date can therefore fail at the database boundary after request
  validation. The global handler returns 500 `internal.unexpected` for an
  unclassified error (`apps/backend/src/lib/http-error-handler.ts:55–56`).
- The approved plan explicitly says not to impose `target_date >= start_date`
  (`.review/plan-514.md:55`). No date-order defect is established by this review.

**Bounded repair recommendation:** in a separately authorized behavior change,
add calendar validity checking to the Milestone request-date schema so invalid
create/PATCH dates fail validation with 422 before persistence. Avoid silently
changing the shared Task `isoDateSchema`, which also validates Task `due_date`,
unless that broader contract is explicitly intended. Add focused schema/API
coverage for an impossible month and day. Do not add a start/target ordering
rule without a contract decision. No schema or test changes were made here.

## P3-6 — Workspace-global integration assertions

**Finding: latent coupling, not a demonstrated flake under the current
canonical integration runner.**

- The create idempotency test counts all `MLS-%` Milestones in the workspace
  and expects one (`create-milestone.integration.test.ts:200–205`). Its test
  creates one Milestone on a unique test Managed System. It already verifies
  that a replay returns the same id, leaves the display counter unchanged, and
  leaves one row for that id (`:169–198`); the workspace-wide count is extra
  coverage but has broader fixture coupling.
- The status-list test creates three Milestones under one test Managed System
  and expects three items from an unfiltered Admin list
  (`list-milestones.integration.test.ts:185–206`). This exercises the
  workspace-wide Admin list contract; changing the call to a Managed-System
  filter would narrow that coverage.
- `apps/backend/vitest.config.ts:8–17` sets `fileParallelism: false` because
  integration files share one Postgres database and cleanup can affect other
  fixtures. Neither Milestone suite uses concurrent test declarations.
- The canonical command `pnpm --filter backend test:integration` loads the
  required integration environment and runs Vitest. `global-setup.ts:15–50`
  truncates all product tables then reseeds by default; only explicit
  `TEST_DB_NO_RESET=1` skips that isolation. The seed contains no Milestones,
  and the Milestone suites clean their own prefixed fixtures before each test
  and after the file.

Thus parallel Milestone files and seeded/pre-existing Milestones are not part
of the current intended gate. The assertions can become order/data sensitive
if file parallelism is re-enabled or reset is bypassed. No test edits are
recommended for this bounded follow-up. If that runner contract changes, scope
the create count to its fixture Managed System and make the Admin-list test
assert the three known fixture ids are visible; keep any global-workspace
visibility assertion separate from the exact fixture cardinality.

## P3-7 and preserved review artifacts

`.review/SLICE-514-pixel-diff.html` remains tracked and present: the frontend
agent guide requires the CP-pixel report for page-level work, and
`.review/plan-514.md:891–893,916–923` explicitly requires this Milestone report as
a completion gate. `.review/fix-514-gates-result.md` also remains tracked as a
historical result, as requested. No artifact cleanup was done.

## Commands and verification

Read-only evidence collection included:

- `git status --short --branch`, `git rev-parse --show-toplevel`,
  `git log -1 --oneline`
- `rg -n "2026-13-45|2025-02-29|impossible|invalid.*date|isoDateSchema" packages/shared/src/milestones packages/shared/src/tasks apps/backend/src/modules/milestones/__tests__`
- `rg -n -C 8 "toHaveLength\(3\)|count\(\*\)|MLS-%" apps/backend/src/modules/milestones/__tests__/create-milestone.integration.test.ts apps/backend/src/modules/milestones/__tests__/list-milestones.integration.test.ts`
- `rg -n "it\.concurrent|test\.concurrent|describe\.concurrent" apps/backend/src/modules/milestones/__tests__ || true`
- `sed -n` / `nl -ba` reads of the cited schemas, contracts, migrations, error handler, Vitest config, integration setup/reset script, tests, `AGENTS.md` files, approved plan, and final Opus review
- `rg -n -i "milestone" apps/backend/src/seed`
- `git ls-files --error-unmatch .review/SLICE-514-pixel-diff.html .review/fix-514-gates-result.md`

`git diff --cached --check` is the only post-edit verification. No tests,
database commands, build/typecheck, browser, schema changes, or runtime changes
were performed. The authorized commit command is
`git commit -m "docs(#514): reconcile milestone status authority"`.
