# Task / Project System

## Purpose

Task / Project manages execution work: Projects, Milestones, Tasks, Boards, progress, assignees, and due dates.

It is a backstage system. External Reporter or default User cannot access internal Task work details.

## Boundary

Owns:

```text
- Task Request
- Task
- Project
- Milestone
- Task internal status
```

Does not own:

```text
- VOC creation
- Reporter-facing VOC Status final decision without manager review
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
- Project
- Milestone
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

## Task Request

Task Request is a buffer object that prevents backlog pollution.

```text
VOC / VOC Cluster / Survey Finding
→ Task Request
→ PM or Manager review
→ Task
```

## Key Workflows

### WF-TASK-001: Assign-Time Creation Decision

```text
Manager assigns developer
or user assigns self
→ Popup
→ Task로 생성 / Task Request로 생성 / 기존 Task에 연결 / 나중에 처리
```

### WF-TASK-002: Finding To Milestone

```text
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
- Task Request stores source link and evidence summary.
- Task Request appears in Pending Review queue.
```

### FR-TASK-002: Approve Task Request

Priority: MUST

Acceptance Criteria:

```text
- PM / Manager can approve, reject, request more evidence, convert to Task, or link existing Task.
- Decision is audited.
- Converted Task preserves source Finding and Evidence links.
```

### FR-TASK-003: Manage Task

Priority: MUST

Acceptance Criteria:

```text
- Task supports title, status, assignee, priority, due date, Project, Milestone, Product Area.
- Task can link VOC, Survey, Finding, and Evidence.
- Task Detail shows why the work exists.
```

### FR-TASK-004: Manage Milestone

Priority: SHOULD

Acceptance Criteria:

```text
- Milestone can be created from Finding.
- Milestone can group Tasks.
- Milestone Detail shows Why this milestone exists, source, Product Area, evidence count, and linked objects.
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
- Evidence Panel
- Source Finding
- Source VOC / Survey
- Reporter-facing Status
- Public Update candidate
```

## Permissions

```text
- External Reporter / default User cannot access Task internal comments or backstage detail.
- Manager / PM can manage Task Requests and Tasks.
- Developer can access assigned Tasks according to project permission.
```

## Cross-System Dependencies

```text
- Finding creates Task Request / Task / Milestone.
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
