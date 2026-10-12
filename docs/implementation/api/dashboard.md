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
audit row or source record. `milestone-outcome` is a reserved coverage id that
is never emitted (no Milestone-outcome coverage definition exists yet).

The response also requires `by_managed_system`, a sibling array containing the
same projections for each Managed System in the union of the caller's VOC,
elevated Finding, Task-management, and survey-read scopes. The rolled-up
`kpis`, `action_queues`, and `coverage` remain the Home contract; clients must
not replace them with sums or averages of the per-system rows.

Within each row, metric keys are independently omitted when the caller lacks
that metric's capability for the system. An omitted key means the actor cannot
receive that projection; it does not mean zero. A permitted empty result is
present with zero. `kpis` contains `open_voc`, `active_finding`,
`tasks_in_flight`, and `coverage_percent`, each under the corresponding
VOC, Finding, or Task capability. It has no `pending_request` key because that
projection combines workspace and permission-request data. These row KPI
values are per-system projections, not sums or averages of the workspace-level
roll-up. The same absence rule applies to `coverage` and `action_queues`.
`analytics_areas` is omitted unless a readable system has at least one
non-archived VOC assigned to an Analytics Area; it contains only VOC coverage
and queues. `permission-requests-pending` remains workspace-level and is not
included in system rows.

`coverage.released-update` is **Released Task with public update**: its total
is released Tasks in scope with at least one active `voc → task` `evidence_of`
link to a non-archived VOC; its value is the subset with at least one linked
VOC that has a non-skipped `voc.voc_public_updates` row. A skipped update is a
recorded status transition without reporter-visible content and does not count
as coverage.

`dashboardSummarySchema` in `packages/shared/src/dashboard.ts` defines the
closed coverage ID set (`coverage[].id`) and per-Managed-System coverage shape
(`by_managed_system[].coverage`); `DASHBOARD_HOP_ROUTES` in the same file defines
dashboard hop IDs and destinations.

## Close-out Coverage and freshness (ADR-0067; implementation pending)

Proposed/new summary `computed_at` is server computation time, not an atomic database
snapshot. Home, Coverage and Integration show the last successful timestamp and preserve
an honest stale/error state on refetch failure. Summary remains bounded and operational;
item details/history are fetched separately.

Read resolved Coverage settings once per summary. Apply each metric's good/warn pair to
roll-up/system/area cells with current rounding: good >= good cutoff, warn >= warn cutoff,
otherwise bad. Total zero keeps value=0/total=0/percent=0 and proposed/new `status=no_data`,
neutral `집계 대상 없음`. Permission-unavailable keys remain absent/`—`. Default pairs are
75/40; exactly the five emitted metrics are editable in `/admin/settings`. Ratios,
released-update's non-skipped predicate, queue membership, and anonymity do not change.

## Recovery queue, detail, presentation and history (proposed/new, ADR-0067)

- `GET /dashboard/recovery-items?category=...&managed_system_id=...&cursor=...&limit=...`
- `GET /dashboard/recovery-items/:id`
- `GET /dashboard/recovery-history?category=...&managed_system_id=...&cursor=...&limit=...`
- `PATCH /dashboard/recovery-items/:id/presentation`

Authenticated session workspace and current category/source visibility bound every read.
`all` is capability-specific effective scope union; Permission Requests remain workspace
Admin-only. Lists default to 50, max 100, deterministic cursor order. Apply scope/category/
presentation predicates before LIMIT/count. List DTOs include visible and personally
hidden totals; operational summary totals ignore hiding and assignee. Home requests only
items the current Actor can act on now, without changing scope-wide operational summaries.

Stable opaque `recovery_item_id` maps workspace/category/source, shared across surfaces;
different categories on one source remain distinct. Existing grains/predicates are retained:
VOC for `unassigned-voc`/`high-severity-unlinked`, Finding for
`actionable-finding-no-execution`, one Task for `released-task-unresolved-voc` even with
many affected VOCs, Permission Request for `permission-requests-pending`.
`bad-outcome-no-followup` uses the exception below. No wishlist categories are added.

Detail returns identity/occurrence, active/resolved/withdrawn state, backend reason/priority/
severity, safe affected summaries, independently gated source identity/route jumps,
permission-filtered `next_actions`, derived `responsible_actor_hint`, presentation and
safe resolution metadata. Unknown/foreign/unreadable identity returns the same
`404 not_found.record`. A readable resolved selection remains open without stale actions.
Recheck current source visibility for detail/history/action references; readable Task gaps
must not expose restricted linked VOC titles/routes/actions. Hints derive from source owner,
assigned reviewer/assignee or Admin queue, with safe team/unassigned/multiple-responsible
labels; omit email and any unsafe identity. Assignment never grants action eligibility.

Presentation PATCH is a strict discriminated command: proposed/new `action` is `snooze`
(with proposed/new `days` exactly 1 or 7), `mute`, or `restore`. Derive Actor from session;
reject caller Actor/resolution/owner fields with `validation.failed`. Authorize current
item visibility before writing only that Actor/identity/occurrence presentation. Mute ends
with the occurrence; reopen resets all hiding. Restore clears current hiding. Domain state,
operational totals and source mutation audits remain unchanged. There is no generic
resolve/dismiss endpoint; stale source repairs use `api/next-actions.md` failures.

History covers three calendar months by resolution time, cursor-paged and currently
permission-filtered. Source/link commands call a transaction-aware Dashboard recorder
through injected approved seams, reevaluate authoritative predicates, lock/deduplicate
identity and record only committed transitions with safe action/audit references.
Rollback/no-op/replay yields no duplicate repair. Reopen increments occurrence and retains
prior history even between scans. Permission loss is not resolution; archive/policy
withdrawal has a separate label. pg-boss initializes active identities and reconciles drift
idempotently; observation-only corrections do not invent Actor/action time. Generic GETs
write neither source nor projection state/audit. Do not fabricate pre-rollout history or
prune indefinite `core.audit_log`.

### Outcome Survey adapter exception

ADR-0055 remains binding: closed/threshold/low-band per-response classification, resolution
only by qualifying `generated_finding` or current `no_follow_up`, Survey-owned state,
commands/reopen/audits. Dashboard retains its authorized aggregate count and Survey-level
safe navigation. Non-personal holders receive Survey-grain booleans, no per-Survey response
counts, response IDs/opaque response-derived IDs, raw answers, or per-response personal
presentation/history enumeration. Personal holders enter the existing Survey follow-up
route/seam (`survey.read` then explicit `survey.read_personal_responses`, no Admin bypass).
Response presentation/history is a proposed/new Survey-owned adapter, with required personal
read audits and no duplicated decision state. Generic Dashboard APIs never bypass it.

### Performance acceptance

On identical throwaway ~5k-VOC/~5k-Task data, warm summary/list/detail p95 <=500ms;
summary p95 also <=develop p95 ×1.2+50ms. Record median/p95 across multiple scopes/system
counts, query plans and recorder multi-VOC fanout latency. Batch labels/readability and
avoid per-item queries/unbounded rows. UI median `readyMs` threshold and visual checks
follow ADR-0067. These are adopted requirements, not measured PASS evidence.
