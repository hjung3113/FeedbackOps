# Core Platform

## Purpose

Core Platform provides the shared objects that VOC, Finding, Task, Survey, Dashboard, Permission, and Entity Linking depend on.

It should stay small and stable. Domain-specific behavior belongs in each system document.

## Boundary

Owns:

```text
- Workspace
- User / Actor
- Team
- Managed System Registry
- Analytics Area
- Audit Log baseline
```

Team is a placeholder table only in MVP (ADR-0018): there is no Team CRUD, and `core.teams` rows are operator-populated via migration.

Does not own:

```text
- VOC lifecycle
- Finding judgment
- Task execution workflow
- Survey response analysis
- Permission approval policy
- Entity Link relation registry
```

Depends on:

```text
- 01-domain-model.md
- 02-requirements-matrix.md
```

## Core Concepts

```text
- Workspace
- User / Actor
- Team
- Role / Permission
- Permission Request
- Managed System Registry
- Managed System
- Analytics Area
- Entity Link
- Notification
- Audit Log
```

## Analytics Area

Analytics Area is a managed analytical menu, report group, or business analysis area inside exactly one Managed System. It is used to classify VOC, Task, Survey, and Finding by the part of the analytics system the work concerns.

The FeedbackOps Analytics Area catalog is the MVP source of truth. Analytics Areas may reflect real Tableau, Power BI, Looker, or internal analytics menus, but external BI menus do not own FeedbackOps classification state in MVP.

It does not force sync with:

```text
- actual service menu DB
- URL routing
- code module structure
```

`external_key` is optional reference metadata on the Managed System row, not a sync key (ADR-0017). Analytics Area stores no external reference or URL pattern.

Analytics Area rules:

```text
- Analytics Area belongs to exactly one Managed System.
- Analytics Area is flat under its Managed System; visual grouping is by naming convention (ADR-0017).
- VOC Analytics Area is optional and selectable only under the chosen Primary Managed System.
- Analytics Area is not an MVP permission boundary.
- Analytics Area is a secondary classification, filter, and dashboard grouping below Managed System.
- Analytics Area must not appear as top-level navigation or as a duplicated route tree.
```

## Managed System Scope

Multiple internal analytics programs or managed analytics systems in one workspace are handled by Managed System scope, filters, and default ownership rules inside the same workspace systems.

Managed System scope must not create separate VOC, Survey, Task, Finding, Dashboard, or Entity Link system instances.

Managed System may be used as:

```text
- a global Managed System switcher context
- a list and dashboard filter
- a default owner / reviewer rule
- an optional direct field where the owning system supports it
- Analytics Area grouping context
```

Each Managed System may define default owners and reviewers used as creation and triage defaults across VOC, Survey, Task, and Finding workflows. Defaults prefill the actual owner or reviewer field when no permitted explicit value is provided (only the Survey operator default is built; the rest is deferred, ADR-0059); they do not mean the record is triaged or reviewed. Default resolution can create assigned-but-untriaged or assigned-but-pending-review work, and the value can be changed during the owning workflow.

Project language in older docs is superseded for MVP. If needed later, use Work Initiative for execution grouping instead of scope, permissions, and defaults.

## Notification

Notification is a per-Actor in-app inbox (`core.notifications`, shown in the Home Inbox tab) with an optional email channel per event type. It is not a second audit log: audit history stays in `core.audit_log`.

Dispatch is code-driven. A catalogue in `apps/backend/src/modules/notifications/catalogue.ts` declares the closed event set, recipients, and channels; producers call `notify()` in the same transaction as the mutation. There are no per-Actor notification preferences in MVP. Decision: `docs/adr/0014-notifications-in-app-and-email-channels.md`. Endpoints and producers: `docs/implementation/api/notifications.md`.

## Data Model Draft

Field lists and enums for `core.managed_systems` and `core.analytics_areas` are in `15-data-contracts.md`.

## Functional Requirements

### FR-CORE-001: Workspace Context

Priority: MUST

Description:
All system records belong to a workspace unless explicitly global.

Acceptance Criteria:

```text
- VOC, Finding, Task, Survey, Analytics Area, Permission Request, and Entity Link include workspace_id.
- Users only see workspace-scoped data they are authorized to access.
- Cross-system links cannot connect records across workspaces unless an explicit future integration contract allows it.
- Managed System scope filters data inside a workspace; it does not create separate system instances.
```

### FR-CORE-002: Managed System Registry And Defaults

Priority: MUST

Description:
Admins can create Managed Systems used as operating context across VOC, Survey, Tasks, and Integration.

Acceptance Criteria:

```text
- Managed Systems are managed inside the workspace, not as separate app shells.
- Managed System defaults can resolve VOC owners, Task Request reviewers, and Survey operators. (Only the Survey operator default is built; ADR-0059 D1.)
- Default owner or team may prefill the actual owner field, but does not mean the record is triaged.
- Authorized users can override defaults on individual records.
- Managed System filters are available on managed-system-scoped lists and dashboards.
```

### FR-CORE-003: Analytics Area Catalog

Priority: MUST

Description:
Admins can create and maintain a lightweight Analytics Area catalog.

Acceptance Criteria:

```text
- Analytics Area is flat under its Managed System; there is no parent Analytics Area (ADR-0017).
- Analytics Area belongs to exactly one Managed System.
- Analytics Area can be linked directly from VOC, Finding, Task, and Survey records for the same Managed System.
- Analytics Area can be archived without deleting historical links.
- Analytics Area may reflect real analytics menus, but does not require automatic menu, route, or code-module synchronization in MVP.
- Managed System external_key is optional reference metadata, not a sync contract (ADR-0017).
- Analytics Area owner_team_id is a routing/defaulting hint only; it does not grant access.
- Analytics Area is not used as an MVP permission boundary.
```

### FR-CORE-004: Audit Log Baseline

Priority: MUST

Description:
Sensitive and cross-system actions are recorded.

Acceptance Criteria:

```text
- Permission decisions are audited.
- Entity link creation/removal is audited.
- Reporter-facing status changes are audited.
- Task Request approval/rejection is audited.
```

## UI / UX Requirements

```text
- Managed System management should expose default owners/reviewers and scoped Developers.
- Analytics Area management should use a grouped catalog list and a compact detail panel.
- Analytics Area selection should be searchable from all major object forms after Managed System selection.
- VOC, Finding, Task, and Survey lists may show Analytics Area as a filter or column.
- Detail views show Analytics Area as secondary metadata under Primary Managed System.
- Dashboard breakdowns may group by Analytics Area only within or under Managed System context.
- Archived Analytics Areas remain visible on historical records with archived labeling.
```

## Permissions

See `09-permission-access.md`.

## Cross-System Dependencies

```text
- Managed System Registry is used by VOC, Finding, Task, Survey, Dashboard, and Permission.
- Analytics Area is used by VOC, Finding, Task, Survey, and Dashboard.
- Audit Log is required by Permission Request and Entity Linking.
- Workspace and Actor are required by all systems.
```

## Out Of Scope For MVP

```text
- External analytics menu import or sync
- Project-as-scope registry
- Route discovery
- Code module mapping
- Advanced taxonomy governance
```
