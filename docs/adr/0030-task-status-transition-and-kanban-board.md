# ADR-0030: Task Status Transition And Kanban Board

Date: 2026-07-14

## Status

Accepted

## Context

ADR-0027 defined the seven Task status values but intentionally did not define
transition edges. Issue #138 introduces the status mutation needed by the Task
kanban board. The mutation must retain the existing Task authority boundary,
optimistic concurrency, idempotency, and audit guarantees. ADR-0005 and
ADR-0009 also reserve a released-Task Public-Update review candidate, but its
background job has not yet been implemented.

## Decision

`PATCH /tasks/:id` is the Task status mutation. Its body is strictly:

```text
{ status: TaskStatus }
```

Transitions are free: every Task status may move to every other Task status.
No transition matrix is introduced. The kanban interaction needs direct moves,
and the audit trail supplies the traceability that a matrix would otherwise try
to encode. Same-status requests are 200 no-ops and write neither an UPDATE nor
an audit row.

Every changed status writes `task_status_changed` in the same transaction as
the Task update. Its strict detail is:

```text
{ from: TaskStatus, to: TaskStatus }
```

The endpoint requires `If-Match` optimistic concurrency and an
`Idempotency-Key`, following the audit-sensitive mutation rule in
`03-api-contracts.md`. Its idempotency hash includes the supplied `If-Match`.

The Task-to-`released` Public-Update review-candidate job described by
ADR-0005 and ADR-0009 is deferred to a follow-up issue. The status write does
not enqueue that job or create a candidate yet.

For the Issue #138 board UI, drag and drop uses `@dnd-kit/core`, resolving the
deferral in ADR-0016. Its keyboard and touch support meet the board's
accessibility needs. The board renders a seventh `reopened` column, a
documented deviation from the six-column prototype, and includes a Task stats
strip because Issue #138 acceptance criteria require it even though the
prototype shows that strip only on the backlog view.

## Consequences

- The board can move any Task directly between all seven columns without a
  client-side transition matrix.
- Task-status history is queryable from the canonical audit log.
- Stale board cards fail safely with `conflict.stale_write` and the current
  `updated_at` value.
- Releasing a Task still does not alter reporter-facing VOC status or create a
  Public-Update candidate until the deferred background-job issue lands.
- The frontend board contract is intentionally broader than the six-column
  prototype where the accepted Issue #138 requirements require seven columns
  and a stats strip.
