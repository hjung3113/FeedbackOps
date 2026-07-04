# ADR-0026: Task Request Review Decisions

Date: 2026-07-04

## Status

Accepted

## Context

ADR-0025 introduced the first Task Request tracer from Finding and explicitly
deferred review decisions and Task conversion. Slice 6 issue #133 implements
the review queue and decision endpoints only. Converting an approved Task
Request into a Backlog Task, and linking an existing Task, remain deferred to
issue #134.

## Decision

Task Request review exposes:

```text
GET /task-requests
POST /task-requests/:id/approve
POST /task-requests/:id/reject
POST /task-requests/:id/request-more-evidence
```

Approval and conversion are separate audited domain decisions. Approval accepts
the execution candidate and leaves it in `approved`; it does not create a Task,
does not link an existing Task, and does not write Task execution rows.

Review authority reuses the existing Finding authority boundary:

```text
Admin OR Developer with finding.manage on task_request.primary_managed_system_id
```

This avoids creating a second Task Request management capability before the full
Task execution model lands, while preserving Managed System scope.

The review status machine is:

```text
pending_review -> approved
pending_review -> rejected
pending_review -> needs_more_evidence
needs_more_evidence -> approved
needs_more_evidence -> rejected
```

`rejected` and `converted` are terminal for issue #133 decision endpoints.
Requests already in the target status return the current DTO without writing a
second audit event.

Self-approval by the requester is allowed only for:

```text
Admin with non-empty approval reason
Developer with finding.manage on the Task Request Managed System
  AND task_request.self_approve on the same Managed System
  AND non-empty approval reason
```

`task_request.self_approve` is a sensitive capability. Denied self-approval
attempts are audited as `task_request_self_approval_denied`. Successful
self-approval writes `task_request_approved` with `self_approval: true` and
`sensitive: true`.

Successful decision events are:

```text
task_request_approved
task_request_rejected
task_request_needs_more_evidence
```

## Consequences

- ADR-0025's deferral of review decisions is superseded by this ADR.
- ADR-0025's deferral of conversion and link-existing-Task remains in force
  until issue #134.
- Task Request list/read filtering uses per-row Managed System review authority.
- The frontend may show disabled Convert to Task and Link existing controls
  tagged for S6-4, but it must not wire them in issue #133.
