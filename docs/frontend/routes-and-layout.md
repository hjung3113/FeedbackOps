# Routes And Layout

## Purpose

This document defines route, URL state, and layout behavior for the FeedbackOps frontend.

Product UI intent lives in `docs/design/12-ui-ux-principles.md`.
Reusable component contracts live in `docs/frontend/ui-design-system.md`.

## Route Contract

```text
/dashboard
/vocs?view=untriaged&selected=:vocId
/vocs/clusters?selected=:clusterId
/findings?selected=:findingId
/task-requests?view=pending_review&selected=:requestId
/tasks?selected=:taskId
/projects/:projectId
/surveys
/surveys/:surveyId
/surveys/:surveyId/results
/product-areas?selected=:productAreaId
/permission-requests?selected=:requestId
```

## URL State Rules

```text
- List filters, view tabs, sort, and selected object must be representable in URL state.
- Desktop selection opens RightDetailPanel without losing list context.
- Mobile selection uses a drill-in route; back returns to the previous list filters.
- Browser refresh on a selected URL restores AppShell, list context, and selected detail when data is accessible.
- Closing a detail panel preserves filters, sort, and scroll position when possible.
- CommandMenu actions must route to the same panel, drawer, or page as visible UI buttons.
```

## Dashboard Deep Links

Dashboard next-action links must include:

```text
- source object type
- source object id
- target route
- selected detail object when applicable
- action intent
```

Example:

```text
/vocs?view=high_severity&selected=:vocId&action=create_finding
/findings?selected=:findingId&action=request_task
/tasks?selected=:taskId&action=review_reporter_status
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

