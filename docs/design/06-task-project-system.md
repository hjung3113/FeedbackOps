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
```

## UI / UX Requirements

### Task Request Queue

Views:

```text
- Pending Review
- Approved
- Rejected
- Converted to Task
- Needs More Evidence
```

Actions:

```text
- Approve
- Reject
- Request More Evidence
- Convert to Task
- Link Existing Task
```

### Task Detail

Task UI should follow Linear's fast, compact issue style.

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

## Permissions

```text
- Reporter / default User cannot access Task internal comments or backstage detail.
- Admin can manage Task Requests and Tasks.
- Developer can manage Task Requests and Tasks within their Managed System scope.
- Access to one Managed System does not grant access to sibling Managed Systems unless permission scope explicitly includes them.
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
