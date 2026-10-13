# Task And Task Request

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Task Request Create From Finding Contract

`POST /findings/:id/request-task`

```text
requirement_id: FOP-TASK-001
request body:
  evidence_summary string required
  requested_outcome string required
  assigned_reviewer_actor_id optional nullable uuid
  assigned_reviewer_team_id optional nullable uuid (XOR-or-both-null)
response body: TaskRequestDto
auth and permission: authenticated Actor in workspace; finding.manage on the
  source Finding's primary_managed_system_id. Admin bypass follows the same
  finding.manage convention used by Finding actions.
validation errors:
  - invalid id path param
  - invalid or unknown Finding
  - invalid request body
  - missing or malformed Idempotency-Key
side effects:
  - create task_request.task_requests with status pending_review
  - create active entity link (finding, task_request, requested_task)
audit events:
  - task_request_created_from_finding
  - entity_link.created when the active link row is newly inserted
managed_system scope: copied from the source Finding
idempotency behavior: Idempotency-Key required; hash includes body, Finding id,
  and route identity finding.request_task
```

This endpoint does not approve, reject, convert to Task, or link an existing
Task. VOC and VOC Cluster Task Request sources are implemented by
`POST /vocs/:id/request-task` and `POST /voc-clusters/:id/request-task`.

## Task Request Review Contract

`GET /task-requests`

```text
requirement_id: FOP-TASK-002
query:
  status optional pending_review|approved|rejected|needs_more_evidence|converted
  reviewer optional Actor UUID or me (assigned reviewer, not decision Actor)
  reviewer_team_id optional team UUID
  managed_system_id optional uuid or all
  cursor optional opaque string (used with limit)
  limit optional integer 1..100; list client sends 50, no server default
response body without limit: exactly { items: TaskRequestDto[] }
response body with limit: { items, page: { has_more, cursor?, total?, status_counts? } }
  page.cursor only when has_more is true
  total only on the first page (no cursor), visible rows under the same filters
  status_counts only on the first page without a status filter; keys:
    pending_review, approved, rejected, needs_more_evidence, converted
    values count visible rows under the workspace/Managed System authority scope,
    ignoring personal reviewer filters, including zeros
validation: invalid cursor -> 422 validation.failed,
  detail.fields: [{ path: ['cursor'], code: 'invalid_cursor' }]
  invalid limit -> 422 validation.failed (query-validation envelope)
auth and permission: Admin or Developer. Admin sees all Task Requests in the
  workspace. Developer visibility checks `finding.manage`
  once per distinct workspace Primary Managed System with the elevated-role
  gate, then applies the allowed-system SQL predicate before LIMIT, total and
  status counts. Explicit denies are preserved. Empty allowed scope returns
  empty rows, first-page total 0, and zero status counts when applicable.
  Full-set mode uses the same visibility predicate.
sort: created_at DESC, id DESC; cursor continues both columns with raw
  PostgreSQL timestamp precision (including microseconds)
source projection: when an active `requested_task` link exists, `source`
  includes its type, id, relation, and link id plus the source `display_id`
  and `title`; Finding sources also include `evidence_count`. VOC `display_id`
  and `title` are included for the Reporter or when the deny-first `voc.read`
  check allows the actor to read that VOC, including for Admins; otherwise those
  summary keys are omitted. A missing active source link omits `source`.
```

`GET /task-requests/:id`

```text
response body: TaskRequestDto, including the same source projection as the list
auth and permission: same elevated-role gate and checkFindingManage with
  requireElevatedRole: true as the list
errors: missing, cross-workspace or not-manageable -> identical
  404 not_found.record; invalid UUID -> 422 validation.failed
side effects, audit events, entity links: none (read only)
```

Task Request saved views reject `cursor` and `limit` on create, update and
historical-filter reads; paging keys never enter persistence.

Decision endpoints:

```text
POST /task-requests/:id/approve
POST /task-requests/:id/reject
POST /task-requests/:id/request-more-evidence
```

```text
request bodies:
  approve: { reason?: string max 4000 }
  reject: { reason string required max 4000 }
  request-more-evidence: { note string required max 4000 }
response body: TaskRequestDto
auth and permission: Admin or Developer with `finding.manage` on the Task
  Request primary_managed_system_id. Admin bypass follows the same convention
  used by Finding actions.
idempotency behavior: Idempotency-Key required; hash includes body, Task
  Request id, and route identity.
status machine:
  approve: pending_review|needs_more_evidence -> approved
  reject: pending_review|needs_more_evidence -> rejected
  request-more-evidence: pending_review -> needs_more_evidence
invalid transition: 422 validation.failed with `invalid_transition` on
  `status`
no-op: already in target status returns 200 with current DTO and no new audit
  event
self-approval: if reviewer is requester, approve requires non-empty reason and
  `task_request.self_approve` on the same Managed System unless reviewer is
  Admin. Denied attempts record `task_request_self_approval_denied`.
audit events:
  approve: task_request_approved
  reject: task_request_rejected
  request-more-evidence: task_request_needs_more_evidence
```

These endpoints do not create Task rows, convert to Task, or link existing
Tasks. See "Task Conversion Contract" below (`POST /task-requests/:id/convert`)
and `POST /task-requests/:id/link-task` for those — both shipped in issue #134.

## Task Conversion Contract

`POST /task-requests/:id/convert`

```text
requirement_id: FOP-TASK-002 / FOP-TASK-003
request body:
  title string required min 1 max 200
  priority optional low|medium|high|urgent default medium
  assignee_actor_id optional nullable uuid
  assignee_team_id optional nullable uuid (XOR-or-both-null)
  due_date optional nullable ISO date
  milestone_id optional nullable uuid
  analytics_area_id optional nullable uuid
response body: TaskDto
auth and permission: Admin or Developer with finding.manage on the Task
  Request primary_managed_system_id. Admin bypass follows the Finding actions
  convention.
validation errors:
  - non-approved Task Request: 422 validation.failed with not_approved on status
  - unknown or cross-workspace Analytics Area: 404 not_found.record
  - Analytics Area on another Managed System: 422 validation.failed with out_of_scope on analytics_area_id
  - archived Analytics Area: 409 conflict.parent_archived with parent_archived on analytics_area_id
  - unknown or cross-workspace Milestone: 404 not_found.record
  - Milestone on another Managed System: 422 validation.failed with out_of_scope on milestone_id
  - invalid explicit Actor/team responsibility: 422 validation.failed (foreign_workspace,
    archived_team, ineligible_actor, or mutually_exclusive on responsibility fields)
side effects:
  - create task.tasks with status backlog and source_task_request_id
  - create active entity link (task_request, task, converted_to)
  - preserve (finding, task, requested_task) from the request's own source Finding only
    (Finding-sourced requests; other Finding links on the request are record-only, #768)
  - preserve (voc, task, evidence_of) when derived from that Finding's evidence
  - update Task Request status to converted
audit events:
  - task_created_from_request
idempotency behavior: Idempotency-Key required; hash includes body, Task
  Request id, and route identity task_request.convert
```

`POST /task-requests/:id/link-task`

```text
request body:
  task_id uuid required
response body: TaskDto
auth and permission: same as conversion
validation:
  - Task Request must be approved
  - target Task must exist in the same workspace and Primary Managed System
side effects:
  - create active entity link (task_request, task, converted_to)
  - update Task Request status to converted
audit events:
  - task_linked_to_request
idempotency behavior: Idempotency-Key required; hash includes body, Task
  Request id, and route identity task_request.link_task
```

`GET /tasks`

```text
query:
  status optional backlog|todo|doing|review|done|released|reopened
  assignee optional uuid or me
  assignee_team_id optional team UUID
  milestone_id optional uuid
  managed_system_id optional uuid or all
  public_update optional: missing
  cursor optional opaque string (used with limit)
  limit optional integer 1..100; list client sends 50, no server default
response body without limit: exactly { items: TaskDto[] }
response body with limit: { items, page: { has_more, cursor?, total? } }
  cursor only when has_more is true; total only on the first page without
  cursor, counting visible rows under the same filters
validation: invalid cursor -> 422 validation.failed,
  detail.fields: [{ path: ['cursor'], code: 'invalid_cursor' }]
  invalid limit -> 422 validation.failed (query-validation envelope)
auth and permission: Admin or Developer. Admin sees all workspace Tasks.
  Developer visibility checks finding.manage once per distinct workspace
  Primary Managed System, with the elevated-role gate, and applies the
  allowed-system SQL predicate before LIMIT and total. Explicit denies remain
  effective in paged and full-set mode. Empty allowed scope returns empty rows
  and first-page total 0. User is denied.
sort: updated_at DESC, id DESC; cursor continues both columns with raw
  PostgreSQL timestamp precision (including microseconds)
```

Task Board, Home and other full-set Task consumers omit `limit` and keep their
complete population. Saved Task views reject `cursor` and `limit` at the
persistence boundary, including historical-filter reads.

`GET /tasks/:id`

```text
response body: TaskDetailDto
auth and permission: Admin or Developer with finding.manage on the Task
  primary_managed_system_id. Admin bypass follows GET /tasks.
source resolution:
  - source = null when source_task_request_id is null
  - source.task_request = { id, display_id, status } when source_task_request_id resolves
  - source.finding = { id, display_id, title, summary, evidence_count } via active
    (finding, task_request, requested_task) when present; for a Finding-sourced
    request, prefer its own source Finding (#773), otherwise the newest active link
  - source.voc is the backend's VOC visibility verdict (#378), never synthesized
    by the FE: allowed = { visibility_state, id, display_id, title };
    summary_visible and denied = { visibility_state } only; hidden = the key is
    omitted. The verdict is the VOC detail read decision, so an actor whose
    VOC detail read would be 404 (including a non-reporter Admin with an explicit
    voc.read deny) gets no source.voc.
errors:
  - unknown id: 404 not_found.record
  - User or Developer outside Managed System scope: 403 permission.denied
```

Standalone `POST /tasks` is not yet implemented even though standalone Tasks are
a valid nullable-source data shape.

## Task Request Create From VOC / VOC Cluster Contract

`POST /vocs/:id/request-task`
`POST /voc-clusters/:id/request-task`

```text
requirement_id: FOP-TASK-001
request body:
  evidence_summary string required
  requested_outcome string required
  assigned_reviewer_actor_id optional nullable uuid
  assigned_reviewer_team_id optional nullable uuid (XOR-or-both-null)
response body: TaskRequestDto
auth and permission:
  - VOC: authenticated Actor in workspace; source VOC readable under the same
    rule used by `POST /vocs/:id/create-finding`, plus `finding.manage` on the
    VOC Primary Managed System. Admin bypass follows the Finding actions
    convention.
  - VOC Cluster: Admin or Developer with `finding.manage` on the cluster Primary
    Managed System, mirroring `POST /voc-clusters/:id/create-finding`.
validation errors:
  - invalid id path param
  - invalid or unknown source object
  - invalid request body
  - missing or malformed Idempotency-Key
side effects:
  - create task_request.task_requests with status pending_review
  - create active entity link (voc, task_request, requested_task) or
    (voc_cluster, task_request, requested_task)
audit events:
  - task_request_created_from_voc or task_request_created_from_voc_cluster
  - entity_link.created when the active link row is newly inserted
managed_system scope: copied from the source VOC or VOC Cluster
idempotency behavior: Idempotency-Key required; hash includes body, source id,
  and route identity voc.request_task or voc_cluster.request_task
```

## Task

```text
GET /task-requests
GET /task-requests/:id
POST /task-requests/:id/approve
POST /task-requests/:id/reject
POST /task-requests/:id/request-more-evidence
POST /task-requests/:id/convert
POST /task-requests/:id/link-task

GET /tasks
GET /tasks/:id
PATCH /tasks/:id
GET /tasks/:id/comments
POST /tasks/:id/comments
POST /tasks/:id/milestone
```

## Progress notes

`GET /tasks/:id/comments` and `POST /tasks/:id/comments` are the Task
progress-note timeline (`docs/adr/0049-finding-task-progress-notes.md`,
FR-TASK-003). Rows live in `task.task_comments`. There is no edit or delete
route. `fops_app` may only `SELECT` and `INSERT`. These are the internal
comments this system means. They are not VOC Internal Comments, and they are
not Finding progress notes ([findings.md](findings.md) §Progress notes).

The read and write gates are the same capability and the same elevated-role
rule. `finding.read` is not enough. A User is denied before the Task is
loaded, so a missing Task is still `403 permission.denied` for a non-elevated
actor. The screen keeps the section visible and treats that 403 as a
permission-blocked panel.

Shared DTO: `TaskCommentDto` in `packages/shared/src/tasks/comments.ts`.

```text
id uuid
task_id uuid
actor_id uuid
kind: note | status_change
from_status: Task status or null
to_status: Task status or null
body_rich_content: TipTap document
created_at: ISO datetime
```

A `note` has both status columns null. A `status_change` has both set. GET
returns both kinds, newest first (`created_at DESC`, `id DESC`). POST creates
only `kind: note`. A `status_change` row is inserted by a successful Task
status change, in the same transaction as `task_status_changed`, not by these
routes. A same-status no-op writes neither the comment nor that audit.

`GET /tasks/:id/comments`

```text
requirement_id: FR-TASK-003
query:
  cursor optional string. Base64 JSON { createdAt, id } taken from the raw
    Postgres timestamp of the last returned row, not a millisecond Date.
  limit optional integer 1..100, default 50
response body: 200
  { items: TaskCommentDto[], page: { cursor?: string, has_more: boolean } }
  page.cursor is present only when has_more is true
auth and permission:
  authenticated Actor in the workspace
  checkFindingManage with requireElevatedRole: true. Admin, or a Developer
    with finding.manage on the Task Primary Managed System. finding.read is
    not enough. A User is denied before the row is loaded.
validation errors:
  - id path param is not a UUID: 422 validation.failed
  - invalid query: 422 validation.failed
  - cursor that is not base64 JSON { createdAt, id }: 422 validation.failed,
    field path cursor, code invalid_cursor
auth errors, in check order:
  - actor is not Admin or Developer: 403 permission.denied, including when
    the Task does not exist
  - missing Task, elevated actor: 404 not_found.record
  - Task exists but the actor cannot manage it: 403 permission.denied
side effects: none. An archived parent Managed System still allows GET.
audit events: none
entity_links: none
dashboard queues: none
idempotency behavior: none (read). Overload on the configured read bucket is
  429 rate_limited.actor.
```

`POST /tasks/:id/comments`

```text
requirement_id: FR-TASK-003
headers: Idempotency-Key UUIDv4 required
request body: strict object
  body_rich_content: non-blank TipTap document, sanitized on the
    internal-comment surface
  mentions: optional uuid array, max 50. When omitted, the body must contain
    no mention nodes. When present, it must be exactly the set of mention-node
    actor_id values in the body, and each id must be an Actor in this workspace.
  The client does not send kind. The inserted row is always kind note, with
    both status columns null. attachmentRef nodes are rejected.
response body: 201 { comment: TaskCommentDto }
auth and permission:
  authenticated Actor in the workspace
  The actor must already be Admin or Developer (hasElevatedFindingRole). A
  User is denied before the write transaction opens, even with an explicit
  finding.manage grant. Inside the transaction, checkFindingManage with
  requireElevatedRole: true must allow on the Task Primary Managed System.
validation errors:
  - id path param is not a UUID: 422 validation.failed
  - missing or empty Idempotency-Key: 422 validation.failed
  - Idempotency-Key is not a UUIDv4: 422 validation.malformed_idempotency_key
  - invalid or blank body, or unknown keys: 422 validation.failed
  - mentions do not match the body's mention nodes: 422 validation.failed,
    field path mentions, code invalid
  - a mention actor_id is not in this workspace: 422 validation.failed,
    field path mentions, code cross_workspace
  - a mention node actor_id is not a UUID: 422 validation.failed,
    field path body_rich_content, code invalid_mention_actor_id
  - body contains an attachmentRef: 422 validation.failed,
    field path body_rich_content, code attachment_not_supported
  - sanitizer rejection: 422 rich_content.disallowed_node,
    rich_content.disallowed_attr, rich_content.invalid_attr_value,
    rich_content.missing_required_attr, or rich_content.external_image_forbidden
auth and state errors, in check order:
  - actor is not Admin or Developer: 403 permission.denied, before lookup,
    including when the Task does not exist
  - missing Task: 404 not_found.record
  - parent Managed System row missing: 404 not_found.record
  - parent Managed System archived: 409 conflict.parent_archived
    (this is checked before the manage gate)
  - actor cannot manage the Task: 403 permission.denied
side effects: INSERT one task.task_comments row, kind note
audit events: task_comment_created. Subject is the Task. Detail carries the
  comment id, actor id, and mention ids. A status_change row does not write
  this event.
entity_links: none
dashboard queues: none
idempotency behavior: Idempotency-Key required. Replay of the same key and
  hash returns the stored 201. The hash is the raw body plus the Task id and
  the route identity task.comment. A reused key with a different hash is
  409 conflict.idempotency_key_reuse. Overload on the configured mutation
  bucket is 429 rate_limited.actor.
```

## PATCH /tasks/:id — Task status transition (Slice 7 #138)

| Aspect | Contract |
|---|---|
| Purpose | Mutate the internal Task status for the Task board. Transitions are free: any of `backlog`, `todo`, `doing`, `review`, `done`, `released`, or `reopened` may move to any other status. ADR-0027 defined the status vocabulary but no transition edges; the audit trail provides the required traceability. |
| Headers | `Idempotency-Key: <uuidv4>` (required) · `If-Match: <updated_at ISO>` (required) · session cookie |
| Body | `{ status: TaskStatus, reason?: string }`; `.strict()` (zod) rejects unknown fields. `reason` is optional so the board's one-click transition remains valid. |
| Permission | Admin or Developer with `finding.manage` on the Task `primary_managed_system_id`, matching `GET /tasks/:id`, convert, and link-existing authority. |
| Optimistic concurrency | `If-Match` compared against `task.updated_at`; mismatch → 409 `conflict.stale_write` with `detail.current_updated_at`. |
| Service ordering | `SELECT FOR UPDATE task → permission check → If-Match compare → same-status no-op check → UPDATE status + updated_at → append status_change comment → audit emit → refresh Task Detail DTO`. |
| Empty-diff semantics | A request whose `status` already equals the stored status returns 200 with the current Task Detail DTO. It performs no UPDATE and emits no audit row; the idempotency cache still records the 200 response. |
| Response | 200 `TaskDetailDto`; PATCH returns the same `source` projection as `GET /tasks/:id`, including the `source.voc` visibility verdict (#445 follow-up), on both the status-change and no-op paths. An idempotent replay returns the stored first response. Missing task → 404 `not_found.record`. |
| Audit event | `task_status_changed` with strict detail `{ from: TaskStatus, to: TaskStatus, reason? }`, written in the same transaction as the UPDATE and status_change comment. |
| Idempotency hash | Includes `taskId`, `ifMatch`, route, and request body. A retry after refetching a stale Task has a distinct hash; clients must mint a fresh `Idempotency-Key` for each distinct `If-Match` value. |
| Released side effect | Implemented: when a Task changes into `released`, the service snapshots eligible active direct `voc -> task evidence_of` links and, when at least one eligible link exists, publishes `tasks.create_public_update_review_candidates` via `boss.send` in the same transaction. It does not automatically change VOC status or create a Public Update. |
| Error codes | `validation.failed` · `validation.malformed_idempotency_key` · `permission.denied` · `not_found.record` · `conflict.stale_write` · `conflict.idempotency_key_reuse` · `rate_limited.actor` |

Task Request is not independently created through `POST /task-requests` as of
Slice 6. It is created only through source transition routes:
`POST /findings/:id/request-task`, `POST /vocs/:id/request-task`, and
`POST /voc-clusters/:id/request-task`.

## POST /tasks/:id/milestone — Task milestone assign (issue #514 B1b)

| Aspect | Contract |
|---|---|
| Purpose | Assign a Milestone to a Task, or unassign it. |
| Headers | `Idempotency-Key: <uuidv4>` (required) · `If-Match: <updated_at ISO>` (required) · session cookie |
| Body | `{ milestone_id: uuid \| null }`; `.strict()` (zod). `null` unassigns. |
| Permission | Admin or Developer with `finding.manage` on the Task `primary_managed_system_id`, matching the status PATCH authority. |
| Milestone scope | Unknown or other-workspace Milestone → 404 `not_found.record`. Milestone on another Managed System → 422 `validation.failed`, `out_of_scope` on `milestone_id`. The check goes through the milestones module's `lockMilestone`; the command writes no entity link. |
| Milestone status | ADR-0050 Decision 5: Milestone status is not consulted. Existence, workspace, and Managed System checks stay; a `released` Milestone in the caller's workspace on the Task's Managed System is a successful assign. |
| Optimistic concurrency | `If-Match` compared against `task.updated_at`; mismatch → 409 `conflict.stale_write` with `detail.current_updated_at`. |
| Service ordering | `SELECT FOR UPDATE task → permission check → If-Match compare → lockMilestone scope check → UPDATE milestone_id + updated_at → audit emit`. |
| Writes | `task.tasks.milestone_id` and `updated_at` only. No Task status change, no status_change comment, no entity link. |
| Response | 200 `TaskDto`. An idempotent replay returns the stored first response. Missing task → 404 `not_found.record`. |
| Audit event | `task_milestone_assigned` with strict detail `{ from_milestone_id: uuid \| null, to_milestone_id: uuid \| null }`, written in the same transaction as the UPDATE. |
| Idempotency hash | Includes `taskId`, `ifMatch`, route identity `task.milestone_assign`, and request body. |
| Error codes | `validation.failed` · `validation.malformed_idempotency_key` · `permission.denied` · `not_found.record` · `conflict.stale_write` · `conflict.idempotency_key_reuse` · `rate_limited.actor` |

## Close-out responsibility (ADR-0067; #1091)

Task Request creation from Finding/VOC/Cluster persists nullable
`assigned_reviewer_actor_id` / `assigned_reviewer_team_id`, never prefilling actual
`reviewer_actor_id`. Reviewer MS default → eligible general owner → same-system AA team →
shared authorized queue, with explicit/null precedence and automatic-failure fallback.
Request stays pending; other authorized reviewers/self-approval rules remain unchanged.
The `reviewer` (Actor UUID or `me`) and `reviewer_team_id` filters select assigned
routing without narrowing the unfiltered operational queue; Home requests `reviewer=me`.
Source Analytics Area is read through its owner seam for routing; no new Task Request
Analytics Area column is required.

Conversion persists nullable `assignee_team_id`; XOR with existing Actor field,
authorized explicit null skips defaults, omission requests owner defaults. Invalid explicit
responsibility now rejects `validation.failed` (superseding the older assignee-only 404
validation above); automatic invalid targets skip. Keep Backlog, provenance/links, audits
and replay notification deduplication; team targets send no arbitrary-member notification.
Typed DTOs/source-owned edits and Actor/team filters must ship with fields; `assignee=me`
remains personal Actor assignment, never implicit team membership. No standalone create
endpoint is introduced by this ADR.

## Analytics Area report destination extension (ADR-0069)

These keys are accepted **proposed/new**, not implemented by #1071. Keep existing unfiltered,
legacy and paging behavior. Apply workspace and source authorization before Area filtering,
counts and page limits. A UUID matches only the source's own current `analytics_area_id`;
`unset` matches null. A syntactically valid unknown, foreign or System-incompatible Area yields
an empty authorized result, without catalog existence disclosure. Archived referenced Areas
remain filterable; they are not selectable as new classifications. Browser key is
`filter.analytics_area=<uuid|unset>`; clients translate it to the owning wire query key below.
Grouped report counts and exact list membership must share the owner predicate, including
cross-source availability rules; hidden links are not absent links. These ordinary reads write
no source records or domain audit events. Source repair commands keep their existing gates/audits.

`GET /tasks` gains wire `analytics_area_id=<uuid|unset>`, `status_group=in-flight`, `overdue=true`,
and `reporter_update=needed`. Keep single `status` (the seven existing lowercase wire values)
and `public_update=missing`; combined filters intersect, never widen scope.

- `status_group=in-flight`: `todo`, `doing`, `review`; Backlog is separate from work started.
- `overdue=true`: status in `backlog`, `todo`, `doing`, `review`, `reopened`, with non-null
  `due_date` strictly before the current UTC date. Due today/null and Done/Released are excluded.
  The report uses its UTC `as_of_date`; arrival recomputes live date/state, so a midnight boundary
  may change membership and is explained by the snapshot time rather than frozen authorization.
- `public_update=missing`: Released Tasks with at least one active `voc→task evidence_of` link
  to a non-archived VOC and no linked non-skipped Public Update. Its matching ratio means at least
  one update exists, not all reporters updated after release.
- `reporter_update=needed`: Released Tasks with at least one such linked VOC whose reporter-facing
  status is neither `resolved` nor `closed`. Each Task counts once regardless of linked VOC count.

Report destinations use `/tasks?view=backlog` for all these filters, with source System and Area;
extend strict browser validation and typed client forwarding to support `public_update=missing`
in that list as well as the existing board. Linked VOC/report-update facts require the existing
VOC read seam; omit unavailable cross-source report metrics instead of returning hidden complements.
Task detail opens the approved linked VOC/review path, and publishing stays VOC-owned.
The report introduces no Task Blocked state and never resolves VOC on Task release.

## Survey-derived source summaries/defaults (ADR-0064; cutover pending)

After #739/#740, Survey-derived Finding title/summary in Task source DTOs and
Task Request draft defaults is deterministic source metadata only, never a copied
excerpt. Excerpt display delegates to a fresh authorized Finding/Survey highlight
projection with exact active approval and source/target checks. This does not
authorize retroactive rewriting of independently authored `evidence_summary`,
requested outcomes or Task prose. Ordinary source links and their permissions
remain unchanged; canonical relation reads use #740's filtered view. Inventory
cached Task mutation DTOs with nested Finding summaries too; confirmed generated
Survey copies follow ADR-0015's targeted legacy sanitization exception.

## Source responsibility edits (#1091)

`POST /task-requests/:id/reviewer` accepts both required nullable fields
`assigned_reviewer_actor_id` and `assigned_reviewer_team_id`.
`POST /tasks/:id/responsibility` accepts both required nullable fields
`assignee_actor_id` and `assignee_team_id`, plus the existing ISO timestamp `If-Match`
header. Both require `Idempotency-Key`, workspace ownership and Admin-or-scoped-Developer
`finding.manage` (including the existing Admin bypass). Bodies are strict. XOR, active
same-workspace team and current destination Actor authority are validated in the transaction;
both null deliberately unassigns without consulting defaults. Unknown source records return
`404 not_found.record`; denied writes return `403 permission.denied`; invalid destinations
return `422 validation.failed`. Stale Task versions return `409 conflict.stale_write` with
`current_updated_at`. Responses are `TaskRequestDto` / `TaskDto` with persisted responsibility.

Effective edits append `task_request_reviewer_assigned` / `task_responsibility_assigned`
with strict `{ from_actor_id, from_team_id, to_actor_id, to_team_id }` detail. No-op or replay
adds no audit or notification. An effective Task edit to a different concrete Actor sends
one existing `task.assigned_to_me` notification; teams have no member notifications.
Workflow state, requester/created-by provenance, actual review attribution and links stay
unchanged. Writes, audits and notifications roll back together.

Creation/conversion responses and creation audits expose safe `default_resolved`,
`source_rule`, `managed_system_id` and the actual responsibility pair. Automatic candidates
are rechecked in the destination transaction. Each skipped MS reviewer/owner/AA rule adds
one Core diagnostic; a fallback succeeds with null responsibility and
`source_rule=workspace_fallback_queue`. Explicit input/null, rejected transactions and
replay add no diagnostic. Ordinary reads return current assignments without reconstructing
creation provenance. Cluster has no direct Analytics Area classification and uses MS then
queue routing; no member-derived Area is inferred. Source commands consume the existing
source-owned Finding/VOC locks and Core-owned `lockAnalyticsArea` owner-team input.

Reviewer/assignee filters apply before list paging and matching total counts. Task Request
status counts and the separate queue summary stay scope-wide. Home sends `reviewer=me`
under Actor-and-scope cache keys and never treats team membership as personal assignment.
Assignment, decision and conversion refresh source detail/list and personal Home caches.
