# Task System

## Purpose

Task manages execution work: Task Requests, Tasks, Boards, progress, assignees, and due dates.

It is a backstage system. Reporter or default User cannot access internal Task work details.

Project is not the MVP operating scope. Older Project language is superseded by Managed System for MVP filters, defaults, and permissions. If broader execution grouping is needed later, use Work Initiative language.

## Boundary

Owns:

```text
- Task Request
- Task
- Milestone
- Work Initiative (future grouping)
- Task internal status
```

Does not own:

```text
- VOC creation
- Reporter-facing VOC Status final decision without VOC-owner review
- Survey Response
- Finding evidence source
```

Depends on:

```text
- 01-domain-model.md
- 02-requirements-matrix.md
- 10-cross-system-workflows.md
- 11-entity-linking.md
```

## Core Concepts

```text
- Managed System
- Milestone
- Work Initiative (future grouping)
- Task
- Task Request
- Board
- Assignee
- Priority
- Due Date
```

## Task Status

```text
- Backlog
- Todo
- Doing
- Review
- Done
- Released
- Reopened
```

Task status is not the same as Reporter-facing VOC Status.

Standalone Tasks are valid. A Task may be created from internal planning without VOC, Survey, Finding, Evidence, or reporter-facing context. Every Task requires exactly one Primary Managed System in MVP.

A Task converted from an approved Task Request starts in Backlog by default. A Backlog Task may have an assignee, but execution does not start until the Task moves to Todo or Doing.

## Task Request

Task Request is a buffer object that prevents backlog pollution.

```text
VOC / VOC Cluster / Survey Finding
→ Task Request
→ Admin or same-scope Developer review
→ approved conversion to Backlog Task
```

UI language must keep Task Request and Task separate:

```text
- Use "Request Task" when creating an execution candidate from VOC, VOC Cluster, Finding, or Survey-derived Finding.
- Use "Convert to Task" when an approved Task Request becomes a Backlog Task.
- Use "Create Task" only for standalone internal Tasks created from the Tasks surface.
- Do not label VOC, Finding, or Survey follow-up actions as "Create Task".
- Task Request screens are review/intake surfaces; Task screens are execution backlog, board, and detail surfaces.
```

Field responsibility:

```text
Task Request owns:
- source object and entity link intent
- evidence summary
- requested outcome
- Primary Managed System
- requester
- reviewer decision and review notes

Convert to Task owns final execution fields:
- Task title
- assignee
- priority
- due date
- Milestone optional
- Analytics Area optional
- execution notes
```

Task fields may be suggested from the Task Request or source object, but they
are finalized during Convert to Task.

### Slice 6 Tracer Contract: Finding To Task Request

`POST /findings/:id/request-task` creates a Task Request from an existing
Finding. The request body is:

```text
evidence_summary required text
requested_outcome required text
```

The source object is the path Finding. The service copies the Finding's
Primary Managed System, stores requester from the session Actor, and creates
only `status='pending_review'`.

The storage table is `task_request.task_requests`:

```text
id uuid primary key
workspace_id uuid
source_type text -- finding now; voc and voc_cluster reserved for later source slices
source_id uuid
primary_managed_system_id uuid
evidence_summary text
requested_outcome text
requester_actor_id uuid
status text default pending_review
created_at timestamptz
updated_at timestamptz
```

Side effects are atomic:

```text
- insert task_request.task_requests
- insert core.entity_links tuple (finding, task_request, requested_task)
- audit task_request_created_from_finding
```

Authorization reuses `finding.manage` for the Finding's Primary Managed
System. VOC and VOC Cluster Task Request sources are deferred. Review decisions
land in ADR-0026; conversion to Task and Link Existing Task land in ADR-0027.

### Slice 6 Conversion Contract: Task Request To Task

`POST /task-requests/:id/convert` converts only an approved Task Request into a
Backlog Task. The request body finalizes execution fields:

```text
title required
priority optional default medium
assignee_actor_id optional nullable
due_date optional nullable ISO date
milestone_id optional nullable UUID placeholder
analytics_area_id optional nullable
```

Side effects are atomic:

```text
- insert task.tasks with status backlog
- preserve entity_links:
  - (task_request, task, converted_to)
  - (finding, task, requested_task)
  - (voc, task, evidence_of) when existing Finding evidence links make this cheap
- update task_request.task_requests.status to converted
- audit task_created_from_request
```

`POST /task-requests/:id/link-task` is the alternative path when suitable work
already exists. It requires an approved request and an existing Task in the same
workspace and Primary Managed System. It creates `(task_request, task,
converted_to)`, marks the request `converted`, and audits
`task_linked_to_request`.

Standalone Tasks remain a valid data shape through nullable
`source_task_request_id`. Standalone `POST /tasks` is deferred.

## Key Workflows

### WF-TASK-001: VOC Follow-Up To Task Request

```text
VOC follow-up
→ Task Request
→ approve / reject / needs more evidence / link existing Task
→ converted Task starts in Backlog
```

### WF-TASK-002: Finding To Milestone

```text
Future cross-system workflow, not MVP core:

Finding
→ Create Milestone
→ Create child Tasks
→ Show evidence in Milestone Detail
```

## Functional Requirements

### FR-TASK-001: Create Task Request

Priority: MUST

Acceptance Criteria:

```text
- Contributor can create Task Request from VOC, VOC Cluster, Survey Finding, or Finding.
- Task Request requires exactly one Primary Managed System.
- Task Request stores source link and evidence summary.
- Task Request appears in Pending Review queue.
```

### FR-TASK-002: Approve Task Request

Priority: MUST

Acceptance Criteria:

```text
- Workspace Admin or Developer within the same Managed System scope can approve, reject, request more evidence, convert to Task, or link existing Task.
- Approval and conversion are separate domain decisions: approval accepts the execution candidate; conversion creates a Backlog Task.
- The UI may offer Approve and Convert as one fast path, but audit events and application service behavior must still record approval and task creation separately.
- Approved Task Requests may remain approved until a reviewer converts them to Task or links an existing Task.
- Conversion is where title, assignee, priority, due date, Milestone, and evidence summary are finalized for Task execution.
- Link Existing Task is the alternative to creating a new Task when suitable work already exists.
- Self-approval by the same scoped Developer requires explicit Task Request self-approval capability, reason, and audit metadata.
- Decision is audited.
- Converted Task starts in Backlog and preserves source Finding and Evidence links.
```

### FR-TASK-003: Manage Task

Priority: MUST

Acceptance Criteria:

```text
- Task supports title, status, assignee, priority, due date, Managed System, optional Milestone, and Analytics Area.
- Task can link VOC, Survey, Finding, and Evidence.
- Task Detail shows why the work exists.
```

### FR-TASK-004: Manage Milestone

Priority: SHOULD

Acceptance Criteria:

```text
- Milestone can be created from Finding.
- Milestone can group Tasks.
- Milestone Detail shows Why this milestone exists, source, Analytics Area, evidence count, and linked objects.
- Milestone lists show compact schedule risk with a mini timeline.
- Milestone Detail includes a Timeline section with a child Task Gantt chart.
```

## UI / UX Requirements

### Task Request Queue

Views:

```text
- Pending
- Needs evidence
- Approved
- Rejected
- All
```

Actions:

```text
- Approve
- Reject
- Request More Evidence
- Convert to Task (S6-4)
- Link Existing Task (S6-4)
```

### Task Detail

Task UI should follow Linear's fast, compact issue style.

Task Board cards show only execution-scanning fields and linked-context
indicators. Detailed source context belongs in Task Detail or the source
object's route.

Task Board card:

```text
- title
- Task status
- assignee
- priority
- due date
- Primary Managed System
- linked-context indicator when source VOC, Finding, Survey, Evidence, or Task Request exists
```

Always show:

```text
- Basic Task fields
- Primary Managed System
```

Show when linked context exists:

```text
- Evidence Panel
- Source Finding
- Source VOC / Survey
- Reporter-facing Status
- Reporter Summary / Public Update candidate
```

### Milestone List And Detail

Milestone UI should preserve the dense, list-first Task experience. The
Milestones view shows each Milestone as a compact row with source context,
Managed System, Analytics Area, owner, status, due date, progress, and a mini
timeline for schedule risk scanning.

Selecting a Milestone opens RightDetailPanel as the Milestone Detail. The detail
panel is the source of truth for milestone context; the Gantt chart is a
Timeline section inside the detail panel, not a replacement for the detail view.

Milestone Detail sections:

```text
- Header: title, Primary Managed System, Analytics Area, owner, status, due date, actions
- Overview: Why this milestone exists, source Finding / VOC / Survey context, reporter-safe summary candidate
- Timeline: child Task Gantt by date and internal Task status
- Tasks: child Task list with status, assignee, priority, and due date
- Evidence: linked Evidence Highlights and source objects
- Activity: decisions, audit events, and updates
```

The Milestone list may show a mini timeline, but detailed scheduling belongs in
the Timeline section of Milestone Detail. Reporter-facing summaries must not
expose raw internal Task status, backlog priority, internal due dates, or
Developer discussion from the Gantt.

## Permissions

```text
- Reporter / default User cannot access Task internal comments or backstage detail.
- Admin can manage Task Requests and Tasks.
- Developer can manage Task Requests and Tasks within their Managed System scope.
- Access to one Managed System does not grant access to sibling Managed Systems unless permission scope explicitly includes them.
- Conversion and Link Existing Task reuse `finding.manage` on the Primary Managed System until a later Task-specific capability is approved.
```

## Cross-System Dependencies

```text
- Finding creates Task Request or links execution work.
- VOC status may be updated after Released, but not automatically on Done.
- Survey Outcome may validate Task or Milestone.
- Entity Links preserve source and visibility.
```

## Out Of Scope For MVP

```text
- Jira-level workflow customization
- Complex field customization
- Sprint / cycle automation
- Automatic priority decision
```
