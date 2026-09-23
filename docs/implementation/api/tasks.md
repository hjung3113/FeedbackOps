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
Tasks. Conversion and link-existing-Task remain issue #134.

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

Standalone `POST /tasks` is deferred by issue #134 even though standalone Tasks
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
POST /tasks    # deferred in issue #134
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
