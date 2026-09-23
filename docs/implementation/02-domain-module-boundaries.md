# Domain Module Boundaries

## Module Ownership

These modules are bounded product-system implementations inside
`apps/backend/src/modules/*`. They are not separate deployable services in the
MVP architecture.

## Logical Domains → Backend Module Directories

The following directories are the server-registered module surfaces (with
`core` also providing shared services used during server assembly):

| Logical domain | Actual module directory |
| --- | --- |
| Analytics Area | `apps/backend/src/modules/analytics-areas` |
| Attachments | `apps/backend/src/modules/attachments` |
| Authentication | `apps/backend/src/modules/auth` |
| Core services | `apps/backend/src/modules/core` |
| Dashboard | `apps/backend/src/modules/dashboard` |
| Entity Linking | `apps/backend/src/modules/entity-links` |
| Finding | `apps/backend/src/modules/findings` |
| Managed System Registry | `apps/backend/src/modules/managed-systems` |
| Navigation | `apps/backend/src/modules/nav` |
| Permission | `apps/backend/src/modules/permissions` |
| Saved Views | `apps/backend/src/modules/saved-views` |
| Survey | `apps/backend/src/modules/surveys` |
| Task Request | `apps/backend/src/modules/task-requests` |
| Task | `apps/backend/src/modules/tasks` |
| VOC | `apps/backend/src/modules/voc` |
| VOC Recommendations | `apps/backend/src/modules/voc/recommendations` |
| Pre-submit VOC Peers | `apps/backend/src/modules/voc/pre-submit-peers` |
| VOC Cluster | `apps/backend/src/modules/voc-clusters` |
| Workspace Settings | `apps/backend/src/modules/workspace-settings` |

```text
VOC owns:
- VOC
- VOC Cluster
- reporter-facing VOC status
- public updates

Finding owns:
- Finding
- Evidence Highlight
- Finding comments

Task owns:
- Task Request
- Task
- Milestone as lightweight Task grouping
- Work Initiative / Project execution grouping when introduced after MVP
- internal task status

Survey owns:
- Survey
- Survey Response
- Survey Result

Core owns:
- Workspace
- Actor
- Role Level
- Team
- Managed System Registry
- Customer / Account reference data only if explicitly retained by data contracts
- Contact reference data only if explicitly retained by data contracts; never Reporter identity
- Analytics Area
- Attachment governance and storage interfaces when shared across modules
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

Authentication owns:
- AuthProvider seam (mock and OIDC)
- server-side session issue and revoke
- first-login Actor auto-provisioning
Actor records and Role Level stay Core-owned. Permission decisions stay Permission-owned.

Attachments owns:
- the shared attachment storage seam and its upload/download commands
- filename and MIME allowlist
This is the implementation of Core's attachment-governance bullet, not a second owner. Other modules reference attachments; they do not own the storage seam.

Navigation owns:
- the read-only sidebar badge-count aggregation
Navigation does not own Dashboard action queues, domain records, or navigation layout.

Saved Views owns:
- an actor's named list filters for the voc, tasks, task_requests, and findings surfaces
Saved Views does not own the list queries those filters apply to.

Workspace Settings owns:
- workspace-level policy storage and its admin-only API
Consumers read the barrel seam (`getResolvedWorkspaceSettings`, `getResolvedWorkspaceSettingsForUpdate`). Policy behavior stays in the consuming module.
```

The fence above is ownership. The table above it is the directory. They differ where a domain is implemented outside the owner's folder: Core's Managed System Registry, Analytics Area, and attachment governance live in `managed-systems/`, `analytics-areas/`, and `attachments/`; VOC's clusters, recommendations, and pre-submit peers live in `voc-clusters/` and under `voc/recommendations/` and `voc/pre-submit-peers/`; Task's Task Request lives in `task-requests/`. Authentication, Navigation, Saved Views, and Workspace Settings match in both places.

## Cross-Module Access Rules

```text
- A module may write only its owned tables.
- A module may expose application commands and read interfaces to other modules.
- Cross-system optional relationships use entity_links unless a direct foreign key is explicitly approved.
- Direct cross-system columns such as linked_task_id or converted_task_id are convenience projections, not canonical history.
- Dashboard must not mutate source records directly.
- A row-lock helper is exported by the module that owns the row, from that module's public barrel (`index.ts`). Callers do not import another module's `repo.ts` to lock its rows.
- `lockManagedSystem` is exported from `managed-systems/index.ts`. `lockAnalyticsArea` is exported from `analytics-areas/index.ts`. VOC keeps `selectVocForUpdate` for its own rows.
```

M7 (cycle-1 review) rejected selecting `core.managed_systems` from inside the VOC repo. The approved read of non-archived Managed System ids for a workspace is `allManagedSystemIds`. That function moved from `core/managed-systems/read-projections.ts` to `managed-systems/read-projections.ts` (#462); the core file is gone. Foreign modules still must not select the table themselves. Callers import `managed-systems/read-projections.ts` directly. The function is not on the `managed-systems` barrel: that barrel loads `managed-system-service.ts`, and `permissions/check-service.ts` importing the barrel cycles. Do not re-export it from the barrel unless that cycle is removed first.

### Approved cross-module surfaces

Another module is reached only through one of these:

- the target's application command, or a cross-system orchestration service named in `docs/implementation/00-architecture.md`
- an approved read projection or read service (`read-projections.ts`, `read-service.ts`, a module list predicate)
- an `authorization.ts` module
- a symbol the owner exports from its public barrel (`index.ts`)

Importing another module's `repo.ts` or `repo-read.ts` is not a surface. A module reading its own repo, including `voc/jobs` reading `voc/embedding/repo.ts`, is internal.

These imports are read surfaces, not repo bypasses, and the future repo-import lint must leave them alone: Surveys importing `findings/authorization.ts`; Dashboard importing `findings/authorization.ts`, `surveys/authorization.ts`, and `voc/read-service.ts`.

Wrapping the remaining cross-module `repo.js` imports, and adding the `check-boundaries.mjs` rule that fails closed on them, is #480. This document does not list those call sites. #480 re-measures them. `allManagedSystemIds` stays a direct `read-projections.ts` import until the barrel cycle above is gone.

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
- Role Level vocabulary and actor role assignment
- Managed System Registry and default owner/reviewer inputs
- Analytics Area tree, with each Analytics Area belonging to one Managed System
- shared attachment governance
- Audit log append API
- shared identifiers and base types
```

Core must not treat Analytics Area as an MVP authorization boundary. Analytics Area
can influence classification, routing hints, and defaults inside its Managed
System, but backend capability checks remain workspace-level for Admins or
Managed-System scoped for Developers.

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
- apps/frontend/src/features/{home,my-work,voc,findings,voc-cluster,surveys,tasks,integration,admin} own route and screen composition.
- Evidence, Coverage, and Links are Integration feature surfaces. Findings is its own feature surface (features/findings/).
- Finding detail composes `FindingDetailPanel` → `FullFindingDetail` → `useFindingDetailController` under `apps/frontend/src/features/findings`; shared UI and hooks are under `apps/frontend/src/features/cross-system` and `apps/frontend/src/lib/cross-system`.
- Analytics Areas, Permission Requests, Managed System Registry, and settings are Admin feature surfaces.
- Frontend features represent UI surfaces for product systems; they do not own domain rules or writes.
- Feature screens compose UI primitives and call typed API hooks.
- Frontend permission states are display hints only.
- LinkedEntityTrail renders permission-limited nodes from backend-provided summaries.
```

`voc-cluster` is a VOC-owned subdomain assembled as a sibling feature folder
(screens under `src/features/voc-cluster/`, with route files under
`src/routes/_authed/voc-clusters/` doing URL/shell wiring only), not a new
top-level product domain.
