# ADR-0032: Task Reporter Summary Read-Time Projection

Date: 2026-07-18

## Status

Accepted

## Context

ADR-0023 Section F defines the strict reporter-safe summary contract for a
linked Task, but the Task provider previously returned UNAVAILABLE. Issue #178
makes that summary reachable for a Reporter reading a `summary_visible` Task
link from their own VOC.

Task status is an internal execution state machine. ADR-0005 prohibits
automatic cross-machine writes from Task status into reporter-facing VOC
status. There is also no Task-owned public-update source: `voc_public_updates`
is VOC-owned and requires a VOC id, while Task release creates a review
candidate rather than a public update.

## Decision

The Task entity-link provider reads only `tasks.title` and `tasks.status` and
maps them to the ADR-0023 Section F reporter summary:

| Task status | Reporter-facing projection |
| --- | --- |
| `backlog`, `todo` | 진행 예정 |
| `doing`, `review` | 진행 중 |
| `done` | 해결 준비 중 |
| `released` | 반영됨 |
| `reopened` | 다시 처리 중 |

This mapping is a read-time display projection only. It stores no value,
updates no Task or VOC row, writes no audit event, and does not change the
reporter-facing VOC status machine. It therefore does not violate ADR-0005's
ban on automatic cross-machine writes.

`public_title` is `tasks.title`. Task titles are reporter-visible from this
slice onward; operators must author them accordingly.

This ADR amends ADR-0023 Section F so `last_public_update_at` is optional.
The Task provider omits it, along with `public_update_excerpt`,
`owning_team_public_name`, and `expected_resolution_date`. In particular,
`tasks.due_date` is an internal execution field and must never populate
`expected_resolution_date`.

ADR-0023 Section F's forbidden-fields list remains authoritative. The summary
query and mapper must not read raw Task status beyond this projection, internal
comments, internal assignee notes, backlog priority, individual Developer
names, internal due dates, root-cause detail, severity, confidence, private
notes, private customer or Survey-response detail, or permission-decision
internals.

## Consequences

- A Reporter can receive only the strict Task reporter summary through the
  existing entity-link visibility decision path.
- Scoped Developers retain full linked-object access through existing
  authorization helpers; no new authorization predicate is introduced.
- A future Task-owned public-update source may populate the optional update
  fields only through a separately approved contract change.
