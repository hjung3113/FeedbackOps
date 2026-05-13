# Domain Model

## Purpose

This is the canonical glossary and entity ownership map for FeedbackOps Suite.

System documents must not redefine these concepts differently. They may add local behavior only.

## Canonical Entities

### Actor

Owner system: Core Platform

Definition:

```text
AD-authenticated internal person whose permissions are evaluated inside a workspace.
```

Invariants:

```text
- All MVP users are Actors.
- There is no external/customer-contact login in MVP.
- Admin, Developer, and User can all submit VOC.
- Role Level authority is Admin > Developer > User.
```

### Managed System

Owner system: Core Platform

Definition:

```text
Internal company system that FeedbackOps tracks feedback and improvement work for, such as Tableau, Power BI, or Looker.
```

Invariants:

```text
- Managed System is the MVP scope for filters, defaults, permissions, and dashboards.
- VOC, Finding, Task Request, Task, and Survey each require exactly one Primary Managed System.
- Managed System may have a default owner or team; default owner may assign the record but does not mean triaged.
- Multi-system impact is represented by description, tags, separate linked records, or entity links.
- Project is not the MVP operating scope; future grouping should use Work Initiative language.
```

### VOC

Owner system: VOC

Definition:

```text
내부 AD 인증 Actor가 직접 제출한 고객 또는 사용자 의견, 불만, 요청, 질문, 칭찬.
```

Invariants:

```text
- VOC is directly submitted by an AD-authenticated Actor.
- Survey Response must not create VOC.
- VOC must reference exactly one Primary Managed System in MVP.
- Reporter is the Actor who submitted the VOC, not a role or external contact.
- Severity is assigned during triage by Developer or Admin, not by the Reporter at creation.
- Reporter-facing status is separate from internal Task status.
- VOC has a triage state independent of reporter-facing status.
- VOC may be Unassigned after creation or after owner removal.
- Ownership assignment is an internal workflow decision and does not imply Task creation.
- VOC follow-up creates Task Request, not Task directly.
- Reporter may edit title, description, and attachments only before triage begins; after that they use Reporter Reply.
```

### VOC Cluster

Owner system: VOC

Definition:

```text
Repeated or related VOCs grouped by duplicate, similar issue, root cause, or feature area.
```

Invariants:

```text
- MVP clustering is confirmed by an authorized Admin or same-scope Developer.
- Similarity recommendations do not automatically create clusters.
- Cluster can create Finding.
```

### Survey

Owner system: Survey

Definition:

```text
A structured question set used for discovery, validation, or outcome measurement.
```

Types:

```text
- Discovery
- Validation
- Outcome
```

### Survey Response

Owner system: Survey

Definition:

```text
An answer submitted to a Survey.
```

Invariants:

```text
- Response remains in Survey System.
- Response can become Evidence Highlight or Finding source.
- Response cannot become VOC.
```

### Finding

Owner system: Finding / Insight

Definition:

```text
Evidence-based judgment object that summarizes a problem, pattern, or execution candidate.
```

Invariants:

```text
- Finding bridges evidence to execution when synthesis is needed.
- Finding can originate from VOC Cluster, Survey Result, or manual analysis.
- Finding can create Task Request or link execution work depending on permission and scope.
- Finding must reference exactly one Primary Managed System in MVP.
- Finding is optional; VOC, Survey, and Task records can complete local workflows without one.
```

### Evidence Highlight

Owner system: Finding / Insight

Definition:

```text
A compact evidence fragment from VOC text, Survey Response, or manual note.
```

Invariants:

```text
- Evidence keeps source reference.
- Evidence visibility follows source visibility and entity link visibility.
- Evidence should explain why a Finding or Task exists.
```

### Task Request

Owner system: Task

Definition:

```text
Reviewed execution candidate used to protect Task backlog quality.
```

Invariants:

```text
- Contributor can request work without directly creating Task.
- Task Request must reference exactly one Primary Managed System in MVP.
- Workspace Admin or same-scope Developer approves, rejects, requests more evidence, converts to Task, or links existing Task.
- Self-approval by the same Developer requires explicit scoped capability, reason, and audit metadata.
- Decision is audited.
```

### Task

Owner system: Task

Definition:

```text
Internal execution work item.
```

Invariants:

```text
- Task is backstage by default.
- Task Done does not mean the reported problem is solved.
- Released may trigger reporter-facing status review and public update.
- Task must reference exactly one Primary Managed System in MVP.
- Converted Task starts in Backlog; Backlog may have an assignee but execution starts at Todo or Doing.
- Standalone Tasks are valid and do not require source evidence, Finding, VOC, or Survey links.
```

### Milestone

Owner system: Task

Definition:

```text
Lightweight Task-system grouping for work larger than one Task.
```

Invariants:

```text
- Milestone can be created when work is larger than one Task.
- Milestone belongs to exactly one Primary Managed System in MVP.
- Milestone should show why it exists and may reference evidence when linked manually.
- Milestone-to-Outcome-Survey validation is a future cross-system workflow.
```

### Analytics Area

Owner system: Core Platform

Definition:

```text
Managed analytical menu, report group, or business analysis area inside exactly one Managed System.
```

Invariants:

```text
- Analytics Area belongs to exactly one Managed System.
- Analytics Area is not an MVP permission boundary.
- VOC Analytics Area is optional and selectable only under the chosen Primary Managed System.
- Analytics Area may reflect real analytics menus, but is not forced to sync automatically with app menus, URLs, or code modules in MVP.
- Analytics Area may have an optional parent for lightweight grouping.
- Analytics Area can be archived while preserving historical links.
- Analytics Area is a classification and defaulting context, not a navigation partition.
```

### Entity Link

Owner system: Core Platform / Entity Linking

Definition:

```text
Loose cross-system relation with relation_type and visibility.
```

Invariants:

```text
- relation_type comes from the registry in 11-entity-linking.md.
- visibility must be enforced at read time.
- generated_voc is not allowed.
```

### Permission Request

Owner system: Permission / Access

Definition:

```text
Request for elevated or scoped access.
```

Invariants:

```text
- Sensitive permission requests require a reason.
- Approval, rejection, revocation, and expiry are audited.
- Permissions combine Role Level with Managed System scope in MVP.
- Admin is workspace-level.
- Developer can be scoped to one Managed System.
- Analytics Area is not an MVP permission boundary.
- Explicit Deny overrides general Allow.
```

## Ownership Boundaries

```text
VOC System owns:
- VOC
- VOC Cluster
- Reporter-facing VOC Status
- Public Update

Finding / Insight owns:
- Finding
- Evidence Highlight

Task owns:
- Task Request
- Task
- Milestone
- Work Initiative execution views

Survey owns:
- Survey
- Survey Response
- Survey Result

Core Platform owns:
- Workspace
- User / Actor
- Team
- Managed System Registry
- Analytics Area
- Audit Log

Permission / Access owns:
- Permission Request
- Role / Permission decisions

Entity Linking owns:
- Entity Link relation registry
- Link visibility contracts
```

## Interpretation Rule

When a system document conflicts with this domain model, this domain model wins unless a later accepted decision explicitly updates it.
