# Core Platform

## Purpose

Core Platform provides the shared objects that VOC, Finding, Task / Project, Survey, Dashboard, Permission, and Entity Linking depend on.

It should stay small and stable. Domain-specific behavior belongs in each system document.

## Boundary

Owns:

```text
- Workspace
- User / Actor
- Team
- Customer / Account
- Contact
- Product Area / Menu Tree
- Audit Log baseline
```

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
- Organization
- Workspace
- User / Actor
- Team
- Role / Permission
- Permission Request
- Customer / Account
- Contact
- Project Registry
- Product Area / Menu Tree
- Entity Link
- Taxonomy / Tag
- Notification
- Audit Log
```

## Product Area / Menu Tree

Product Area is an internal context object used to classify VOC, Task, Survey, and Finding by product structure.

It does not force sync with:

```text
- actual service menu DB
- URL routing
- code module structure
```

It may optionally store:

```text
- external_key
- url_pattern
```

## Data Model Draft

```text
core.product_areas
- id
- workspace_id
- project_id nullable
- parent_id nullable
- name
- description
- owner_team_id nullable
- status
- sort_order
- external_key nullable
- url_pattern nullable
- created_at
- updated_at
```

## Functional Requirements

### FR-CORE-001: Workspace Context

Priority: MUST

Description:
All system records belong to a workspace unless explicitly global.

Acceptance Criteria:

```text
- VOC, Finding, Task, Survey, Product Area, Permission Request, and Entity Link include workspace_id.
- Users only see workspace-scoped data they are authorized to access.
- Cross-system links cannot connect records across workspaces unless an explicit future integration contract allows it.
```

### FR-CORE-002: Product Area Tree

Priority: MUST

Description:
Admins can create and maintain a lightweight Product Area / Menu Tree.

Acceptance Criteria:

```text
- Product Area supports parent-child hierarchy.
- Product Area can be linked directly from VOC, Finding, Task, Survey, and Project.
- Product Area can be archived without deleting historical links.
- Product Area does not require real menu, route, or code-module synchronization.
```

### FR-CORE-003: Audit Log Baseline

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
- Product Area management should use a tree view and a compact detail panel.
- Product Area selection should be searchable from all major object forms.
- Archived Product Areas remain visible on historical records with archived labeling.
```

## Permissions

See `09-permission-access.md`.

## Cross-System Dependencies

```text
- Product Area is used by VOC, Finding, Task / Project, Survey, and Dashboard.
- Audit Log is required by Permission Request and Entity Linking.
- Workspace and Actor are required by all systems.
```

## Out Of Scope For MVP

```text
- External product menu sync
- Route discovery
- Code module mapping
- Advanced taxonomy governance
```
