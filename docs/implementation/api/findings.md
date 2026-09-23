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
