# Domain Module Boundaries

## Module Ownership

These modules are bounded product-system implementations inside
`apps/backend/src/modules/*`. They are not separate deployable services in the
MVP architecture.

```text
VOC owns:
- VOC
- VOC Cluster
- reporter-facing VOC status
- public updates

Finding owns:
- Finding
- Evidence Highlight

Task / Project owns:
- Task Request
- Task
- Project
- Milestone
- internal task status

Survey owns:
- Survey
- Survey Response
- Survey Result

Core owns:
- Workspace
- Actor
- Team
- Customer / Account
- Contact
- Product Area
- Audit Log

Permission owns:
- Permission Request
- permission decisions
- explicit deny handling

Entity Linking owns:
- relation registry
- link creation
- link visibility enforcement

Dashboard owns:
- action queues
- coverage projections
- missing-link projections
```

## Cross-Module Access Rules

```text
- A module may write only its owned tables.
- A module may expose application commands and read interfaces to other modules.
- Cross-system optional relationships use entity_links unless a direct foreign key is explicitly approved.
- Direct cross-system columns such as linked_task_id or converted_task_id are convenience projections, not canonical history.
- Dashboard must not mutate source records directly.
```

## Core Boundary

Core is intentionally small.

Forbidden:

```text
- Core importing VOC, Finding, Task, Survey, Dashboard, or frontend modules.
- Core owning lifecycle rules for domain objects.
- Core deciding reporter-facing VOC status.
```

Allowed:

```text
- Workspace and actor context
- Product Area tree
- Audit log append API
- shared identifiers and base types
```

## Entity Link Provider Contract

Each linkable domain module must register a provider:

```text
entity_type
assertExists(id, workspace_id)
getPermissionSubject(id)
getReporterSummary(id)
getInternalSummary(id)
listExpectedLinks(id) when needed by Dashboard
```

Entity Linking uses providers to enforce:

```text
- workspace match
- source and target existence
- source and target permissions
- summary_visible contracts
- dashboard missing-link queries
```

## Frontend Boundary Rules

```text
- packages/ui implements reusable visual and interaction primitives.
- apps/frontend/src/features/{voc,findings,tasks,surveys,dashboard,permissions,product-areas} own route and screen composition.
- Frontend features represent UI surfaces for product systems; they do not own domain rules or writes.
- Feature screens compose UI primitives and call typed API hooks.
- Frontend permission states are display hints only.
- LinkedEntityTrail renders permission-limited nodes from backend-provided summaries.
```
