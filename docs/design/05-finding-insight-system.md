# Finding / Insight System

## Purpose

Finding is the bridge between evidence and execution.

It summarizes problems, patterns, or execution candidates discovered from VOC Cluster, Survey Result, or manual analysis.

## Boundary

Owns:

```text
- Finding
- Evidence Highlight
- Evidence-to-execution judgment
```

Does not own:

```text
- VOC creation
- Survey response storage
- Task execution
- Permission approval
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
- Finding
- Evidence Highlight
- Source
- Severity
- Confidence
- Linked Task Request
- Linked Task
- Linked Milestone
```

## MVP Fields

```text
Finding
- id
- workspace_id
- title
- summary
- source_type: voc_cluster / survey / manual
- source_id
- managed_system_id
- evidence_count
- severity
- confidence optional
- status
- linked_task_id optional
- linked_milestone_id optional
```

## Evidence Highlight

Finding should not only store a high-level summary. It should preserve key evidence fragments that explain why execution is justified.

Recommended object:

```text
evidence_highlights
- id
- workspace_id
- source_type: voc / survey_response / note
- source_id
- quote_or_summary
- managed_system_id
- analytics_area_id optional
- sentiment optional
- importance optional
- created_by
- created_at
```

## Key Workflows

### WF-FIND-001: VOC Evidence To Finding

```text
VOC Cluster
→ optional Evidence Highlights
→ optional Finding
→ optional Task Request
```

## Finding Creation Decision Rule

Finding is optional. Create a Finding only when synthesis is needed before
execution.

```text
Create Finding when:
- multiple VOCs, Survey results, Evidence Highlights, or manual notes must be summarized together.
- a VOC Cluster needs root-cause, scope, impact, severity, or confidence judgment.
- High Severity VOC needs evidence, scope, or confidence clarified before execution.
- stakeholders need a durable evidence-to-execution explanation before Task Request review.

Bypass Finding and create Task Request when:
- a single VOC has a clear follow-up action.
- the request is a straightforward bug, small fix, or operational task.
- the execution candidate is already clear and does not need synthesis.
- the authorized actor records no-follow-up-needed instead of execution.
```

Missing Finding alone is not a gap. It becomes actionable only when workspace
policy, Managed System policy, severity rules, cluster state, or explicit
workflow configuration requires synthesis.

### WF-FIND-002: Survey Evidence To Finding

```text
Survey Result
→ optional Text Response Highlights / Result Summary
→ optional Finding
→ optional Task Request
```

## Functional Requirements

### FR-FIND-001: Create Finding

Priority: MUST

Acceptance Criteria:

```text
- Admin or same-scope Developer can create Finding from VOC, VOC Cluster, Survey Result, or manual analysis when synthesis is needed.
- Finding requires exactly one Primary Managed System.
- Finding stores source_type and source_id.
- Finding can link Analytics Area under its Primary Managed System.
- Finding can include Evidence Highlights.
- Finding is not required for every VOC, Survey Result, or Task.
```

### FR-FIND-002: Manage Evidence Highlights

Priority: MUST

Acceptance Criteria:

```text
- User can add evidence from VOC text, Survey response, or manual note.
- Evidence preserves source reference.
- Evidence can be shown in Finding Detail and Task Detail.
```

### FR-FIND-003: Convert Finding To Execution Candidate

Priority: SHOULD

Acceptance Criteria:

```text
- Finding can create Task Request.
- Authorized Admin or same-scope Developer can link existing Task or future execution grouping when appropriate.
- Simple VOC follow-up may bypass Finding and go directly to Task Request.
```

## UI / UX Requirements

### Finding Detail

Purpose:

```text
여러 증거를 바탕으로 어떤 문제가 있고, 왜 실행해야 하는지 판단한다.
```

Layout:

```text
- Title / Summary
- Source Type
- Severity
- Confidence
- Evidence Highlights
- Primary Managed System
- Affected Analytics Area
- Linked VOC Cluster
- Linked Survey Result
- Linked Task Request / Task
```

Primary CTAs:

```text
- Add Evidence
- Link Existing Evidence
- Request Task
- Mark as Not Actionable
```

Finding-to-Milestone and Finding-to-Work-Initiative actions are future
cross-system behavior. MVP Finding execution actions are Request Task and Link
Existing Task.

## Permissions

```text
- Reporter cannot read internal Finding details by default.
- Admin can create and manage Findings.
- Developer can create and manage Findings within their Managed System scope.
- Evidence visibility follows source visibility and entity_links.visibility.
```

## Cross-System Dependencies

```text
- VOC System: source VOC and VOC Cluster
- Survey System: source Survey Result and Response
- Task System: Task Request, Task
- Entity Linking: evidence_of, generated_finding, requested_task
```

## Out Of Scope For MVP

```text
- Fully automatic insight generation
- Advanced research repository
- Complex tagging taxonomy
- Automatic priority scoring
```
