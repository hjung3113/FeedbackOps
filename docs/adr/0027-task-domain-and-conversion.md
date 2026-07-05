# ADR-0027: Task Domain And Conversion

Date: 2026-07-04

## Status

Accepted

## Context

ADR-0025 introduced Task Request creation from Finding. ADR-0026 introduced
Task Request review decisions and kept approval separate from conversion.
FR-TASK-002 and FR-TASK-003 require the execution Task domain, conversion of
approved Task Requests to Backlog Tasks, and Link Existing Task as the
alternative path.

## Decision

The Task execution table is `task.tasks`. Task status values are:

```text
backlog
todo
doing
review
done
released
reopened
```

Task priority values are:

```text
low
medium
high
urgent
```

Conversion requires `task_request.status = approved`. Approval is not re-run
and is not re-audited during conversion. Conversion writes a Backlog Task,
sets the Task Request to `converted`, and records `task_created_from_request`.

Link Existing Task also requires `approved`, validates the target Task is in the
same workspace and Primary Managed System, writes the same provenance link, sets
the Task Request to `converted`, and records `task_linked_to_request`.

Authority reuses ADR-0026's review boundary:

```text
Admin OR Developer with finding.manage on primary_managed_system_id
```

No new Task capability is introduced in this slice.

Entity Links add exactly these production tuples:

```text
('task_request','task','converted_to')
('finding','task','requested_task')
('voc','task','evidence_of')
```

`('task_request','task','converted_to')` records which approved request produced
or satisfied the Task. `('finding','task','requested_task')` preserves source
Finding context on newly converted Tasks and is also reused by
`POST /findings/:id/link-task` when an authorized user links an existing Task
directly from Finding Detail. `('voc','task','evidence_of')` preserves VOC
evidence where it is cheaply derivable from existing Finding evidence links.

Milestone remains deferred. `task.tasks.milestone_id` is a nullable UUID
placeholder with no FK until FR-TASK-004 introduces the Milestone table.

Standalone Tasks are a valid data shape through `source_task_request_id = null`,
but standalone `POST /tasks` is not introduced by this issue.

## Consequences

- ADR-0026's conversion/link-existing deferral is superseded.
- Approval, conversion, and link-existing remain separate audited decisions.
- Task Request conversion preserves source context through `entity_links`, not a
  convenience `converted_task_id` column.
- Finding direct link to existing Task uses the existing
  `(finding, task, requested_task)` tuple plus `findings.linked_task_id`; no new
  entity-link tuple or migration is introduced.
- Future standalone Task creation must use the same Task table and status enum.
