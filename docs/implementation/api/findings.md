# Finding

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Finding

```text
GET /findings
GET /findings/:id
GET /findings/:id/comments
POST /findings/:id/comments
PATCH /findings/:id
POST /findings/:id/evidence-highlights
POST /findings/:id/link-evidence
POST /findings/:id/request-task
POST /findings/:id/link-task
```

Finding is not independently created through `POST /findings` as of Slice 6.
Creation happens only through source conversion routes:
`POST /vocs/:id/create-finding`, `POST /voc-clusters/:id/create-finding`, and
`POST /survey-responses/:id/create-finding`.

Finding-to-Milestone linking is future cross-system behavior and is not an MVP
Finding endpoint.

`PATCH /findings/:id` accepts strict body `{ status, reason? }` and returns the
updated `FindingDto`. Slice 6 supports only `draft -> active`,
`draft -> not_actionable`, `active -> not_actionable`, and
`not_actionable -> active`; `converted` and `archived` remain stored statuses but
are rejected as user-directed targets here. Authz reuses `finding.manage`.
Successful non-no-op transitions audit `finding_status_changed`; same-status
requests are `200` no-ops returning the current Finding.

`POST /findings/:id/link-task` accepts strict body `{ task_id: uuid }`, requires
`Idempotency-Key`, and returns the updated `FindingDto`. Authz is Admin or
Developer with `finding.manage` on the Finding Primary Managed System. The
target Task must exist in the same workspace and Primary Managed System. The
command rejects a different pre-existing `linked_task_id` with
`422 validation.failed` field code `already_linked`; relinking to the same Task
is a `200` no-op. Side effects are atomic: set `findings.linked_task_id`, create
the existing `(finding, task, requested_task)` entity link, audit
`entity_link.created` when inserted, and audit `finding_task_linked`.

## Progress notes

`GET /findings/:id/comments` and `POST /findings/:id/comments` are the Finding
progress-note timeline (`docs/adr/0049-finding-task-progress-notes.md`,
FR-FIND-004). Rows live in `finding.finding_comments`. There is no edit or
delete route. `fops_app` may only `SELECT` and `INSERT`. Task progress notes
are a different contract: [tasks.md](tasks.md) §Progress notes.

Shared DTO: `FindingCommentDto` in `packages/shared/src/findings/comments.ts`.

```text
id uuid
finding_id uuid
actor_id uuid
kind: note | status_change
from_status: Finding status or null
to_status: Finding status or null
body_rich_content: TipTap document
created_at: ISO datetime
```

A `note` has both status columns null. A `status_change` has both set. GET
returns both kinds, newest first (`created_at DESC`, `id DESC`). POST creates
only `kind: note`. A `status_change` row is inserted by a successful Finding
status change, in the same transaction as `finding_status_changed`, not by
these routes. A same-status no-op writes neither the comment nor that audit.

`GET /findings/:id/comments`

```text
requirement_id: FR-FIND-004
query:
  cursor optional string. Base64 JSON { createdAt, id } taken from the raw
    Postgres timestamp of the last returned row, not a millisecond Date.
  limit optional integer 1..100, default 50
response body: 200
  { items: FindingCommentDto[], page: { cursor?: string, has_more: boolean } }
  page.cursor is present only when has_more is true
auth and permission:
  authenticated Actor in the workspace
  canReadFinding: Admin, or a Developer with finding.read on the Finding
    Primary Managed System (requireElevatedRole: true). A User is denied
    before grants are consulted, including a User who holds finding.read.
validation errors:
  - id path param is not a UUID: 422 validation.failed
  - invalid query: 422 validation.failed
  - cursor that is not base64 JSON { createdAt, id }: 422 validation.failed,
    field path cursor, code invalid_cursor
auth errors:
  - missing Finding: 404 not_found.record. Checked before the read gate, so
    a missing Finding is 404 even for a User.
  - Finding exists but the actor cannot read it: 403 permission.denied
side effects: none. An archived parent Managed System still allows GET.
audit events: none
entity_links: none
dashboard queues: none
idempotency behavior: none (read). Overload on the configured read bucket is
  429 rate_limited.actor.
```

`POST /findings/:id/comments`

```text
requirement_id: FR-FIND-004
headers: Idempotency-Key UUIDv4 required
request body: strict object
  body_rich_content: non-blank TipTap document, sanitized on the
    internal-comment surface
  mentions: optional uuid array, max 50. When omitted, the body must contain
    no mention nodes. When present, it must be exactly the set of mention-node
    actor_id values in the body, and each id must be an Actor in this workspace.
  The client does not send kind. The inserted row is always kind note, with
    both status columns null. attachmentRef nodes are rejected.
response body: 201 { comment: FindingCommentDto }
auth and permission:
  authenticated Actor in the workspace
  canManageFinding: checkFindingManage with requireElevatedRole: false.
  An explicit finding.manage grant is enough, including for a User. Admin
  bypasses the grant.
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
  - missing Finding: 404 not_found.record
  - parent Managed System row missing: 404 not_found.record
  - parent Managed System archived: 409 conflict.parent_archived
    (this is checked before the manage gate)
  - actor cannot manage the Finding: 403 permission.denied
side effects: INSERT one finding.finding_comments row, kind note
audit events: finding_comment_created. Subject is the Finding. Detail carries
  the comment id, actor id, and mention ids. A status_change row does not
  write this event.
entity_links: none
dashboard queues: none
idempotency behavior: Idempotency-Key required. Replay of the same key and
  hash returns the stored 201. The hash is the raw body plus the Finding id
  and the route identity finding.comment. A reused key with a different hash
  is 409 conflict.idempotency_key_reuse. Overload on the configured mutation
  bucket is 429 rate_limited.actor.
```
