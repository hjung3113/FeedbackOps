# FeedbackOps Suite Product Overview

Source: `feedbackops_design_v0.4_consolidated.md`

## Purpose

FeedbackOps Suite is an internal AD-gated operating system that connects submitted VOC, survey results, execution work, and outcome validation without forcing VOC, Task, and Survey into one rigid workflow.

Core sentence:

```text
고객 피드백, 설문 결과, 실행 업무, 개선 효과를 하나의 흐름으로 연결하고 추적하는 FeedbackOps 플랫폼.
```

## Product Positioning

FeedbackOps Suite is not a full replacement for Jira, Linear, Typeform, Zendesk, Productboard, or Dovetail.

It starts with first-party VOC, Task, and Survey systems that are useful on their own, then adds a FeedbackOps Integration Layer for Findings, Evidence, Entity Links, Action Dashboard, and coverage. Integration is the differentiator, but it must not make any independent system feel incomplete when used alone.

MVP access is internal only. Every Actor is AD-authenticated, with Role Level authority ordered as Admin > Developer > User. There is no external customer-contact login in MVP.

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

## Internal General Users

```text
- 사내 AD로 로그인한 일반 사용자
- 기본 Role Level은 User
- Reporter는 특정 VOC를 제출한 Actor를 뜻한다
- VOC 작성, 본인 상태 확인, Survey 응답 중심
```

## System Map

```text
FeedbackOps Suite
├─ Core Platform
├─ VOC System
├─ Task System
├─ Survey System
├─ FeedbackOps Integration Layer
│  ├─ Finding / Insight
│  ├─ Evidence
│  ├─ Entity Linking
│  └─ Action Dashboard / Coverage
├─ Permission / Access System
└─ Admin / Configuration
```

## Key Decisions

```text
1. VOC, Task, Survey는 각각 독립 시스템으로 동작한다.
2. 시스템 간 연결은 필수 흐름이 아니라 선택 기능이다.
3. Survey 응답은 새로운 VOC로 전환하지 않는다.
4. Survey 결과는 Finding, Task Request, Task의 근거가 될 수 있다.
5. VOC와 Survey에서 발견된 문제는 Finding으로 정리할 수 있다.
6. VOC 후속 실행은 Task를 직접 만들지 않고 Task Request를 만든다.
7. Tableau, Power BI, Looker 같은 독립 분석 프로그램은 Managed System이다.
8. MVP 스코프, 필터, 기본값, 권한은 Project가 아니라 Managed System을 기준으로 한다.
9. Dashboard는 단순 현황판이 아니라 Action Dashboard로 설계한다.
10. 사내 AD 연동 후 기본 Role Level은 User로 둔다.
11. 추가 권한은 Permission Request를 통해 요청하고 관리자가 승인한다.
12. 최상위 내비게이션은 Home, My Work, VOC, Surveys, Tasks, Integration, Admin으로 제한한다.
13. Finding, Evidence, Entity Link, Coverage, Action Dashboard는 Integration Layer에 속한다.
14. 한 팀이 여러 Managed System을 관리해도 VOC, Survey, Task 시스템을 Managed System별로 복제하지 않는다.
15. Analytics Area는 하나의 Managed System에 속하며 MVP 권한 경계가 아니다.
16. MVP는 모든 Managed System에 하나의 공유 Workflow Template을 사용한다.
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
- VOC means user/customer voice submitted by an internal AD-authenticated Actor. Do not create VOC from Survey Response.
- Reporter is the Actor who submitted a specific VOC, not a Role Level or external contact.
- VOC, Finding, Task Request, Task, and Survey each require exactly one Primary Managed System in MVP.
- Analytics Area belongs to exactly one Managed System and is optional on VOC.
- Finding is the bridge from evidence to execution.
- Task Request protects the Task backlog from unreviewed execution candidates.
- Task status and Reporter-facing VOC status are separate.
- Dashboard must show configured follow-up gaps and next actions, not only metrics.
- Analytics Area is managed analytics-menu context, not a forced sync with app routes or code modules.
- VOC, Survey, and Task workflows can complete locally without Finding, Dashboard, Evidence, or Entity Links.
- Project is superseded by Managed System for MVP scope and defaults. If Project appears in older design text, read it as a future Work Initiative or execution grouping, not the MVP operating scope.
```

## Optional Integration Pattern

```text
Source Record or Evidence
→ optional Finding / Evidence Highlight
→ optional Task Request / Task link
→ optional Reporter-facing Update
→ optional Outcome Survey
→ optional Follow-up Finding / Task Request when configured
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
