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
- Progress notes on that Finding (`docs/adr/0049-finding-task-progress-notes.md`)
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
- source_type: voc / voc_cluster / survey / survey_response / manual
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
- Finding stores source_type and preserves source identity. Under ADR-0064, Survey
  response UUIDs live in Survey-owned protected provenance, with public source_id NULL.
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

### FR-FIND-002A: Manage Finding Status

Priority: MUST

Acceptance Criteria:

```text
- Admin or same-scope Developer with finding.manage can update Finding status.
- Supported transitions are draft -> active, draft -> not_actionable, active -> not_actionable, and not_actionable -> active.
- converted is reserved for the Convert Finding To Task flow and archived is not written; no status command writes either.
- Same-status updates are safe no-ops and return the current Finding.
- Status changes are audited with from/to status and optional reason.
- A successful status change appends one `status_change` progress note in the same transaction. A same-status no-op does not.
```

### FR-FIND-003: Convert Finding To Execution Candidate

Priority: SHOULD

Acceptance Criteria:

```text
- Finding can create Task Request.
- Authorized Admin or same-scope Developer can link existing Task or future execution grouping when appropriate.
- Simple VOC follow-up may bypass Finding and go directly to Task Request.
```

### FR-FIND-004: Progress notes

Priority: MUST

Acceptance Criteria:

```text
- Finding Detail shows an append-only progress-note timeline titled 진행 메모.
- A reader is Admin, or a Developer with finding.read on the Finding's Managed System. A User is denied. The section stays visible and shows a permission-blocked panel.
- A writer needs finding.manage on that Managed System. The composer is only a display hint.
- A person posts a note (TipTap, mentions allowed, no attachments). The client cannot post a status change.
- Notes are not editable or deletable. An archived parent Managed System still lists history and rejects a new note.
- This timeline is not the VOC Internal Comment timeline.
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
- Linked Task Request / Task
- Evidence Highlights
- Primary Managed System
- Affected Analytics Area
- Linked VOC Cluster
- Linked Survey Result
- Progress notes (진행 메모)
```

Primary CTAs:

```text
- Add Evidence
- Link Existing Evidence
- Request Task
- Mark as Not Actionable
```

The linked Task Request row shows its display ID and status when the read
succeeds. While the read is loading, show muted `확인 중…`; on failure, show a
Korean error and `다시 시도`. Show `—` only after a successful empty read. While
the result is unknown, hide the primary execution action and keep secondary
actions available. A successful read with a linked Task makes `Task 열기` the
single primary and keeps `Task 요청` as secondary; a successful empty read makes `Task 요청` primary; a pending
Task Request makes `Task Request 보기` primary and `Task 요청` secondary.

Finding-to-Milestone and Finding-to-Work-Initiative actions are future
cross-system behavior. MVP Finding execution actions are Request Task and Link
Existing Task.

## Permissions

```text
- Reporter cannot read internal Finding details by default.
- Finding progress notes follow FR-FIND-004. Task progress notes are not this gate: they require finding.manage.
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

## Creation responsibility (ADR-0067; implemented by #1090)

VOC-, Cluster-, and Survey-response-derived Findings persist the nullable
Actor/team owner pair in the destination Finding module. `created_by` is provenance,
never implicit ownership. Explicit/null/omitted and MS/AA/fallback resolution follows
ADR-0067 and `09-permission-access.md`; target-system eligibility and source visibility
remain separate gates. Assignment display/edit/filter is source-owned and auditable.

## Survey evidence withdrawal and reuse (ADR-0064)

Accepted target contract; implementation pending #739/#740/#816. The generic
field sketches above are qualified for Survey evidence: public source/binding/text
columns are NULL, while Survey-owned protected extensions retain original source
UUIDs and historical generated text (`15-data-contracts.md`). Generated Survey
Finding title/summary and provider/default summaries contain metadata only.
Fresh authorized exact-active-approval highlight reads supply excerpt text; source
deny or approval revocation omits the quote with safe unavailable local metadata.
VOC/Cluster references, VOC source checks and authored note text remain unchanged.

Survey result readers may reuse only suppression-visible approved excerpts with
target `finding.manage`, without personal-response permission. #816 replaces the
raw response UUID/free quote inputs with scoped Survey selection and approved safe
previews, including empty/suppressed/denied/error/revoked states and submit-time
revalidation. Response-addressed create-Finding keeps its explicit personal gate.
Source/target Managed Systems may differ with independent authorization in one
workspace. UI ownership and endpoint contracts stay in their existing modules.

## Evidence retrieval and picker (ADR-0065)

Integration Evidence (`/integration/evidence`, #1107) is a read-only search inventory of highlights
already stored on readable Findings, not a standalone research inbox. One row
per highlight shows safe source/content state and parent Finding identity; its
primary action opens that Finding. Findings owns the bounded inventory/detail
APIs in `docs/implementation/api/findings.md`. Eligibility precedes search and
pagination; unavailable text and generated summaries never act as hidden matches.
No Unlinked tab, Evidence lifecycle/display ID, execution KPI or duplicate editor.

Finding's Add Evidence Survey branch (implementation pending #816) uses the ADR-0064 candidate/attachment APIs:
select authorized Survey, then approved question/excerpt, then attach server-side.
No raw UUID or editable Survey quote; source changes clear selection, pending
submit disables, retry preserves draft, stale approval allows reselection. Distinguish
no responses, suppressed cohort, no approved excerpts, denied/error/revoked states.
Survey catalog titles stay on that independently authorized surface, not evidence
DTOs. Source/target scope is independent; invalidate Finding and inventory caches
on success and reread fresh content. VOC/note behavior is unchanged. Retrieval
has no mutation or gap-resolution action; execution stays on Finding detail.
