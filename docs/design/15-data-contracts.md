# Data Contracts

## Purpose

This document centralizes implementation-facing data contracts.

System documents may explain why fields exist, but this document is the first place an AI coding agent should check for canonical fields, enums, and ownership.

## General Rules

```text
- All domain records include workspace_id unless explicitly global.
- All user-created records include created_by when applicable.
- All records that can be changed include created_at and updated_at.
- Archive is preferred over hard delete for objects referenced by other systems.
- Cross-system optional relationships use entity_links unless a direct foreign key is explicitly listed.
```

## Product Area

Owner: Core Platform

```text
core.product_areas
- id: uuid, required
- workspace_id: uuid, required
- project_id: uuid, nullable
- parent_id: uuid, nullable
- name: text, required
- description: text, nullable
- owner_team_id: uuid, nullable
- status: enum(active, archived), required
- sort_order: integer, required
- external_key: text, nullable
- url_pattern: text, nullable
- created_at: timestamp, required
- updated_at: timestamp, required
```

Rules:

```text
- parent_id must reference a Product Area in the same workspace.
- archived Product Areas remain visible on historical records.
- external_key and url_pattern do not imply forced sync.
```

## Finding

Owner: Finding / Insight

```text
findings
- id: uuid, required
- workspace_id: uuid, required
- title: text, required
- summary: text, required
- source_type: enum(voc_cluster, survey, manual), required
- source_id: uuid, nullable when source_type=manual
- evidence_count: integer, required
- severity: enum(low, medium, high, critical), required
- confidence: enum(low, medium, high), nullable
- status: enum(draft, active, not_actionable, converted, archived), required
- product_area_id: uuid, nullable
- linked_task_id: uuid, nullable
- linked_milestone_id: uuid, nullable
- created_by: uuid, required
- created_at: timestamp, required
- updated_at: timestamp, required
```

Rules:

```text
- Finding should have at least one Evidence Highlight before Task Request approval.
- linked_task_id and linked_milestone_id are convenience references; canonical cross-system history still uses entity_links.
```

## Evidence Highlight

Owner: Finding / Insight

```text
evidence_highlights
- id: uuid, required
- workspace_id: uuid, required
- source_type: enum(voc, survey_response, note), required
- source_id: uuid, nullable when source_type=note
- quote_or_summary: text, required
- customer_id: uuid, nullable
- product_area_id: uuid, nullable
- sentiment: enum(negative, neutral, positive), nullable
- importance: enum(low, medium, high), nullable
- created_by: uuid, required
- created_at: timestamp, required
```

Rules:

```text
- Evidence Highlight must preserve source reference when source_type is voc or survey_response.
- Evidence visibility cannot exceed source visibility.
```

## Task Request

Owner: Task / Project

```text
task_requests
- id: uuid, required
- workspace_id: uuid, required
- title: text, required
- summary: text, required
- source_type: enum(voc, voc_cluster, finding, survey_finding, manual), required
- source_id: uuid, nullable when source_type=manual
- status: enum(pending_review, approved, rejected, needs_more_evidence, converted), required
- priority: enum(low, medium, high, urgent), nullable
- product_area_id: uuid, nullable
- requested_by: uuid, required
- reviewer_id: uuid, nullable
- decided_at: timestamp, nullable
- converted_task_id: uuid, nullable
- created_at: timestamp, required
- updated_at: timestamp, required
```

Rules:

```text
- Approval, rejection, and conversion are audited.
- Converted Task must preserve source context through entity_links.
```

## Permission Request

Owner: Permission / Access

```text
permission_requests
- id: uuid, required
- workspace_id: uuid, required
- requester_id: uuid, required
- requested_permission: text, required
- requested_scope: json, nullable
- reason: text, required for sensitive permissions
- approver_id: uuid, nullable
- status: enum(pending, approved, rejected, expired, revoked), required
- expires_at: timestamp, nullable
- created_at: timestamp, required
- decided_at: timestamp, nullable
```

Rules:

```text
- Sensitive permissions require reason.
- Expiry and revocation must be enforceable.
- Decisions are audited.
```

## Entity Link

Owner: Entity Linking

```text
core.entity_links
- id: uuid, required
- workspace_id: uuid, required
- source_type: text, required
- source_id: uuid, required
- target_type: text, required
- target_id: uuid, required
- relation_type: enum from 11-entity-linking.md, required
- visibility: enum(internal_only, summary_visible, visible_to_reporter, admin_only), required
- created_by: uuid, required
- created_at: timestamp, required
```

Rules:

```text
- relation_type=generated_voc is forbidden.
- source and target must belong to the same workspace for MVP.
- visibility is enforced on every read path.
```

## Reporter-Facing VOC Status

Owner: VOC

```text
enum:
- 접수됨
- 검토 중
- 담당자 배정됨
- 처리 중
- 해결 준비 중
- 해결됨
- 다시 처리 중
- 종료됨
```

Rules:

```text
- Task Done does not automatically map to 해결됨.
- Released can trigger a manager review for public status update.
```

## Task Status

Owner: Task / Project

```text
enum:
- Backlog
- Todo
- Doing
- Review
- Done
- Released
- Reopened
```

Rules:

```text
- Task status is internal.
- Reporter-visible summaries use explicit summary contracts, not raw Task internals.
```

