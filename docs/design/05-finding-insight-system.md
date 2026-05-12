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
- customer_id optional
- product_area_id optional
- sentiment optional
- importance optional
- created_by
- created_at
```

## Key Workflows

### WF-FIND-001: VOC Evidence To Finding

```text
VOC Cluster
→ Evidence Highlights
→ Finding
→ Task Request / Task / Milestone
```

### WF-FIND-002: Survey Evidence To Finding

```text
Survey Result
→ Text Response Highlights / Result Summary
→ Finding
→ Task Request / Task / Milestone
```

## Functional Requirements

### FR-FIND-001: Create Finding

Priority: MUST

Acceptance Criteria:

```text
- Manager can create Finding from VOC, VOC Cluster, Survey Result, or manual analysis.
- Finding stores source_type and source_id.
- Finding can link Product Area.
- Finding can include Evidence Highlights.
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

Priority: MUST

Acceptance Criteria:

```text
- Finding can create Task Request.
- Authorized Manager can create Task directly.
- Finding can create Milestone when work is larger than one Task.
- Finding can link existing Task or Milestone.
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
- Affected Product Area
- Linked VOC Cluster
- Linked Survey Result
- Linked Task Request / Task / Milestone
```

Primary CTAs:

```text
- Add Evidence
- Link Existing Evidence
- Request Task
- Create Task
- Create Milestone
- Mark as Not Actionable
```

## Permissions

```text
- Reporter cannot read internal Finding details by default.
- Manager / PM can create and manage Findings.
- Evidence visibility follows source visibility and entity_links.visibility.
```

## Cross-System Dependencies

```text
- VOC System: source VOC and VOC Cluster
- Survey System: source Survey Result and Response
- Task / Project System: Task Request, Task, Milestone
- Entity Linking: evidence_of, generated_finding, requested_task
```

## Out Of Scope For MVP

```text
- Fully automatic insight generation
- Advanced research repository
- Complex tagging taxonomy
- Automatic priority scoring
```
