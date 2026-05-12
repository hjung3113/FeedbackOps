# Domain Model

## Purpose

This is the canonical glossary and entity ownership map for FeedbackOps Suite.

System documents must not redefine these concepts differently. They may add local behavior only.

## Canonical Entities

### VOC

Owner system: VOC

Definition:

```text
고객/사용자가 직접 제기한 의견, 불만, 요청, 질문, 칭찬.
```

Invariants:

```text
- VOC is directly submitted by a user/customer.
- Survey Response must not create VOC.
- Reporter-facing status is separate from internal Task status.
```

### VOC Cluster

Owner system: VOC

Definition:

```text
Repeated or related VOCs grouped by duplicate, similar issue, root cause, or feature area.
```

Invariants:

```text
- MVP clustering is manager-confirmed.
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
- Finding bridges evidence to execution.
- Finding can originate from VOC Cluster, Survey Result, or manual analysis.
- Finding can create Task Request, Task, or Milestone depending on permission and scope.
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

Owner system: Task / Project

Definition:

```text
Reviewed execution candidate used to protect Task backlog quality.
```

Invariants:

```text
- Contributor can request work without directly creating Task.
- PM / Manager approves, rejects, requests more evidence, converts to Task, or links existing Task.
- Decision is audited.
```

### Task

Owner system: Task / Project

Definition:

```text
Internal execution work item.
```

Invariants:

```text
- Task is backstage by default.
- Task Done does not mean customer problem is solved.
- Released may trigger reporter-facing status review and public update.
```

### Milestone

Owner system: Task / Project

Definition:

```text
Larger execution unit grouping Tasks under a Project.
```

Invariants:

```text
- Milestone can be created from Finding when work is larger than one Task.
- Milestone should show why it exists and what evidence supports it.
- Milestone can be validated by Outcome Survey.
```

### Product Area

Owner system: Core Platform

Definition:

```text
Internal product context object used to classify VOC, Finding, Task, Survey, and Project.
```

Invariants:

```text
- Product Area is not forced to sync with app menus, URLs, or code modules.
- Product Area can be hierarchical.
- Product Area can be archived while preserving historical links.
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

Task / Project owns:
- Task Request
- Task
- Milestone
- Project execution views

Survey owns:
- Survey
- Survey Response
- Survey Result

Core Platform owns:
- Workspace
- User / Actor
- Team
- Customer / Account
- Contact
- Product Area
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

