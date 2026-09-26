# Milestones Module Agent Guide

## Ownership

Milestones owns `task.milestones` (create, read, update — no delete; `fops_app`
has no DELETE grant and both FKs are ON DELETE RESTRICT). Reads of Tasks or
Findings go through those modules' `index.ts` seams, never their repos.

## Invariants

- Writes require Admin or Developer with `finding.manage` on the Milestone's
  Managed System (`checkFindingManage` with `requireElevatedRole: true`).
- `primary_managed_system_id` is create-only; no update path writes it.
- `status` is a plain text column defaulting to `planning`; Accepted ADR-0050
  fixes the persisted set to `planning | in_progress | blocked | released`.
  Create accepts an optional value in that set, and PATCH may set any value in
  the set.
- `finding.findings.linked_milestone_id` has no application writer in this
  module. The FK exists; the writer does not.
- `milestones/repo.ts` writes only `task.milestones` and never reads
  `task.tasks` or `finding.findings` (module-seams guard).

## Verification

- `apps/backend/src/modules/milestones/__tests__/` integration suites.
- `apps/backend/src/__tests__/module-seams.test.ts` covers the repo-import and
  foreign-table rules above.
