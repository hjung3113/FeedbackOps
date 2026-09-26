# Dashboard

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Dashboard Summary Contract

`GET /dashboard/summary?managed_system_id=<uuid|all>` is an authenticated,
workspace-scoped read returning KPI, action-queue, and coverage projections.
`all` resolves to the caller's effective Managed System scope (workspace-wide
only for an Admin). Each key is independently omitted when its backing read is
unavailable or returns `permission.denied` / `permission.scope_required`. A
permitted, empty backing result is present with zero; absence means the actor
cannot receive that projection, not that its count is zero. The route writes no
audit row or source record. `milestone-outcome` is absent until the MVP has a
Milestone backing table and filter.

The response also requires `by_managed_system`, a sibling array containing the
same projections for each Managed System in the union of the caller's VOC,
elevated Finding, Task-management, and survey-read scopes. The rolled-up
`kpis`, `action_queues`, and `coverage` remain the Home contract; clients must
not replace them with sums or averages of the per-system rows.

Within each row, metric keys are independently omitted when the caller lacks
that metric's capability for the system. An omitted key means the actor cannot
receive that projection; it does not mean zero. A permitted empty result is
present with zero. This distinction applies to both `coverage` and
`action_queues`. `analytics_areas` is omitted unless a readable system has at
least one non-archived VOC assigned to an Analytics Area; it contains only VOC
coverage and queues. `permission-requests-pending` remains workspace-level and
is not included in system rows.

`coverage.released-update` is **Released Task with public update**: its total
is released Tasks in scope with at least one active `voc → task` `evidence_of`
link to a non-archived VOC; its value is the subset with at least one linked
VOC that has a non-skipped `voc.voc_public_updates` row. A skipped update is a
recorded status transition without reporter-visible content and does not count
as coverage.
