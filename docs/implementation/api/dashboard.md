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

Each action queue's `next_action.route` is the filtered source list its count
promises (#1179): `actionable-finding-no-execution` → `/findings?execution=none`,
`released-task-unresolved-voc` → `/tasks?view=backlog&reporter_update=needed`,
`bad-outcome-no-followup` → `/surveys?follow_up=needed`. The Survey count stays
response-grain while that list is Survey-grain (ADR-0067). Browsers keep the
selected Managed System on these links by appending `managedSystem=<id>`; the
backend route string itself stays System-free.

## Close-out Coverage and freshness (ADR-0067; 56-G implemented)

Required summary `computed_at` is server computation time, not an atomic database
snapshot. Home, Coverage and Integration show the last successful timestamp and preserve
an honest stale/error state on refetch failure. Summary remains bounded and operational;
item details/history are fetched separately.

The BE Coverage contract (#1087) reads resolved settings once per summary. Apply each metric's good/warn pair to
roll-up/system/area cells with current rounding: good >= good cutoff, warn >= warn cutoff,
otherwise bad. Total zero keeps value=0/total=0/percent=0 and `status=no_data`,
neutral `집계 대상 없음`. Permission-unavailable keys remain absent/`—`. Default pairs are
75/40; the five-pair `/admin/settings` editor and the neutral rendered consumers
(Home rows, Coverage roll-up/cells, Integration system column and measured-only average)
shipped with #1088 in the same PR as this contract. Ratios,
released-update's non-skipped predicate, queue membership, and anonymity do not change.

## Recovery queue, detail, presentation and history (ADR-0067)

### Live reads (56-G, extended by 56-H)

- `GET /dashboard/recovery-items?category=...&managed_system_id=...&view=operational|actionable&presentation=visible|hidden&cursor=...&limit=...`
- `GET /dashboard/recovery-items/:id`

Both require the authenticated workspace session and the configured read rate tier; responses
use `Cache-Control: private, no-cache`. The list query is strict: unknown fields, invalid
category/view/scope/limit/cursor return `422 validation.failed`. Default view is `operational`,
default limit 50, maximum 100. `managed_system_id` is optional UUID or `all`; omitted/all resolves
each category's own capability scope. Permission Requests remain workspace-level under
`workspace.admin`, independent of a selected System; an explicit deny wins. No caller Actor,
owner or resolution field is accepted. `presentation` defaults to `visible`; `hidden` selects
only the session Actor's currently muted or unexpired snoozed occurrence.

`view=actionable` is Home's explicit selector. Owner-computed executable repair eligibility
is applied **before count and cursor LIMIT**, under independent source readability. Assignment,
a source jump, a blocked/requestable action or a presentation action alone never qualifies.
Operational totals stay scope-wide. VOC uses current `voc.triage` and live parent policy;
Finding execution uses its source command gate; Task reporter updates require an independently
readable, non-archived unresolved affected VOC with public-update authority and a live parent.
Permission review uses current decision gates (a rejection intent grants no self-approval).
Survey repair requires personal-response authority and `finding.manage`, described below.
Source commands still recheck state, concurrency, permissions and required inputs on submit.

List response is strict `{ computed_at, items, total, visible_total, hidden_total, page: { has_more, cursor? } }`.
`visible_total + hidden_total` counts the same currently authorized category/System/view matched
set before personal selection and paging. `total` is the selected presentation count before
paging. Hiding is applied before cursor/LIMIT, preserving full pages and count parity. Summary
operational totals remain unchanged; actionable membership remains capability-specific. Items and detail contain `recovery_item_id`, `category`, current
`state`, backend `reason_code`/Korean `reason`, numeric `priority`, `severity`, nullable
`managed_system_id`, nullable safe `source`, bounded safe `affected`, `next_actions` and derived
`responsible_actor_hint`, nullable positive `occurrence`, `presentation: { state:
visible|snoozed|muted, snoozed_until: ISO timestamp|null }`, and nullable `resolution: {
resolved_at, outcome: resolved|withdrawn, evidence: command|observation, action: string|null }`.
Detail adds `computed_at`. Before discovery, occurrence and resolution are null and presentation
is visible; this does not claim prior history. A live/stored state mismatch also suppresses old
occurrence hiding until a write or reconciliation aligns it. Timestamp is computation time, not an
atomic database snapshot; independently refreshed summary/list/detail can observe changes.

Order is ascending backend priority (10 urgent, 20 warn, 30 info), then category identifier,
then source UUID. Cursor is opaque and versioned, bound to session Actor/workspace, effective
read/repair scopes, category, selected System, view and presentation; incompatible or noncanonical cursors
fail with `fields[].path=[cursor]`, `code=invalid_cursor`. Changing filters/scopes starts paging
again. Page hydration batches safe linked VOCs and bounds affected summaries to 100 per Task;
responsibility considers all currently readable affected owners, including beyond that bound.
No per-item owner-service queries or personal Survey readers are used.

Identity wire format is **opaque to clients; clients must not parse it**. Version 1 uses
`r1_` followed by canonical unpadded base64url of exactly 17 bytes: one category code byte,
then the 16 source UUID bytes. Codes: 1 unassigned-voc, 2 high-severity-unlinked,
3 actionable-finding-no-execution, 4 released-task-unresolved-voc,
5 bad-outcome-no-followup, 6 permission-requests-pending. Validate prefix, alphabet, length,
code and exact canonical re-encoding. Workspace comes from the session. Same category/source
has the same ID across reads/restarts/surfaces; different categories remain distinct.
Survey identity encodes the **Survey ID**, never a response ID. H storage keys workspace plus
this token. It is an address, not a credential, encryption or proof of a prior occurrence.

Task membership preserves the scope-wide predicate even when a User lacks the elevated source role: its source is null, with no affected objects, owner identity or actions; its detail returns the same 404.

Detail rechecks category/source compatibility and readability. VOC categories address VOCs,
Finding addresses Findings, Task addresses Tasks, Permission addresses Permission Requests,
and the Survey category addresses outcome Surveys only. A compatible readable source returns
`active` while its authoritative predicate holds, `withdrawn` for archived VOC/Finding or
cancelled Permission Request, otherwise `resolved`, even without historical gap proof.
Readable resolved/withdrawn selections return 200 with no repair actions. Malformed,
unsupported, noncanonical, unknown, incompatible, foreign or unreadable addresses all return
the same `404 not_found.record` (`recovery item not found`). Permission loss never resolves an item.

G's strict recovery action DTO is distinct from summary navigation metadata. It carries
`id`, Korean `label`, `availability` (`available`, `blocked_requestable`,
`blocked_not_requestable`), nullable `blocked_reason` and `requestable_permission`, a safe
`target` (`source_type`, `source_id`, route, nullable endpoint/method, intent), and backend
`confirmation` metadata (required flag, title/body, risk level, required reason and audit-event intent). Available actions have no blocked fields; requestable blocked
actions require a safe candidate. Hidden actions are omitted. G currently emits available
repair intents only; unavailable repairs are omitted. Generic source commands identify their
existing endpoint/method. Survey `create_finding` is a routed repair intent: endpoint/method
are null because response selection and the audited personal commands belong to the follow-up
route. An authorized safe Survey jump alone is never this action. No Dashboard repair command
or duplicated source workflow is introduced.

Source and affected summaries contain only independently readable IDs/display IDs/titles/routes.
Admin-only Permission Request recovery sources use the workspace-matched requester's display name
as `source.title` (fallback `Permission Request` when empty), with `source.display_id = null`.
The source UUID remains unchanged for routing and recovery identity; the queue does not display it.
Recovery `source.route`, affected routes and action targets use mounted frontend selection URLs:
VOC `/vocs?selected=:id`, Task `/tasks?param=:id`, Finding `/findings?selected=:id`,
Permission Request `/admin/permissions/requests?selected=:id`, and Survey
`/surveys/:id/follow-up`. VOC `triage` repair targets additionally carry
`view=triage&managedSystem=:repairSystemId` so the owning scoped Triage workflow opens.
VOC public-update intents select the readable VOC on `/vocs`; endpoint metadata is not a browser URL.
Frontend jumps append a bounded internal queue `returnTo` and preserve browser history for Back.

A Task gap may depend on restricted VOCs without exposing their identity, title, route,
owner or action. Hints use persisted VOC/Finding owner, safely readable affected VOC owners
and/or Task assignee, Survey operator or Admin queue. Actor/team hints carry safe source-owned
IDs and generic labels, never email; multiple distinct readable responsibilities produce
`multiple`, never an arbitrary owner. Hints grant no authority and have no mutation endpoint.
GETs write no source, projection, idempotency or domain audit rows. Infrastructure rate-limit
writes are outside this no-product-write contract.

### Outcome Survey adapter exception (56-G)

ADR-0055 remains binding: closed/threshold/low-band classification, resolution only by
qualifying current `generated_finding` or current `no_follow_up`. Summary's authorized
aggregate remains **response-grain**, unchanged. Safe recovery list/total are **Survey-grain**
(one Survey with follow-up needed), explicitly exempt from numeric summary/list equality.
Every other category retains exact membership/grain/count parity under stable fixture data.

The Survey-owned safe batch adapter evaluates the existing safe Survey-state definer over
an authorized materialized source set. Empty effective scopes fail closed before any
aggregate/state definer call; an outside-selected System cannot replace scope. Admin's
permitted empty data is zero, while all-denied projection availability is absent. Survey
explicit-deny precedence stays intact. Generic reads return Survey metadata and boolean-derived
state only, even for personal holders: no response IDs/response-derived IDs, per-Survey
response counts, raw answers or respondent metadata. Personal access plus Finding management
allows a current routed repair intent; it never enlarges the generic payload.

Personal disclosures continue on `/surveys/:surveyId/follow-up` via the existing
`GET /surveys/:id/outcome-follow-up`: `survey.read`, then explicit
`survey.read_personal_responses`, **no Admin bypass**, and unchanged per-response/question
personal read audits. Generic reads never invoke that personal service. Response presentation
and history are Survey-owned in H, as specified below.

### 56-H: personal presentation and calendar-month history

`PATCH /dashboard/recovery-items/:id/presentation` uses the session Actor/workspace and the
mutation rate tier. Strict bodies are exactly `{ action: 'snooze', days: 1|7 }`,
`{ action: 'mute' }`, or `{ action: 'restore' }`; unknown Actor/owner/resolution fields,
contradictory days and invalid actions return `422 validation.failed`. It returns current detail.
It changes only personal projection state: no source command, source audit or summary count.

The write locks the canonical workspace/token, then rechecks source compatibility, independent
readability and active truth inside its transaction. A readable active gap without storage is
seeded at occurrence 1 for snooze/mute. Resolved/withdrawn snooze/mute returns
`409 conflict.stale_write`; absent-row restore is a successful no-op that creates no episode.
Malformed, foreign, incompatible and unreadable tokens retain detail's indistinguishable 404.
One/seven-day snooze expires at the stored timestamp. Mute applies to the current occurrence.
Real resolve→reopen increments occurrence and resets every Actor's hiding, retaining history.

`GET /dashboard/recovery-history` accepts strict category/System/limit/cursor filters (50
by default, maximum 100), without view, presentation or caller authority. Response is
`{ computed_at, window_start, items: [{ id, item, occurrence, resolution }], total,
page: { has_more, cursor? } }`. `item` is a currently permission-filtered safe recovery summary;
`occurrence` and `resolution` describe the historic episode. No raw body, private reason,
respondent identity, deciding Actor or audit reference is disclosed. Every row rechecks current
source visibility and permissions **before count and LIMIT**. Permission loss hides history,
never records a repair. Withdrawal/archive is labelled `withdrawn`, distinct from `resolved`.

The lower bound is inclusive: the first instant of the current UTC month minus two whole
calendar months (`date_trunc('month', now() at time zone 'UTC') - interval '2 months'`).
On 2026-10-13 it is 2026-08-01T00:00:00Z. There is no timezone setting, 90-day arithmetic,
month-end clamping or database-session timezone dependency. Order is `(resolved_at DESC, id
DESC)`; canonical cursors bind Actor/workspace/category/System/effective current scopes.
Changing those starts paging again. Equality at the lower bound is included.

Source/link idempotency miss paths capture independent owner truth before and after the final
mutation in the same transaction. Shared deterministic identity locks serialize commands,
personal PATCH and jobs. Rollback/no-op/replay adds no command transition. A known active
pre-state records the first real repair even before discovery. Drift correction uses observation
evidence and observation time with null Actor/action; it never fabricates pre-rollout cycles.
GETs create no identities/history/preferences. The migration precreates
`dashboard.recovery_reconcile` with retry limit 5, delay 30 and backoff. Boot registers a
five-minute discovery schedule; source and private-response batches are at most 100 each,
with resumable cursors. Runtime history grants are SELECT/INSERT only. No pruning is introduced;
identity/current occurrence and indefinite `core.audit_log` are retained.

Survey-owned personal endpoints are `GET|PATCH
/survey-responses/:id/outcome-follow-up/presentation` and
`GET /surveys/:id/outcome-follow-up/history` (the same limit/cursor and UTC window rules),
plus `GET /surveys/:id/outcome-follow-up/recovery-items?presentation=visible|hidden`. The
response-owned queue applies personal selection before count/paging and returns safe response
IDs, occurrence/presentation, visible/hidden totals and a response-ID cursor; it does not change
the existing outcome-follow-up DTO or its source decisions.
They require `survey.read` then explicit `survey.read_personal_responses`, with no Admin bypass;
foreign, unreadable and denied response access collapses to 404. PATCH uses the strict actions
above and separate response/Actor/occurrence storage. History carries response IDs only within
this gated adapter, safe resolution metadata and no private decision reason. Personal GETs
retain the existing per-response/question disclosure audit. Both follow-up decisions and
response-derived Finding creation record response transitions atomically. Generic Dashboard
list/detail/history stay Survey-grain and never invoke this personal adapter.

### Performance acceptance

On identical throwaway ~5k-VOC/~5k-Task data, warm summary/list/detail p95 <=500ms;
summary p95 also <=develop p95 ×1.2+50ms. Record median/p95 across multiple scopes/system
counts, query plans and recorder multi-VOC fanout latency. Batch labels/readability and
avoid per-item queries/unbounded rows. UI median `readyMs` threshold and visual checks
follow ADR-0067. These are adopted requirements, not measured PASS evidence.

## Analytics Area Report Contract — implemented by #1078 (ADR-0069)

Status: Accepted 2026-10-13 by the owner (MVP close-out decisions).
Backend/shared implemented by #1078; storage/read contract shipped in v1.0.0.
This is a sibling read, not a replacement for the summary's VOC-only
`analytics_areas` projection. Metric definitions and destinations: FR-DASH-002 in
`docs/design/08-dashboard-system.md`.

`GET /dashboard/analytics-areas` requires the authenticated workspace session and Admin/Developer
role; User returns the standard `403 permission.denied` response even with a direct URL.
Then apply each owning read seam and its module-specific Admin/explicit-deny rules independently.
Catalog administration permission is not required. Missing backing capability or
`permission.denied` / `permission.scope_required` omits only the unavailable metric; permitted empty
is zero. No hidden object/label/count/endpoint is returned. Cross-source metrics are omitted when
needed linked facts are unavailable; never subtract visible facts from hidden totals.
Unexpected backing-read failures fail the request rather than converting failure to zero/absence.
Use the configured read rate tier and `Cache-Control: private, no-cache`. No source mutation or
report-read domain audit event; personal source navigation retains its existing audit contract.

Strict query (`dashboardAreaReportQuerySchema`):

| Key | Accepted value / default |
| --- | --- |
| `managed_system_id` | Optional UUID or `all`; omitted/all means each metric's effective source scope, never a workspace bypass. |
| `analytics_area_id` | Optional UUID or `unset`; omitted means all classifications in scope, unset means null. |
| `limit` | Integer 1..100, default 50. |
| `cursor` | Optional opaque continuation bound to session workspace, effective scopes and filters. |

Malformed query/cursor returns `422 validation.failed` in the existing query-validation envelope.
Scope is checked before catalog/object resolution; unknown, foreign-workspace and incompatible
Area/System selections must not disclose existence. Source list contract extensions below specify
empty results for syntactically valid nonmatching selections. Stable report row order is ascending
Managed System UUID, then Area UUID, with null after assigned Areas. A scope/filter change starts
paging again; an invalid or incompatible continuation is rejected as `invalid_cursor`.

Strict response contract (`dashboardAreaReportSchema` in
`packages/shared/src/dashboard.ts`):

- `computed_at`: ISO timestamp for this authorized snapshot; `as_of_date`: UTC ISO date used by overdue predicates.
- `items`: bounded array of rows with `managed_system_id`, `managed_system_name`,
  `managed_system_archived`, nullable `analytics_area_id`, nullable `analytics_area_name`,
  and `analytics_area_archived` (false for the unset row), plus independently optional metric groups.
  Names/archive flags come from owner batch lookup of authorized referenced UUIDs, including archived
  rows; no first-100 catalog page, slug/name join or guessed UUID label.
- `page`: `{ has_more, cursor? }`; cursor is present only when another row page exists.
- `classification_context`: per-Managed-System entries with independently available VOC/Finding/Task/Survey
  `{ classified, total }` counts before Area filter and paging, under the same source eligibility/read
  predicates as report rows. Across all Area pages including unset, domain totals reconcile exactly.
- Row domain groups are `voc`, `finding`, `task`, `survey`; keys are independently omitted,
  including cross-source metrics within a readable group. Counts are nonnegative integers counting
  distinct source objects. Each actionable positive count carries a typed internal next-action link
  with source route and exact scope/Area/filter search; zero has no repair CTA. Ratios expose
  `value` and `total`; percent/status are absent for total zero. No cross-domain ratio or composite score.
  Concrete metric inventory is the FR-DASH-002 table; do not reuse closed summary IDs as new DTO keys.

Rows are the union of readable source classifications (including null and non-VOC-only Areas),
not all catalog Areas fabricated as zeros. A readable Area in one domain allows another authorized
empty domain's zero, but never an unavailable domain's zero. Return no row when no readable data exists.
Survey groups contain only Survey counts and Survey-grain signals: no response count/ID, score,
answer text, respondent metadata, timestamp, response-derived bucket or personal action. Thresholding
happens inside the Survey-owned classifier; personal-read grants never enlarge this response.

Use a fixed set of authorized grouped owner reads plus batch catalog metadata. No loop of personal
Survey reads or per-Area source-service fanout. Grouped read interfaces are owner barrel
exports, not permission to import foreign repositories or grant raw Survey-table access.

### Shipped Area report DTO keys (#1078)

Each count is `{ count, link? }`; `link` is emitted only for a positive count and is
`{ pathname: '/vocs' | '/findings' | '/tasks' | '/surveys', search: Record<string, string> }`.
`areaReportLink` is the shared source of destination keys. Every link has `managedSystem`
and `filter.analytics_area` (`unset` for null) plus the exact metric filter in the destination contract.
Ratios are `{ value, total, link? }`; the optional link opens the complement only when `total > value`.
No percentage/status fields are emitted, including for a zero denominator.

| Optional group | Exact members |
| --- | --- |
| `voc` | `total`, `unassigned`, `high_no_followup` counts; `task_link` ratio (`with_task / total`). |
| `finding` | `active`, `no_execution` counts; `execution` ratio (`active with execution / active`). |
| `task` | `by_status` counts for `backlog`, `todo`, `doing`, `review`, `done`, `released`, `reopened`; `in_flight`, `overdue` counts; independently optional `released_update` ratio, `public_update_missing`, `reporter_update_needed` counts. |
| `survey` | `open`, `follow_up_needed` counts only. |

The three cross-source Task fields are absent unless the actor's VOC read scope covers the row's
Managed System. Released-update numerator/denominator count Tasks, using active `evidence_of`
links to non-archived VOCs and existing non-skipped Public Updates. Survey classification stays
behind the authorized MATERIALIZED set and its aggregate-only classifier; no personal read/audit.
Classification context totals count all eligible owner-list records, including non-active Findings,
all seven Task statuses and all Survey statuses, before Area filtering or paging.

Availability uses each owner's point decision per union Managed System, memoized per request;
zero Surveys still yield an authorized empty Survey group, and an explicit Admin Survey deny omits it.
Grouped reads have no Area parameter. The Task grouped read returns `as_of_date` from the same
UTC database clock expression as overdue, even when its source population is empty.
Cursor binding covers workspace, actor, role, normalized owner scopes/availability and both filters;
keyset order is System UUID then Area UUID with null last. Invalid cursors have
`fields: [{ path: ['cursor'], code: 'invalid_cursor' }]` in the standard 422 envelope.

The opt-in `RECOVERY_SCALE=1 AREA_REPORT_SCALE=1` scenario in
`dashboard/__tests__/recovery-scale.integration.test.ts` records p95, query counts, authorization
query count and EXPLAIN artifacts with ten Areas plus null per Managed System. Default scale
fixtures remain unchanged. No report storage, cache, migration or new index is added.
