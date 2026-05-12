# Dashboard System

## Purpose

Dashboard is an Action Dashboard, not a passive status board.

It shows connected data and, more importantly, important data that should be connected but is not.

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
- Product Area별 VOC
```

Task / Project Dashboard:

```text
- Project 진행률
- Milestone 진행률
- 지연 Task
- Blocked Task
- Product Area별 Task
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

Core queues:

```text
- Task로 전환되지 않은 High Severity VOC
- VOC Cluster without Finding
- Finding without Task Request
- Task Request pending approval
- Survey Finding without Task
- Task without Evidence
- Milestone without Outcome Survey
- 완료됐지만 고객 상태가 갱신되지 않은 VOC
- Outcome Survey 결과가 나쁜데 후속 Task가 없는 항목
```

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
- Each queue item has a next action.
- User can navigate to the relevant source object.
```

### FR-DASH-002: Show Product Area Breakdowns

Priority: MUST

Acceptance Criteria:

```text
- VOC, Finding, Task, and Survey metrics can be grouped by Product Area.
- Archived Product Areas remain visible in historical metrics.
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
- Manager / PM can see operational dashboards.
- Sensitive customer, survey response, and task details follow source permissions.
```

## Cross-System Dependencies

```text
- Requires Entity Links to detect linked and unlinked records.
- Requires Reporter-facing status to detect released tasks with unresolved VOC.
- Requires Outcome Survey links to detect missing validation.
```

## Out Of Scope For MVP

```text
- Executive report generator
- Advanced BI dashboards
- Custom dashboard builder
- Export-heavy analytics
```
