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
- Survey Finding can create Task Request or link execution work.
- Outcome Survey with poor result can create follow-up Finding or Task Request.
- Survey can be used independently without converting results to Finding or Task.
```

## UI / UX Requirements

Survey should borrow Typeform's simple creation feel and SurveyMonkey's result readability, but avoid becoming a full survey platform.

### Survey Result

Layout:

```text
- Question Summary
- Response Distribution
- Text Response Highlights
- Filter by Managed System / Segment / Analytics Area
- Create Finding CTA
- Link Finding CTA
- Request Task CTA
```

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
