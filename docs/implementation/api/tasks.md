# Task And Task Request

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Task Request Create From Finding Contract

`POST /findings/:id/request-task`

```text
requirement_id: FOP-TASK-001
request body:
  evidence_summary string required
  requested_outcome string required
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
response body: { items: TaskRequestDto[] }
auth and permission: Admin or Developer. Admin sees all Task Requests in the
  workspace. Developer rows are filtered per Task Request by `finding.manage`
  on `primary_managed_system_id`.
sort: created_at DESC
```

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
side effects:
  - create task.tasks with status backlog and source_task_request_id
  - create active entity link (task_request, task, converted_to)
  - preserve (finding, task, requested_task)
  - preserve (voc, task, evidence_of) when derived from existing Finding evidence
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
  milestone_id optional uuid
response body: { items: TaskDto[] }
auth and permission: Admin or Developer. Admin sees all workspace Tasks.
  Developer rows are filtered by finding.manage on primary_managed_system_id.
  User is denied.
sort: updated_at DESC
```

`GET /tasks/:id`

```text
response body: TaskDetailDto
auth and permission: Admin or Developer with finding.manage on the Task
  primary_managed_system_id. Admin bypass follows GET /tasks.
source resolution:
  - source = null when source_task_request_id is null
  - source.task_request = { id, status } when source_task_request_id resolves
  - source.finding = { id, title, summary, evidence_count } via active
    (finding, task_request, requested_task) when present
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

Standalone `POST /tasks` is not yet implemented even though standalone Tasks
are a valid nullable-source data shape.

## Task Request Create From VOC / VOC Cluster Contract

`POST /vocs/:id/request-task`
`POST /voc-clusters/:id/request-task`

```text
requirement_id: FOP-TASK-001
request body:
  evidence_summary string required
  requested_outcome string required
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
GET /tasks/:id/comments
POST /tasks/:id/comments
POST /tasks    # not implemented
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
| Headers | `Idempotency-Key: <uuidv4>` (required) · `If-Match: <updated_at ISO>` (required) · `Authorization: Bearer <session>` |
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
