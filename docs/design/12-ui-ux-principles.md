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
다만 VOC는 Zendesk / Intercom처럼 triage, ownership, Reporter update 흐름을 유지하고,
Survey는 Typeform / SurveyMonkey처럼 생성, 배포, 응답, 분석 흐름을 제공하며,
Tasks는 Linear / Jira처럼 빠른 실행 관리 화면으로 동작한다.
Finding, Evidence, Entity Links, Coverage, Action Dashboard는 Integration Layer에서 제공한다.
```

## Global Layout

```text
Top-Level Navigation:
- Home
- My Work
- VOC
- Surveys
- Tasks
- Integration
- Admin

Navigation rule:
- VOC Clusters live under VOC.
- Task Requests live under Tasks.
- Findings, Evidence, Coverage, and Links live under Integration.
- Managed Systems, Analytics Areas, Permission Requests, and workspace settings live under Admin.
- Routes may exist without being visible in the user's navigation.

Main Area:
- Inbox
- Triage
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
5. Home and Integration prioritize action queues over charts.
6. Good default views matter more than broad configurability.
7. Fast creation is allowed; later enrichment should be easy.
8. Command Menu and contextual actions should use consistent verbs.
9. Managed System scope is a filter and defaulting context, not a duplicated navigation tree.
10. Navigation is persona-aware; backend permission checks remain authoritative.
```

Rich Content Editor rules:

```text
- VOC description, Reporter Reply, Public Update, and Internal Comment share one WYSIWYG-first editor foundation.
- Markdown or HTML can be internal formats or optional shortcuts, but must not be required from users.
- Surface-specific restrictions control toolbar actions, embeds, and rendering.
- Inline images are uploaded attachments shown inline.
- Base64 body images and external inline image URLs are not allowed in MVP.
- Rich Table support is spike-gated in MVP; large spreadsheets should be attachments.
```

## System UI Patterns

VOC:

```text
- Triage is a primary workspace, not only an Inbox filter
- Unassigned is the first operational failure mode and must be a direct view
- Inbox style for open VOC processing
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
- standalone Tasks are valid without source evidence
- evidence/source panel appears when linked context exists
- reporter-facing status shown separately from task status when linked VOC context exists
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
- missing-link queues are policy-driven, not automatic guilt for every unlinked record
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
| Link Existing Task from Finding | FOP-FIND-003 | `POST /findings/:id/link-task` |
| Create Milestone | FOP-TASK-004 | Task-system grouping |
| Create Work Initiative from Finding | future | future execution grouping |
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
