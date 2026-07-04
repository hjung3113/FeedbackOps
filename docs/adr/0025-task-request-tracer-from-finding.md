# ADR-0025: Task Request Tracer From Finding

Date: 2026-07-04

## Status

Accepted

## Context

Slice 6 introduces Task Request as the review buffer before Task execution work
enters the backlog. The first tracer path is intentionally narrow:
`Finding -> Task Request`. VOC and VOC Cluster sources, approval decisions,
conversion to Task, and link-existing-Task flows are separate slices.

## Decision

Task Request is a new entity-link target type, stored in the
`task_request.task_requests` table. The first production source path is:

```text
POST /findings/:id/request-task
finding -> task_request
relation_type: requested_task
```

The entity-link tuple registry is widened additively with exactly:

```text
(finding, task_request, requested_task)
```

Creation reuses `finding.manage` authorization on the source Finding's Primary
Managed System. No new capability is introduced for this tracer path. The
request writes the Task Request row and the active `entity_links` row in one
transaction, records `task_request_created_from_finding`, and scopes
Idempotency-Key hashing to the source Finding and route.

Task Request status is:

```text
pending_review | approved | rejected | needs_more_evidence | converted
```

This slice creates only `pending_review`. Review decisions and Task conversion
are intentionally deferred.

## Consequences

- `task_request` becomes a registered entity-link provider.
- `requested_task` becomes a production relation only for
  `(finding, task_request)`.
- Finding Detail may show a live "Task 요청" action for actors who can manage
  the Finding.
- Link Existing Task, approval, conversion, and VOC/VOC Cluster Task Request
  sources remain out of scope.
