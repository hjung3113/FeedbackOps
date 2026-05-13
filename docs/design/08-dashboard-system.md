# Dashboard System

## Purpose

Dashboard is an operational queue and coverage surface, not a passive status board.

It shows local system queues, optional integration coverage, and configured follow-up gaps. A missing link is actionable only when a workspace policy, Managed System rule, severity rule, or user-created workflow expects that link.

## Boundary

Owns:

```text
- System dashboards
- Action queues
- Coverage metrics
- Missing-link visibility
```

Does not own:

```text
- Source object lifecycle
- Entity Link relation registry
- Permission policy
- Workflow state transitions
```

Depends on:

```text
- 01-domain-model.md
- 02-requirements-matrix.md
- 10-cross-system-workflows.md
- 11-entity-linking.md
```

## Dashboard Types

```text
- System Dashboard
- Action Dashboard
- Integrated Coverage Dashboard
```

## System Dashboard

VOC Dashboard:

```text
- 신규 VOC
- 미분류 VOC
- High Severity VOC
- VOC Cluster
- Analytics Area별 VOC
```

Task Dashboard:

```text
- Managed System별 Task
- Milestone 진행률
- 지연 Task
- Blocked Task
- Analytics Area별 Task
```

Survey Dashboard:

```text
- Active Survey
- 응답률
- Low Score Response
- Finding 후보
- Outcome Survey 결과
```

## Action Dashboard

Core queues are policy-driven. The dashboard must distinguish independent-system queues from optional integration recovery queues.

```text
- Unassigned VOC in configured Managed System scope
- High Severity VOC eligible for follow-up and currently unlinked
- VOC Cluster marked "needs synthesis" without Finding
- Finding marked actionable without Task Request or linked Task
- Task Request pending approval
- Survey Finding without Task
- Task without Evidence
- 완료됐지만 고객 상태가 갱신되지 않은 VOC
- Outcome Survey 결과가 나쁜데 configured follow-up이 없는 항목
```

Milestone progress is a Task Dashboard grouping in MVP. Milestone-to-Outcome-Survey gap detection is a future cross-system workflow, not an MVP action queue.

Finding is optional in MVP. High Severity VOC follow-up is considered present
when the VOC has a linked Finding, linked Task Request, linked Task, or an
authorized no-follow-up-needed decision. Missing Finding alone is not a gap
unless workspace policy explicitly requires Finding synthesis for that case.

## Coverage Metrics

Integrated Dashboard must show coverage so users do not mistake partial integration for total system truth.

Example:

```text
전체 VOC: 1,000
Task와 연결된 VOC: 180
Coverage: 18%
```

## Functional Requirements

### FR-DASH-001: Show Action Queues

Priority: MUST

Acceptance Criteria:

```text
- Dashboard shows missing-link queues.
- Dashboard shows local ownership queues such as Unassigned VOC when configured.
- Each queue item has a next action.
- User can navigate to the relevant source object.
- Dashboard must not treat every unlinked record as incomplete.
```

### FR-DASH-002: Show Managed System And Analytics Area Breakdowns

Priority: MUST

Acceptance Criteria:

```text
- VOC, Finding, Task, and Survey metrics can be grouped by Managed System.
- Analytics Area breakdowns appear only when Analytics Area data exists and are nested under or filtered by Managed System.
- Archived Analytics Areas remain visible in historical metrics.
```

### FR-DASH-003: Show Coverage

Priority: SHOULD

Acceptance Criteria:

```text
- Dashboard displays counts for total objects and linked objects.
- Coverage is clearly labeled as partial integration coverage.
```

## UI / UX Requirements

```text
- Prioritize queues over decorative charts.
- Every dashboard row or card should answer: what should the user do next?
- Use compact lists and drill-in detail panels.
- Avoid BI-style chart overload in MVP.
```

## Permissions

```text
- Basic User may see public or allowed dashboard summaries only.
- Admin and same-scope Developer can see operational dashboards.
- Sensitive survey response and task details follow source permissions.
```

## Cross-System Dependencies

```text
- Requires Entity Links to detect linked and expected-but-missing records.
- Requires Reporter-facing status to detect released tasks with unresolved VOC.
- Requires Outcome Survey links to detect missing validation.
- Requires Managed System scope and default owner rules to show ownership queues.
```

## Out Of Scope For MVP

```text
- Executive report generator
- Advanced BI dashboards
- Custom dashboard builder
- Export-heavy analytics
```
