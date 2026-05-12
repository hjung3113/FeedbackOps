# FeedbackOps Suite Product Overview

Source: `feedbackops_design_v0.4_consolidated.md`

## Purpose

FeedbackOps Suite connects customer feedback, survey results, execution work, and outcome validation without forcing VOC, Task / Project, and Survey into one rigid workflow.

Core sentence:

```text
고객 피드백, 설문 결과, 실행 업무, 개선 효과를 하나의 흐름으로 연결하고 추적하는 FeedbackOps 플랫폼.
```

## Product Positioning

FeedbackOps Suite is not a full replacement for Jira, Linear, Typeform, Zendesk, Productboard, or Dovetail.

It starts with first-party VOC, Task / Project, Survey, Finding, and Dashboard systems, then evolves into a FeedbackOps Layer that can integrate external tools later.

## Primary Users

```text
- PM
- CX / CS Ops Manager
- VOC Manager
- Product Ops
- Workspace Admin
```

## Secondary Users

```text
- Developer
- Survey Operator
- Executive Viewer
- Internal Member
```

## External / General Users

```text
- 사내 AD로 로그인한 일반 사용자
- 기본 권한은 User / Reporter
- VOC 작성, 본인 상태 확인, Survey 응답 중심
```

## System Map

```text
FeedbackOps Suite
├─ Core Platform
├─ VOC System
├─ Finding / Insight System
├─ Task / Project System
├─ Survey System
├─ Dashboard System
├─ Permission / Access System
└─ Entity Linking / Cross-System Workflow
```

## Key Decisions

```text
1. VOC, Task / Project, Survey는 각각 독립 시스템으로 동작한다.
2. 시스템 간 연결은 필수 흐름이 아니라 선택 기능이다.
3. Survey 응답은 새로운 VOC로 전환하지 않는다.
4. Survey 결과는 Finding, Task Request, Task, Milestone의 근거가 된다.
5. VOC와 Survey에서 발견된 문제는 Finding으로 정리할 수 있다.
6. Task 생성은 assign 시점에 팝업으로 결정할 수 있다.
7. Project 하위에는 Product Area / Menu Tree를 둘 수 있다.
8. Product Area는 실제 시스템 메뉴와 강제 연동하지 않는다.
9. Dashboard는 단순 현황판이 아니라 Action Dashboard로 설계한다.
10. 사내 AD 연동 후 기본 권한은 User / Reporter 수준으로 둔다.
11. 추가 권한은 Permission Request를 통해 요청하고 관리자가 승인한다.
```

## Reading Order For AI Implementation

Implementation agents should read these required documents in order:

```text
1. docs/README.md
2. 00-product-overview.md
3. 01-domain-model.md
4. 02-requirements-matrix.md
5. 10-cross-system-workflows.md
6. 11-entity-linking.md
7. 12-ui-ux-principles.md
8. docs/frontend/README.md
9. docs/implementation/README.md
10. The target system document
11. 09-permission-access.md
12. 13-mvp-roadmap.md
```

Reference and draft documents:

```text
- DESIGN.md: visual token seed only; not a component or route contract.
- 15-data-contracts.md: design-level data vocabulary until superseded by migrations.
- 14-api-draft.md: historical API design input; not implementation authority.
```

Implementation-facing decisions live in `docs/implementation`.
Frontend route, component, and interaction contracts live in `docs/frontend`.

## Non-Negotiable Interpretation Rules

```text
- VOC means customer/user-submitted voice. Do not create VOC from Survey Response.
- Finding is the bridge from evidence to execution.
- Task Request protects the Task backlog from unreviewed execution candidates.
- Task status and Reporter-facing VOC status are separate.
- Dashboard must show missing links and next actions, not only metrics.
- Product Area is an internal context object, not a forced sync with product routes or code modules.
```

## Canonical Cross-System Flow

```text
Evidence
→ Finding
→ Task Request
→ Task / Milestone
→ Reporter-facing Update
→ Outcome Survey
→ Follow-up Finding / Task Request when needed
```

See also:

```text
- 01-domain-model.md
- 02-requirements-matrix.md
- 10-cross-system-workflows.md
- 11-entity-linking.md
- 12-ui-ux-principles.md
- 15-data-contracts.md
```
