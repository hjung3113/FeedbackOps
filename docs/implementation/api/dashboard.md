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

`coverage.released-update` is **Released Task with public update**: its total
is released Tasks in scope with at least one active `voc → task` `evidence_of`
link to a non-archived VOC; its value is the subset with at least one linked
VOC that has a non-skipped `voc.voc_public_updates` row. A skipped update is a
recorded status transition without reporter-visible content and does not count
as coverage.
