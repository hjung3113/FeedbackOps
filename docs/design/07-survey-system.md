# Survey System

## Purpose

Survey asks internal users questions and collects responses for discovery, validation, or outcome measurement.

Survey Response does not create VOC.

## Boundary

Owns:

```text
- Survey
- Survey Response
- Survey Result
- Survey templates
```

Does not own:

```text
- VOC
- Task backlog
- Permission approval
- Final Finding lifecycle after creation
```

Depends on:

```text
- 01-domain-model.md
- 02-requirements-matrix.md
- 10-cross-system-workflows.md
- 11-entity-linking.md
```

## Survey Types

```text
Discovery Survey:
- 문제 발견용

Validation Survey:
- VOC, 가설, 개선 필요성 검증용

Outcome Survey:
- Task 또는 Milestone 완료 후 개선 효과 확인용
```

## Key Workflows

### WF-SURVEY-001: Survey Local Workflow

```text
Survey
→ Build
→ Collect
→ Responses
→ Survey Result
→ Analyze
```

### WF-SURVEY-002: Optional Survey To Execution

```text
Survey Result
→ optional Evidence Highlights
→ optional Finding
→ optional Task Request
```

### WF-SURVEY-003: Outcome Survey

```text
Task / Milestone Released
→ optional Outcome Survey
→ Result Summary
→ optional Follow-up Finding / Task Request if result is poor and workflow is configured
```

## Functional Requirements

### FR-SURVEY-001: Create Survey

Priority: MUST

Acceptance Criteria:

```text
- Survey Operator can create Discovery, Validation, or Outcome Survey.
- Survey requires exactly one Primary Managed System.
- Survey can link Analytics Area under that Managed System.
- Survey can be created from template.
- Survey supports link distribution.
```

### FR-SURVEY-002: Basic Builder

Priority: MUST

Acceptance Criteria:

```text
- Builder supports single choice, multiple choice, rating, and text.
- Builder supports one-level conditional branch.
- Builder does not require complex logic setup.
```

### FR-SURVEY-003: Store Responses

Priority: MUST

Acceptance Criteria:

```text
- Responses are stored in Survey System.
- Responses are not converted into VOC.
- Personal response visibility follows permission rules.
- The implemented #185 submission path is `POST /surveys/:id/responses`: one
  immutable response per respondent per Survey, enforced by the unique index
  `(survey_id, respondent_actor_id)`.
- The database boundary is INSERT-only for responses and answers; it grants no
  UPDATE or DELETE, and `identity_protected` is propagated from the Survey into
  the submission acknowledgement and stored response.
- #185 exposes no personal-response read surface. Respondents read an open,
  same-Workspace Survey through `GET /surveys/:id/form`, which returns only a
  respondent-safe form DTO.
```

### FR-SURVEY-004: Analyze Results

Priority: MUST

Acceptance Criteria:

```text
- Result screen shows question summary and response distribution.
- Text responses can be highlighted as evidence.
- Results can be filtered by Managed System, segment, or Analytics Area when data exists.
```

### FR-SURVEY-005: Convert Result To Action

Priority: SHOULD

Acceptance Criteria:

```text
- Result screen has Create Finding, Link Finding, and Request Task CTAs when the actor has permission and the workflow is enabled.
- Result and Response screens must not show Create VOC.
- Survey Response can become Evidence Highlight or Finding evidence; it must not become a new VOC.
- Attach to Existing VOC may be allowed only as evidence attachment to an already existing VOC, not as Survey Response to VOC conversion.
- Survey Finding can create Task Request or link execution work.
- Outcome Survey with poor result can create follow-up Finding or Task Request.
- Survey can be used independently without converting results to Finding or Task.
```

## UI / UX Requirements

Survey should borrow Typeform's simple creation feel and SurveyMonkey's result readability, but avoid becoming a full survey platform.

### Survey Result

Survey Result is result summary-first. It is not an action queue surface, even
when follow-up actions are available.

Poor outcome follow-up is selected by backend-provided `next_actions`, not by
frontend heuristics. The screen may highlight a recommended action near the
result summary, but it must still start from result interpretation and must not
turn into a Dashboard-style recovery queue.

`mark_no_follow_up` may appear on a poor Outcome Survey detail or specific
follow-up gap detail when the actor is authorized. It must not appear as a bulk
or top-level action on the aggregate Survey Result overview.

Layout:

```text
- Question Summary
- Response Distribution
- Text Response Highlights
- Filter by Managed System / Segment / Analytics Area
- Add Evidence Highlight CTA
- Create Finding CTA
- Link Finding CTA
- Request Task CTA
- Optional Attach to Existing VOC action when relation is useful and permission allows
```

When an Outcome Survey has poor results or configured follow-up, the most
important next action may be highlighted near the top, but the page still starts
from result interpretation.

Survey Result and Survey Response UI must not include Create VOC. Survey
evidence can support an existing VOC, Finding, Task Request, or Task, but it
does not create a new VOC record.

Use action id `attach_evidence_to_existing_voc` for attaching Survey evidence
to an existing VOC. Do not label this action Create VOC, Convert to VOC, or
Generate VOC from Response.

`attach_evidence_to_existing_voc` may target only an existing VOC in the actor's
effective Managed System scope when the actor can see at least summary-visible
VOC context and policy allows Survey evidence attachment. It must not offer a
create fallback when no eligible VOC is found. Anonymous or identity-protected
Survey responses require a safe summary link that does not reveal respondent
identity.

Anonymous or identity-protected Survey responses may become Evidence Highlights
only through safe summaries by default. Linked VOC, Finding, Task Request, and
Task surfaces must not expose respondent identity, raw free-text response, or
personal response detail unless the actor follows the Survey source route and
has explicit personal response viewing permission.

MVP safe summaries should be deterministic and template-based, not LLM-generated
by default. They may use aggregate counts, configured answer labels, score
bands, selected tags, and approved highlight excerpts after redaction. LLM
summaries may be added later only as an assistive draft after the same
permission and redaction rules have already been applied.

Safe summaries render in the workspace default language or the viewer's UI
locale. Raw free-text responses and approved excerpts remain in their original
language by default; translation is a later assistive draft feature and must not
replace redaction or source-language auditability.

Free-text Survey evidence becomes an Evidence Highlight only after a user
selects or approves the excerpt. Automatic highlight candidates may be shown
when policy allows, but anonymous or identity-protected responses must pass
redaction and explicit approval before the excerpt is attached to another
object.

Survey result filters must preserve anonymity. When a Managed System, segment,
or Analytics Area filter would reduce visible aggregate counts below the
configured anonymity threshold, the UI must hide the aggregate or merge buckets
for actors without personal response viewing permission. MVP default threshold
is 5 responses.

Workspace Admin does not bypass Survey anonymity thresholds by role alone.
Viewing below-threshold personal response detail requires explicit personal
response viewing permission.

## Permissions

```text
- Basic User can answer assigned Survey.
- Survey Operator can create and manage Survey.
- Personal response viewing requires explicit permission.
- Export requires explicit permission.
```

## Cross-System Dependencies

```text
- Survey Result creates Finding, not VOC.
- Survey can validate Task or Milestone.
- Outcome Survey can reveal unresolved user experience after release.
- Survey may optionally link Analytics Area to context inside one Managed System.
```

## Out Of Scope For MVP

```text
- Advanced survey logic builder
- Panel management
- Advanced statistical analysis
- Branding-heavy form editor
```
