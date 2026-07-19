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
- VOC, Finding, Task Request, Task, and Survey require exactly one primary_managed_system_id in MVP.
```

## Managed System

Owner: Core Platform

```text
core.managed_systems
- id: uuid, required
- workspace_id: uuid, required
- name: text, required
- description: text, nullable
- default_voc_owner_user_id: uuid, nullable
- default_voc_owner_team_id: uuid, nullable
- default_task_reviewer_user_id: uuid, nullable
- default_survey_operator_actor_id: uuid, nullable
- status: enum(active, archived), required
- created_at: timestamp, required
- updated_at: timestamp, required
```

Rules:

```text
- Managed System is the MVP scope and defaulting context inside a workspace.
- Managed System must not create separate VOC, Survey, Task, Finding, Dashboard, or Entity Link system instances.
- Defaults prefill responsibility but can be overridden by authorized users.
- Default owner or team may prefill actual owner fields but does not mean the record is triaged.
- Project language in older contracts is superseded by Managed System for MVP scope.
```

## Survey

Owner: Survey

```text
survey.surveys
- id, workspace_id, display_id: uuid/uuid/text, required; display_id unique per workspace
- type: enum(discovery, validation, outcome), required
- status: enum(draft, open, closed), required
- title: text, required; description: text, nullable
- primary_managed_system_id: uuid, required; analytics_area_id: uuid, nullable
- operator_actor_id, created_by: uuid, required
- responses_identity_protected: boolean, required
- opened_at, closed_at: timestamp, nullable; created_at, updated_at: timestamp, required

survey.survey_questions
- survey_id, workspace_id, kind, prompt, sort_order, branch_depth: required
- choice options, rating bounds/labels, and one-level branch-parent metadata are nullable by kind

survey.survey_responses / survey.survey_response_answers
- responses snapshot respondent_actor_id and identity_protected; answers reference both a
  response and question through survey-qualified foreign keys.

survey.survey_response_excerpt_approvals
- id, workspace_id, survey_id, response_id, question_id, redacted_excerpt, approved_by,
  approved_at: required; revoked_at: nullable.
- Stores an explicit, redacted evidence excerpt only. It never stores respondent identity
  or raw response text; revocation preserves the approval row.
- Raw response text is available only through the single-question, workspace-scoped Survey
  evidence reader used during Finding creation. Result reads expose active redacted approvals only.
```

Rules:

```text
- A draft Survey has neither lifecycle timestamp; open has opened_at only; closed has both.
- Question branches are limited to depth 0 or 1; a branch parent must be depth 0.
- Response identity protection is stored on the response and inherited by its answers.
- Response/answer write commands are deferred to #185.
```

## Analytics Area

Owner: Core Platform

```text
core.analytics_areas
- id: uuid, required
- workspace_id: uuid, required
- managed_system_id: uuid, required
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
- parent_id must reference an Analytics Area in the same workspace.
- MVP UI treats parent_id as optional grouping metadata, not a required deep tree editor.
- Analytics Area belongs to exactly one Managed System.
- archived Analytics Areas remain visible on historical records.
- FeedbackOps analytics_areas is the MVP source of truth.
- external_key and url_pattern are optional reference metadata and do not imply forced sync.
- owner_team_id is a routing/defaulting hint only and does not grant authorization.
- Analytics Area is not an MVP permission boundary.
- VOC Analytics Area must belong to the VOC Primary Managed System.
```

## VOC

Owner: VOC

```text
vocs
- id: uuid, required
- workspace_id: uuid, required
- primary_managed_system_id: uuid, required
- reporter_id: uuid, required
- title: text, required
- description_rich_content: rich_content, required
- source_context: enum(direct_use, proxy_report, operational_discovery, stakeholder_request), required default direct_use
- triage_state: enum(untriaged, triaged, needs_more_information, dismissed_not_actionable), required
- reporter_facing_status: enum from Reporter-Facing VOC Status, required
- severity: enum(low, medium, high, critical), nullable until triage
- analytics_area_id: uuid, nullable
- owner_user_id: uuid, nullable
- owner_team_id: uuid, nullable
- created_by: uuid, required
- created_at: timestamp, required
- updated_at: timestamp, required
```

Rules:

```text
- reporter_id is the Actor who submitted the VOC.
- Reporter is not a Role Level or external contact.
- No affected_user field exists in MVP.
- Proxy Report context is captured in description_rich_content, not a separate affected_user field.
- Reporter can edit title, description, and attachments only before triage begins.
- After triage begins, Reporter adds information through Reporter Reply.
- Severity is assigned during triage by Admin or same-scope Developer.
- Analytics Area is optional and must belong to primary_managed_system_id.
- Absence of Analytics Area is valid in MVP.
```

## Finding

Owner: Finding / Insight

```text
findings
- id: uuid, required
- workspace_id: uuid, required
- primary_managed_system_id: uuid, required
- title: text, required
- summary: text, required
- source_type: enum(voc, voc_cluster, survey, survey_response, manual), required
- source_id: uuid, nullable when source_type=manual
- evidence_count: integer, required
- severity: enum(low, medium, high, critical), required
- confidence: enum(low, medium, high), nullable
- status: enum(draft, active, not_actionable, converted, archived), required
- analytics_area_id: uuid, nullable
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
- primary_managed_system_id is the MVP scope context and must not create a separate app partition.
- analytics_area_id must belong to primary_managed_system_id when present.
- Absence of analytics_area_id is valid in MVP.
- User-directed status changes use `PATCH /findings/:id`; Slice 6 allows only draft -> active, draft -> not_actionable, active -> not_actionable, and not_actionable -> active.
```

## Evidence Highlight

Owner: Finding / Insight

```text
evidence_highlights
- id: uuid, required
- workspace_id: uuid, required
- finding_id: uuid, required   # parent Finding (added by ADR-0024 §F; POST /findings/:id/evidence-highlights)
- primary_managed_system_id: uuid, required
- source_type: enum(voc, survey_response, note), required
- source_id: uuid, nullable when source_type=note
- source_title: text, nullable
- source_meta: text, nullable
- quote_or_summary: text, required
- analytics_area_id: uuid, nullable
- sentiment: enum(negative, neutral, positive), nullable
- importance: enum(low, medium, high), nullable
- created_by: uuid, required
- created_at: timestamp, required
```

Rules:

```text
- Evidence Highlight must preserve source reference when source_type is voc or survey_response.
- Evidence visibility cannot exceed source visibility.
- source_title and source_meta are read-time DTO derivations for source_type=voc only.
  source_title is the source VOC title; source_meta is the source VOC display_id.
  Both are always present on the DTO and become null when the source is withheld,
  unreadable, unresolved, or not a VOC.
```

## VOC Cluster

Owner: Finding / Insight

```text
voc_clusters
- id: uuid, required
- workspace_id: uuid, required
- display_id: text, required
- title: text, required
- summary: text, nullable
- severity: enum(low, medium, high, critical), nullable
- confidence: enum(low, medium, high), nullable
- rationale: text, nullable
- owner_user_id: uuid, nullable
- status: enum(draft, confirmed), required
- primary_managed_system_id: uuid, required
- created_by: uuid, required
- confirmed_by: uuid, nullable
- confirmed_at: timestamp, nullable
- created_at: timestamp, required
- updated_at: timestamp, required
- member_count: integer, non-negative, required
```

Read DTO extensions:

```text
- members: optional array of { voc_id, added_by, added_at, display_id?, title?, severity?, reporter_facing_status? }
- linked_findings: optional array of { id, display_id, status }
```

Candidate-peer picker DTO (separate read endpoint):

```text
ListSameManagedSystemCandidatePeersResponse
- candidate_basis: literal(same_managed_system_active_voc), required
- candidates: array of SameManagedSystemCandidatePeerDto, required

SameManagedSystemCandidatePeerDto
- voc_id: uuid, required
- display_id: text, required
- title: text, required
- severity: enum(low, medium, high, critical), nullable, required
- reporter_facing_status: text, required
```

Rules:

```text
- Workspace fields are nullable and existing clusters receive no fabricated backfill.
- owner_user_id references an assignable internal user in the cluster workspace.
- confirmed_by and confirmed_at are server-owned. A draft-to-confirmed transition
  writes both atomically; later confirmation requests preserve the original provenance.
- linked_findings lists Findings created from the cluster where
  finding.source_type='voc_cluster' and finding.source_id=cluster.id.
- linked_findings is derived at read time. It exposes only id, display_id, and
  status; title and summary are intentionally omitted to avoid content leakage.
- Cluster detail and list reads include linked_findings as an array. Create and
  update responses may omit it.
- `member_count` is the authorized membership total, not total membership. It
  uses the same per-member predicate as `members`: Admin, `voc.read` on the
  member Managed System, or reporter ownership. This contract change prevents
  the count from disclosing hidden VOC existence. It is always present and
  does not require a stored column.
- Member enrichment fields are additive and optional. They are returned only
  for authorized members; unreadable and corrupt cross-System memberships are
  absent rather than masked or represented by placeholders.
- `candidate_basis` deliberately names the temporary same-Managed-System active-
  VOC heuristic. Candidate peers are membership-picker options, not semantic
  matches or cluster recommendations; real embedding similarity belongs to
  epic #168. The DTO must not add a similarity score, confidence, or rationale.
- Candidate peers exclude existing members/source VOCs, archived VOCs, and
  cross-Managed-System VOCs. Candidate item visibility is Admin, `voc.read` on
  the candidate Managed System, or reporter ownership. Triage-only/effective
  summary scope grants no candidate visibility; unreadable candidates are absent.
```

## Task Request

Owner: Task

```text
task_requests
- id: uuid, required
- workspace_id: uuid, required
- primary_managed_system_id: uuid, required
- title: text, required
- summary: text, required
- source_type: enum(voc, voc_cluster, finding, survey_finding, manual), required
- source_id: uuid, nullable when source_type=manual
- status: enum(pending_review, approved, rejected, needs_more_evidence, converted), required
- priority: enum(low, medium, high, urgent), nullable
- analytics_area_id: uuid, nullable
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
- Request creation from source objects preserves source context through
  `(finding, task_request, requested_task)`, `(voc, task_request,
  requested_task)`, or `(voc_cluster, task_request, requested_task)`.
- Task Request creation audits the source-specific event:
  `task_request_created_from_finding`, `task_request_created_from_voc`, or
  `task_request_created_from_voc_cluster`.
- Reviewer may be Admin or Developer within the same Managed System scope.
- Self-approval by the same scoped Developer requires explicit `task_request.self_approve` capability.
- Self-approval stores self_approved, reason, source_entity, and managed_system_id audit metadata.
- reviewer_id may be resolved from Managed System defaults.
```

## Task

Owner: Task

```text
tasks
- id: uuid, required
- workspace_id: uuid, required
- primary_managed_system_id: uuid, required
- title: text, required
- status: enum(backlog, todo, doing, review, done, released, reopened), required
- priority: enum(low, medium, high, urgent), required
- assignee_actor_id: uuid, nullable
- due_date: date, nullable
- milestone_id: uuid, nullable, no FK until Milestone domain lands
- analytics_area_id: uuid, nullable
- source_task_request_id: uuid, nullable
- created_by: uuid, required
- created_at: timestamp, required
- updated_at: timestamp, required
```

Rules:

```text
- Converted Task starts in backlog.
- Conversion and Link Existing Task require an approved Task Request.
- Conversion audits task_created_from_request.
- Link Existing Task audits task_linked_to_request.
- Standalone Tasks are valid with source_task_request_id = null.
```

TaskDetailDto extends TaskDto with:

```text
source: null | {
  task_request?: {
    id: uuid
    status: pending_review | approved | rejected | needs_more_evidence | converted
  }
  finding?: {
    id: uuid
    title: string
    summary: string
    evidence_count: number
  }
}
```

Rules:

```text
- source is null for standalone Tasks.
- source.task_request is derived from source_task_request_id.
- source.finding is derived from the active (finding, task_request, requested_task) link.
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
- requested_scope uses managed_system_id for scoped Developer grants in MVP.
- analytics_area_id is not an MVP permission boundary.
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
- Production Task tuples added by ADR-0027:
  - (task_request, task, converted_to)
  - (finding, task, requested_task)
  - (voc, task, evidence_of)
- VOC/cluster Task Request source tuples added by ADR-0028:
  - (voc, task_request, requested_task)
  - (voc_cluster, task_request, requested_task)
- Survey response provenance tuples added by #187:
  - (survey_response, finding, generated_finding)
  - (survey_response, finding, evidence_of)
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
- Released can create a review candidate for Admin or same-scope Developer to write a Public Update.
- Reporter-Facing VOC Status must not expose raw Task Status.
```

## Task Status

Owner: Task

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
- Converted Task starts in Backlog.
- Backlog Task may have an assignee, but execution starts at Todo or Doing.
- Reporter-visible summaries use explicit summary contracts, not raw Task internals.
```

## Rich Content

Owner: Core Platform / surface owner

Rules:

```text
- VOC description, Reporter Reply, Public Update, and Internal Comment use a shared rich content foundation.
- Editor UX is WYSIWYG-first; Markdown or HTML must not be required from users.
- Inline images are stored as uploaded attachments and referenced from rich content.
- Base64 body images and external inline image URLs are not allowed in MVP.
- Rich Table support is spike-gated in MVP; when enabled, tables are stored as rich content nodes.
- Large spreadsheet-like data should be attachments.
```

## VOC Similarity Projection

`similar_count` on every VOC list/detail item is the authorized total of active
same-workspace, same-primary-Managed-System peers, excluding the source VOC.
Detail additionally includes `similar.items`, capped at three and ordered by
`created_at DESC, id DESC`, with `id`, `display_id`, `title`,
`reporter_facing_status`, and nullable `severity`. It is not a second count.

Peer visibility is `voc.read` scope or reporter ownership of that peer. A
triage-only summary envelope includes neither field. See ADR-0031.
