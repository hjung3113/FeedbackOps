# MVP Slice Plan

## Purpose

This plan turns the MVP roadmap into implementation slices that preserve cross-system behavior.

## Slice 0: Product Foundation

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
- Actor and Role Level model
- Managed System Permission Scope model
- permission check service
- explicit deny model
- permission request skeleton
```

Exit criteria:

```text
- backend can authorize by workspace, actor, role level, and managed system scope
- frontend can render allowed/blocked states
```

## Slice 2: Managed System Registry And Analytics Area Catalog

```text
- core.managed_systems
- core.analytics_areas
- managed system API
- analytics area API
- AnalyticsAreaPicker
- ManagedSystemPicker
- grouped Analytics Area admin list with optional parent selector
- archive behavior
```

Exit criteria:

```text
- Managed Systems drive scope filters, defaults, and Developer permission grants
- each Analytics Area belongs to exactly one Managed System
- archived Analytics Areas remain visible on historical records
```

## Slice 3: VOC Create And Inbox

```text
- create VOC
- VOC list/inbox views
- VOC detail panel
- managed_system_id, owner/default owner, source_context, analytics area
- triage-assigned severity
- reporter-facing status
- rich content description and attachment references
```

Exit criteria:

```text
- Reporter can create VOC
- VOC create requires managed_system_id
- Reporter create cannot set severity
- analytics_area_id must belong to managed_system_id when provided
- Reporter can edit title, description, and attachments only before triage
- Admin or same-Managed-System Developer can triage VOC
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
- VOC Cluster create, add/remove membership, and confirm
- evidence highlights
- source preservation
- create_finding entity link
```

Exit criteria:

```text
- Finding shows why it exists
- source link survives reload
```

## Slice 6: Task Request Review And Conversion

```text
- create Task Request from VOC or Finding
- review queue
- approve/reject/needs_more_evidence
- convert to Task
- audit decisions
```

Exit criteria:

```text
- converted Task preserves source Finding and Evidence links
- VOC follow-up creates Task Request, not Task directly
- Admin or same-Managed-System Developer can review Task Requests
- same-scope Developer self-approval requires explicit capability, reason, and audit metadata
- converted Task starts in Backlog and may have an assignee
```

## Slice 7: Action Dashboard

```text
- Unassigned VOC in configured Managed System scope
- High Severity VOC eligible for follow-up and currently lacks Finding, Task Request, Task link, or authorized no-follow-up-needed decision
- VOC Cluster marked "needs synthesis" without Finding
- Finding marked actionable without Task Request or linked Task
- Task Request pending approval
- Released Task with unresolved reporter-facing VOC status
```

Exit criteria:

```text
- every queue row has next action
- queue resolves after missing link is repaired
```

## Slice 7a: VOC Public Conversation

```text
- Public Update by Admin or same-Managed-System Developer
- Reporter Reply by Reporter on own VOC
- Internal Comment private to authorized operators
- Reporter Summary safe contract for linked work
```

Exit criteria:

```text
- Public Update, Reporter Reply, and Internal Comment cannot leak across visibility boundaries
- conversation entries are append-only and split into public and internal timelines
- Reporter Summary excludes raw task status, priority, internal comments, dev names, internal due dates, root-cause detail, severity, and confidence
- Released Task creates reporter-facing review candidate only
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
