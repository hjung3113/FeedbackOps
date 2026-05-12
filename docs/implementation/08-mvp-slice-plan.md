# MVP Slice Plan

## Purpose

This plan turns the MVP roadmap into implementation slices that preserve cross-system behavior.

## Slice 0: Project Foundation

```text
- repo structure
- workspace package manager and task runner
- dependency boundary rules
- TypeScript config
- lint/test/build scripts
- backend app shell
- frontend app shell
- shared API type generation path
- database migration runner
```

Foundation decisions:

```text
- Use `apps/frontend` and `apps/backend` as the initial deployable app shells.
- Use `apps/backend/src/modules/*` for product-system backend boundaries.
- Use `apps/frontend/src/features/*` for product-system UI surfaces.
- Use `packages/shared` only for app-neutral API types, schemas, enum constants, and DTO helpers.
- Use `packages/ui` only for reusable UI components and semantic tokens.
- Generated API types must have one owner and one generation direction before feature work depends on them.
```

Exit criteria:

```text
- empty app boots
- health check works
- frontend route shell renders
- test command runs
- boundary checks prevent app imports from `packages/shared` and API calls from `packages/ui`
```

## Slice 1: Workspace, Actor, Permission Baseline

```text
- workspace context
- mock auth mode
- actor roles
- permission check service
- explicit deny model
- permission request skeleton
```

Exit criteria:

```text
- backend can authorize by workspace and actor
- frontend can render allowed/blocked states
```

## Slice 2: Product Area Tree

```text
- core.product_areas
- product area API
- ProductAreaPicker
- archive behavior
```

Exit criteria:

```text
- archived Product Areas remain visible on historical records
```

## Slice 3: VOC Create And Inbox

```text
- create VOC
- VOC list/inbox views
- VOC detail panel
- severity, owner, category, product area
- reporter-facing status
```

Exit criteria:

```text
- Reporter can create VOC
- Manager can triage VOC
- Task status is not shown as reporter-facing status
```

## Slice 4: Entity Links And Evidence

```text
- entity link registry
- provider contract
- visibility enforcement
- Evidence Highlight
- LinkedEntityTrail
```

Exit criteria:

```text
- summary_visible and internal_only behavior tested
- cross-workspace links rejected
```

## Slice 5: Finding From VOC

```text
- create Finding from VOC or VOC Cluster
- evidence highlights
- source preservation
- create_finding entity link
```

Exit criteria:

```text
- Finding shows why it exists
- source link survives reload
```

## Slice 6: Task Request From Finding

```text
- create Task Request
- review queue
- approve/reject/needs_more_evidence
- convert to Task
- audit decisions
```

Exit criteria:

```text
- converted Task preserves source Finding and Evidence links
```

## Slice 7: Action Dashboard

```text
- High Severity VOC without Finding
- VOC Cluster without Finding
- Finding without Task Request
- Task Request pending approval
- Released Task with unresolved reporter-facing VOC status
```

Exit criteria:

```text
- every queue row has next action
- queue resolves after missing link is repaired
```

## Slice 8: Survey To Finding

```text
- Survey creation
- basic builder
- responses
- result summary
- create Finding from Survey Response or Result
```

Exit criteria:

```text
- Survey Response cannot create VOC
- survey evidence preserves source and visibility
```
