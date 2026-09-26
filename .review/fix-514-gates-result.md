# Issue #514 gate repair result

## Authority

- Approved plan `.review/plan-514.md:180` specifies `SELECT, INSERT, UPDATE` for `fops_app` and explicitly excludes `DELETE`; line 196 says `fops_app` cannot delete a Milestone.
- Migration `apps/backend/migrations/0049_milestone_domain.sql:34` already grants exactly `SELECT, INSERT, UPDATE` to `fops_app`.
- The tracked design contract at `docs/superpowers/specs/2026-09-26-milestone-domain-design.md:238` also rules out hard delete and says to match the Task grant set.

## Changes

- Added `task.milestones: ['SELECT', 'INSERT', 'UPDATE']` to `EXPECTED_GRANTS` in `apps/backend/src/db/__tests__/role-grants-product-tables.integration.test.ts`. `DELETE` is intentionally absent.
- Removed the six unnecessary exports from `apps/backend/src/__tests__/module-seams.test.ts`. Source import search across `apps/` and `packages/` found no consumers; the scanner calls remain inside the same test module. Updated the adjacent comment to describe local helpers. No Biome allowlist entry was needed.
- Formatted only `apps/backend/migrations/meta/_journal.json` and `apps/backend/migrations/meta/0050_snapshot.json` with `pnpm exec biome format --write`. Parsed JSON stayed identical to the pre-format versions. Canonical JSON SHA-256 values before and after were unchanged:
  - `_journal.json`: `682945ce15344f89a169682d952e740ab8e5e3ef4fe820252763f3bca19bdeeb`
  - `0050_snapshot.json`: `c29b798117bcb659df27c78067d0630c9d20f3d50555424b9812d891cf7e1fbf`

## Evidence and verification

- Existing RED evidence: `.review/gate-514-backend-full.log` reports `fops_app missing GRANT DELETE ON task.milestones`; the failure came from the test's default full-DML expectation, not from migration 0049.
- GREEN command: `FEEDBACKOPS_ENV_FILE=$PWD/.review/verify-514.env pnpm --filter backend test:integration src/db/__tests__/role-grants-product-tables.integration.test.ts`
  - Passed: 1 test file, 4 tests. Integration setup reset 40 tables in `fops_verify_514_20260927`.
- `pnpm gate:fe-lint`: passed; 67 changed files, 0 error identities, 0 warnings, 157 existing allowlisted identities, 0 unexpected errors. This clears the six `noExportsInTest` diagnostics and the two metadata formatting errors recorded in the prior `.review/gate-514-fe-lint.log`.
- `git diff --cached --check`: clean for the owned files staged with this repair.

No migration SQL, Milestone UI, or allowlist file was changed by this repair.
