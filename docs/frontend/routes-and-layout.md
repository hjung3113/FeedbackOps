# Routes And Layout

## Purpose

This document defines route, URL state, and layout behavior for the FeedbackOps frontend.

Product UI intent lives in `docs/design/12-ui-ux-principles.md`.
Reusable component contracts live in `docs/frontend/ui-design-system.md`.

## Route Contract

```text
/
/my-work
/vocs?view=triage&triage=unassigned&managedSystem=:managedSystemId|all&selected=:vocId
/vocs?view=inbox&managedSystem=:managedSystemId|all&selected=:vocId
/vocs?view=my&selected=:vocId
/vocs/clusters?selected=:clusterId
/surveys
/surveys/:surveyId
/surveys/:surveyId/results
/tasks?view=my&managedSystem=:managedSystemId|all&selected=:taskId
/tasks?view=inbox&managedSystem=:managedSystemId|all
/tasks?view=requests&status=pending_review&managedSystem=:managedSystemId|all&selected=:requestId
/tasks?view=backlog&managedSystem=:managedSystemId|all&selected=:taskId
/tasks?view=board&managedSystem=:managedSystemId|all&selected=:taskId
/integration
/integration/findings?managedSystem=:managedSystemId|all&selected=:findingId
/integration/evidence?managedSystem=:managedSystemId|all
/integration/coverage?managedSystem=:managedSystemId|all
/integration/links?managedSystem=:managedSystemId|all
/admin/managed-systems
/admin/analytics-areas?selected=:analyticsAreaId
/admin/permissions/requests?selected=:requestId
/admin/settings
```

Route naming rules:

```text
- Home is the user-facing navigation label for `/`.
- Findings, Evidence, Coverage, and Links are Integration routes.
- Task Requests are Tasks intake routes, not top-level routes.
- Analytics Areas and Permission Requests are Admin routes, not top-level work routes.
- Managed Systems are MVP scope, filters, defaults, and dashboard grouping; they do not create per-Managed-System route trees.
- `managedSystem=all` means the actor's effective Managed System scope union. It is workspace-wide only for Admin.
- Work Initiatives may group execution work after triage, but they are not VOC scope owners.
- Work Initiative routes are future routes and are not part of the MVP route contract.
```

## Role Level Navigation Contract

Navigation is Role Level-based display only; backend permission checks remain authoritative.

```text
User:
- Primary nav: Submit VOC, My VOCs, Surveys.
- Hidden by default: Triage, Findings, Task Requests, Tasks, Integration, Admin.
- Home may show only backend-provided user-safe queues.

Developer:
- Primary nav: Home, My Work, VOC Triage, Tasks intake, Tasks, Integration, Surveys when assigned.
- Linked VOC/Finding context appears only as backend-approved summaries.
- Managed System scope controls which work is visible and actionable.

Admin:
- Primary nav includes Admin, Managed System Registry, Analytics Areas, Permission Requests, and settings.
```

Routes may exist without being visible in navigation. Direct route access must restore AppShell and render allowed content, summary-visible content, request-access state, not_found, or permission_denied according to backend response.

## URL State Rules

```text
- List filters, view tabs, sort, and selected object must be representable in URL state.
- VOC, Survey, Task, Integration, and Home views may include `managedSystem=:managedSystemId|all` as URL state.
- For Developers, `all` must query only their effective Managed System scope union. For Users, own-work views should not expose `all` as a workspace-wide choice.
- The global Managed System switcher sets default Managed System context but must not create separate per-Managed-System navigation.
- Managed System filters refine lists and defaults; they do not create separate VOC, Survey, Task, or Integration route trees.
- Desktop selection opens RightDetailPanel without losing list context.
- Mobile selection uses a drill-in route; back returns to the previous list filters.
- Browser refresh on a selected URL restores AppShell, list context, and selected detail when data is accessible.
- Closing a detail panel preserves filters, sort, and scroll position when possible.
- CommandMenu actions must route to the same panel, drawer, or page as visible UI buttons.
```

## Integration And Home Deep Links

Home and Integration next-action links must include:

```text
- source object type
- source object id
- target route
- selected detail object when applicable
- action intent
```

Example:

```text
/vocs?view=triage&triage=high_severity&selected=:vocId&action=create_finding
/integration/findings?selected=:findingId&action=request_task
/tasks?view=board&selected=:taskId&action=review_reporter_status
```

## AppShell Layout

```text
Desktop >= 1024px:
- LeftSidebar: 240px default, 56px collapsed.
- MainRegion: fills remaining width.
- RightDetailPanel: 420px default, 360px min, 520px max.

Tablet 768px-1023px:
- LeftSidebar may collapse by default.
- RightDetailPanel overlays MainRegion when space is limited.

Mobile < 768px:
- LeftSidebar becomes drawer navigation.
- DetailPanel becomes full-screen drill-in.
- Dense tables become stacked ObjectRow layouts.
```

## Scroll Ownership

```text
- AppShell owns viewport height.
- LeftSidebar scrolls independently when needed.
- MainRegion owns list scroll.
- RightDetailPanel owns detail scroll.
- Sticky list toolbars stay inside MainRegion.
- Sticky action footers stay inside the panel or drawer that owns the form.
```

## Creation Surface Rules

```text
- InlineCreatePanel: preferred for single-step linked object creation.
- Drawer: use for multi-step creation while preserving current context.
- Modal: use for confirmation, destructive actions, or short focused tasks.
- Full page: use for complex builders such as Survey Builder.
```
