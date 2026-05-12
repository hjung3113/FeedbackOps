# UI / UX Principles

## Purpose

This document defines the shared UI language for FeedbackOps.

System-specific UI details belong in each system document. This document prevents inconsistent UI interpretation across systems.

## Product Inspiration Mix

```text
Linear: 70%
Zendesk / Intercom: 10%
Productboard / Dovetail: 10%
Typeform / SurveyMonkey: 10%
```

## Core UI Sentence

```text
FeedbackOps UI는 Linear처럼 빠르고 밀도 높은 운영 도구를 기본으로 한다.
다만 VOC는 Zendesk / Intercom처럼 고객 업데이트 흐름을 유지하고,
Finding은 Productboard / Dovetail처럼 증거 기반 판단 화면으로 만들며,
Survey는 Typeform / SurveyMonkey처럼 응답에서 실행으로 이어지는 CTA를 중심에 둔다.
```

## Global Layout

```text
Left Sidebar:
- Home / Action Dashboard
- VOC
- VOC Clusters
- Findings
- Task Requests
- Tasks
- Projects
- Surveys
- Product Areas
- Permission Requests

Main Area:
- Inbox
- List
- Board
- Result Summary
- Action Queue

Right Detail Panel:
- selected object core fields
- Evidence
- Linked Entities
- Public Update
- Next Action
```

## Common Interaction Rules

```text
1. All major objects are scanned in List and inspected in Detail Panel.
2. Users should create linked objects without losing current context.
3. Every screen should make the next action clear.
4. Internal status and reporter-facing status are visually separated.
5. Dashboard prioritizes action queues over charts.
6. Good default views matter more than broad configurability.
7. Fast creation is allowed; later enrichment should be easy.
8. Command Menu and contextual actions should use consistent verbs.
```

## System UI Patterns

VOC:

```text
- Inbox style
- quick triage
- internal comment vs public update split
- cluster and finding actions near the source text
```

Finding:

```text
- evidence-first detail page
- highlight list
- impact and confidence near CTA
- execution links visible without scrolling
```

Task:

```text
- Linear-style compact issue detail
- evidence/source panel always visible
- reporter-facing status shown separately from task status
```

Survey:

```text
- simple builder
- readable result summary
- Create Finding / Link Finding / Request Task CTAs
```

Dashboard:

```text
- operational queue
- each row has a next action
- coverage indicators prevent false completeness
```

## UI Action Traceability

Every primary CTA should map to a requirement ID and, when applicable, an
implementation API contract. Endpoint behavior is owned by
`docs/implementation/03-api-contracts.md`.

| UI Action | Requirement | Implementation API Contract |
| --- | --- | --- |
| Create VOC | FOP-VOC-001 | `POST /vocs` |
| Create Finding from VOC | FOP-FIND-001 | `POST /vocs/:id/create-finding` |
| Create Finding from VOC Cluster | FOP-FIND-001 | `POST /voc-clusters/:id/create-finding` |
| Create Finding from Survey Response | FOP-SURVEY-005 | `POST /survey-responses/:id/create-finding` |
| Request Task from Finding | FOP-TASK-001 | `POST /findings/:id/request-task` |
| Create Task from Finding | FOP-FIND-003 | `POST /findings/:id/create-task` |
| Create Milestone from Finding | FOP-FIND-003 | `POST /findings/:id/create-milestone` |
| Approve Permission Request | FOP-PERM-002 | `POST /permission-requests/:id/approve` |
| Reject Permission Request | FOP-PERM-002 | `POST /permission-requests/:id/reject` |

Forbidden UI action:

```text
Survey Response → Create VOC
```

## MVP UI Anti-Patterns

Avoid:

```text
- Jira-level custom workflow UI
- complex permission matrix UI
- advanced survey logic builder
- Help Center / Knowledge Base
- public roadmap / voting portal
- BI dashboard overload
- fully automatic clustering UI
- automatic priority decision UI
- graph UI for every entity link
```

## Design Quality Bar

```text
- Dense but readable
- List-first
- Keyboard-friendly
- Low decoration
- Clear object identity
- Clear source and next action
- Minimal modal disruption
- Detail panel preserves context
```
