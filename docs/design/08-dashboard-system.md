# Dashboard System

## Purpose

Dashboard is an operational queue and coverage surface, not a passive status board.

It shows local system queues, optional integration coverage, and configured follow-up gaps. A missing link is actionable only when a workspace policy, Managed System rule, severity rule, or user-created workflow expects that link.

Home, Dashboard, and Integration are separate action queue-first surfaces:

```text
- Home answers: What can I personally act on now?
- Dashboard answers: Where is this Managed System or workspace operationally stuck?
- Integration answers: Where is source evidence, synthesis, execution, or validation disconnected?
```

Home, Dashboard, and Integration may present the same underlying recovery item,
but they must not create separate lifecycle state for it.

```text
- Home presents only recovery items the current actor can personally act on now.
- Dashboard presents aggregate operational context and representative queues.
- Integration presents detailed evidence/link/workflow recovery queues.
- Shared recovery items use the same recovery_item_id or the same source/action identity.
- Resolving a shared item from any surface removes or updates it everywhere.
- Presentation may differ by surface, but resolution state must not fork.
- User-level snooze or mute is allowed only as presentation state. It must not
  resolve, dismiss, or fork the underlying recovery item.
- Any actor who can see a recovery item may snooze or mute it for their own
  presentation state only. Workspace-wide or Managed-System-wide snooze is out
  of MVP because it changes operational policy rather than personal display.
- Resolved recovery items leave active queues, but open detail panels show a
  resolved state instead of disappearing. Dashboard activity/history preserves
  recently resolved recovery items for three months.
- Dashboard history shows only safe summaries and resolution metadata for
  resolved recovery items. Opening the source object from history re-checks
  current permissions and may hide the source jump or show request-access.
```

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

Missing-link queues show only records where a link or follow-up is expected.
Expected links come from:

```text
- workspace policy
- Managed System policy
- severity rule
- VOC Cluster state such as needs_synthesis
- explicit workflow configuration
- Released Task with unresolved Reporter-facing VOC Status
- poor Outcome Survey with configured follow-up
```

The dashboard must not show every unlinked object as a problem. A VOC without
Finding or Task is not a gap unless one of the expected-link conditions applies.

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

Attaching Survey evidence to an existing VOC is context enrichment, not follow-up
completion. A poor Outcome Survey recovery item is resolved only by an allowed
follow-up decision such as Finding, Task Request, linked execution work, or an
explicit no-follow-up-needed decision.

No-follow-up-needed is an operational decision, not a passive absence of work.
It requires an authorized Admin or same Managed System Developer with the
relevant workflow capability, a required reason, and audit metadata. Reversing
the decision uses a separate reopen-follow-up action and re-evaluates recovery
items; the original decision history is not deleted.

Active Dashboard queues hide recovery items resolved by no-follow-up-needed.
Dashboard history and source object detail show that the gap was resolved by a
no-follow-up decision.

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

Dashboard metrics are supporting signals for action queues, not a free-form BI
analysis surface.

MVP metric scope:

```text
- queue counts
- total vs linked coverage
- Managed System breakdowns
- Analytics Area breakdowns only when data exists
- overdue, blocked, and simple progress counts
```

Out of MVP metric scope:

```text
- drag-and-drop chart builder
- arbitrary dimension/measure pivoting
- custom calculated metrics
- arbitrary SQL or advanced filter builder
- multi-dataset joins for exploration
- saved personal dashboard layouts
- cohort, funnel, retention, or broad product analytics
- export-heavy reporting workflow
```

Chart clicks should navigate to the relevant filtered queue, list, or detail
context. A chart segment may open the corresponding recovery queue and restore a
selected recovery detail panel when the segment maps to a specific recovery
item. MVP charts must not support multi-level analytical drilldown,
chart-to-chart linked brushing, dynamic raw-data exploration, or
permission-sensitive raw data preview inside the chart.

Recovery item clicks open a Dashboard-scoped detail panel first. The panel shows
the recovery reason, safe affected-object summaries, backend-provided next
actions, snooze or mute presentation controls when allowed, and jump actions to
the source object's owning route. It must not inline full VOC, Finding, Task, or
Survey detail that belongs to the source route.

Dashboard may show a summary-safe recovery item even when the actor cannot see
the full source object, as long as the actor has Managed System scope and gap
visibility for that recovery category. In that case source-object summaries,
jump actions, and next actions must each follow backend-provided visibility
states. Hidden source data must not leak through titles, descriptions, reporter
identity, Survey response text, or chart previews.

Dashboard recovery priority, severity, and reason codes are backend-provided.
Frontend clients may group, sort, and visually emphasize provided values, but
must not independently compute operational priority from linked-object counts,
status badges, or chart values.

Dashboard metrics may be cached separately from action queues. Metric responses
must include `computed_at` when values can be stale. Action queues prioritize
current workflow state over metric-cache freshness.

Recovery items do not own separate assignment. Responsibility is derived from
the source object's owner, reviewer, assignee, permission reviewer, or workflow
policy. The backend may return `responsible_actor_hint` for display and
filtering, but the recovery item must not become a second ownership system.

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
- Dashboard is an operational queue control surface, not a general analytics workspace.
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
- Free-form BI analysis
- Complex chart drilldown
- Custom dashboard builder
- Export-heavy analytics
```
