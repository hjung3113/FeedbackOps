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
| Milestones | `apps/backend/src/modules/milestones` |
| Navigation | `apps/backend/src/modules/nav` |
| Notifications | `apps/backend/src/modules/notifications` |
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
- Notification concept and shared notification storage contract
- Attachment governance and storage interfaces when shared across modules
- Audit Log

Permission owns:
- Permission Request
- permission decisions
- explicit deny handling
- governed direct capability grants and supported scope policy; no Role Level promotion (ADR-0066, implemented #1085)
- selected request detail and explained risk, using authorized source projections

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
VOC owns the read projections of its own attachment links (`selectVocAttachments`,
`selectAttachmentsForComments` in `voc/repo-read.ts`); Attachments does not provide a read projection for them.

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

The fence above is ownership. The table above it is the directory. They differ where a domain is implemented outside the owner's folder: Core's Managed System Registry, Analytics Area, and attachment governance live in `managed-systems/`, `analytics-areas/`, and `attachments/`; VOC's clusters, recommendations, and pre-submit peers live in `voc-clusters/` and under `voc/recommendations/` and `voc/pre-submit-peers/`; Task's Task Request lives in `task-requests/` and its Milestone in `milestones/`. Authentication, Navigation, Saved Views, and Workspace Settings match in both places.

Core owns the Notification concept and shared storage contract. The
`modules/notifications` directory owns its catalogue, dispatch, delivery job,
and actor-scoped in-app read model; it does not own domain event production.

## Cross-Module Access Rules

```text
- A module may write only its owned tables.
- A module may expose application commands and read interfaces to other modules.
- Cross-system optional relationships use entity_links unless a direct foreign key is explicitly approved.
- Direct cross-system columns such as linked_task_id or converted_task_id are convenience projections, not canonical history.
- Dashboard must not mutate source records directly.
- A row-lock helper is exported by the module that owns the row, from that module's public barrel (`index.ts`). Callers do not import another module's `repo.ts` to lock its rows.
- `lockManagedSystem` is exported from `managed-systems/index.ts`. `lockAnalyticsArea` is exported from `analytics-areas/index.ts`. VOC keeps `selectVocForUpdate` for its own rows.
- `assertActiveAnalyticsAreaForManagedSystem` (lock + exists/scope/archived check) is exported from `analytics-areas/index.ts`; callers do not repeat the check.
```

M7 (cycle-1 review) rejected selecting `core.managed_systems` from inside the VOC repo. The approved read of non-archived Managed System ids for a workspace is `allManagedSystemIds`. That function moved from `core/managed-systems/read-projections.ts` to `managed-systems/read-projections.ts` (#462); the core file is gone. Foreign modules still must not select the table themselves. Callers import `managed-systems/read-projections.ts` directly. The function is not on the `managed-systems` barrel: that barrel loads `managed-system-service.ts`, and `permissions/check-service.ts` importing the barrel cycles. Do not re-export it from the barrel unless that cycle is removed first.

The same read-projections file owns the approved `managedSystemExists` and `allManagedSystemWorkspacePairs` reads. Foreign modules import these reads directly rather than selecting `core.managed_systems`; they are not re-exported from the barrel.

### Approved cross-module surfaces

Another module is reached only through one of these:

- the target's application command, or a cross-system orchestration service named in `docs/implementation/00-architecture.md`
- an approved read projection or read service (`read-projections.ts`, `read-service.ts`, a module list predicate)
- an `authorization.ts` module
- a symbol the owner exports from its public barrel (`index.ts`)

Importing another module's `repo.ts` or `repo-read.ts` is not a surface. A module reading its own repo, including `voc/jobs` reading `voc/embedding/repo.ts`, is internal.

These imports are read surfaces, not repo bypasses, and the repo-import lint must leave them alone: Surveys importing `findings/authorization.ts`; Dashboard importing `findings/authorization.ts`, `surveys/authorization.ts`, and the VOC barrel's reader contract types (`voc/read-contract.ts`).

Wrapping the cross-module `repo.js` imports and adding the `check-boundaries.mjs` rule was #480. `scripts/check-boundaries.mjs` header rule 6 (`kind: 'cross-module-repo-import'`) now rejects any import of a foreign module's `repo*.js` and fails closed with no baseline. This document does not list those call sites. `allManagedSystemIds` stays a direct `read-projections.ts` import until the barrel cycle above is gone. Rule 7 (`outside-voc-imports-voc-jobs`, #517) rejects imports of `modules/voc/jobs/*` from outside VOC; reach job behavior through the VOC barrel (`enqueueReleasedTaskReviewCandidates`, `registerVocJobs`). Rule 9 (`foreign-test-seed-helpers`, #517, widened in #574) rejects any import of another module's `__tests__/_seed-helpers`; helpers shared across modules live in `src/test-support`.

When adding or changing a checker rule, add a focused fixture case in `scripts/check-boundaries.test.mjs` for that rule; run it with `node scripts/check-boundaries.test.mjs` because `pnpm check:boundaries` runs only the checker. Rule 10 rejects raw SQL references to `core.managed_systems` and `core.analytics_areas`, and imports of the owner tables' Drizzle symbols (`managedSystems`, `analyticsAreas` from `db/schema/core`), outside their owner modules; tests and migrations are excluded, and `src/test-support` is also barred from importing those symbols.

### VOC detail follow-up read (#1225)

VOC owns `read-projections.ts:vocFollowUpRootsSql`, the canonical presence-root
SQL shared by list/count/grouped-count and Entity Links' detail reader.
VOC Clusters owns `read-projections.ts:readVocClusterMemberships` for provenance.
Entity Links' `readVocFollowUp` composes those approved projections with its own
canonical links and registered providers, using the supplied transaction for
post-write hydration. It serializes each disclosed edge using the existing
visibility evaluator; its command-only Cluster evidence edge does not expand
the generic Entity Links list/create registry. No cross-module write is added.

### Transactional recovery projection seams (56-H)

Dashboard's `recorder.ts` exports a type-only injected transaction interface; source factories
capture independent owner truth before mutation and finalize it after all owner/link writes
inside the idempotency miss path. `truth.ts` composes leaf `recovery-read.ts` predicates from
VOC, Findings, Tasks, Permissions and Surveys, Entity Linking's `readRecoveryDependencies`,
and VOC Clusters' `readClusterRecoveryMembers`. It never imports a source command factory
through a runtime barrel or enforces the acting Actor's disclosure scope as transition truth.

Recovery writers first acquire the transaction-scoped workspace advisory lock via
`db/recovery-command-lock.ts` (`hashtextextended('recovery-command:' || workspaceId, 0)`),
before idempotency, owner row, response or recovery identity locks. This includes source/status
commands, ordinary link create/detach, Task Request creation, Cluster conversions/link/unlink,
private Survey outcome commands, approved-excerpt attachment and discovery/reconciliation. It also covers VOC
creation, saved-recommendation confirmation, Permission Request creation and each per-VOC transaction of a Cluster bulk public update.
Nested recorder seams call `requireRecoveryCommandLock`, which fails the test run when the owning
command reached the recorder without holding the lock; production still acquires it.
Under that serialization, owner Finding locks precede expanded Finding rows (sorted UUIDs),
then bound response advisory locks (sorted UUIDs), then recovery identities. Response-addressed
Survey commands can lock their response before inserting a new Finding; they hold the same
workspace lock first. Findings' leaf `lockFindingRecoverySubjects` owns expanded row locking;
Survey's `readSurveyRecoveryDependencies` applies it before locking bound responses and returns
only Survey IDs. Captures may reacquire the workspace lock inside the same transaction.
Read paths never acquire it. Recovery writers in one workspace serialize until commit/rollback,
a deliberate throughput tradeoff for the single-workspace MVP (~5k VOCs/5k Tasks over five years).
Capture remains before domain mutation and finish after the last link write;
response IDs stay inside Survey.
`surveys/recovery-presentation.ts` owns the private response recorder/reconciler and personal
queue/presentation/history adapter. Findings' response-derived creation and status commands
use that transactional seam; public payloads still require the existing explicit personal gate.
The private reconciler returns only a continuation cursor internally, never a generic response
payload. Recorder writes are limited to the owner's recovery projection tables; domain links,
source audits, decisions and permissions retain their existing owners.

### Evidence inventory source projections (#1106)

Findings composes its own parent/highlight reader with Survey's
`resolveInventorySurveyHighlights` in `surveys/evidence-access.ts` and VOC's
public `readVocEvidenceSources` export. Each hydration batch contains at most 100
local highlights, authorizes its parents and sources in one transaction, and
ends before the next batch. Survey's owner-backed
`read_inventory_highlight_evidence(uuid,uuid[])` locks all batch response UUIDs
in sorted order and refreshes the approval snapshot after lock waits. Finding
summaries and private bindings never enter the inventory read model. Existing
nested readers and attachment commands retain their contracts.

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
- Notification concept and shared notification storage contract
- shared identifiers and base types
```

Core must not treat Analytics Area as an MVP authorization boundary. Analytics Area
can influence classification, routing hints, and defaults inside its Managed
System, but backend capability checks remain workspace-level for Admins or
Managed-System scoped for Developers.

## Entity Link Provider Contract

Each linkable domain module must register a provider. The provider contract lives in `06-entity-linking-contract.md` (Provider Interface) and `apps/backend/src/modules/entity-links/provider-types.ts`.

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
- apps/frontend/src/features/{home,my-work,voc,findings,voc-cluster,surveys,tasks,cross-system,integration,admin} own route and screen composition.
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

## Permission close-out seams (ADR-0066; #1080 / #1081 / #1085)

Permission writes only its requests/grants/denies. Approval and direct grant share
a Permission-owned grant command. Auth extends its workspace Actor lookup with
an approved recipient lock, exported through its public API; Core owns the latest
Admin-question audit projection, and Workspace Settings supplies the locked policy.
Permission may compose those projections but does not copy foreign-table queries
or mutate Role Level. Source-owner summary authorization remains mandatory.
Home owns requester UI composition; Admin owns review/direct-grant composition.
Shared typed contracts carry server scope options/revisions/risk; neither frontend
nor packages/ui owns permission truth or computes risk scores.

Selected Permission context (#1081) uses Auth's public
`findWorkspaceActorDisplay` projection and Core's
`latestPermissionRequestQuestion` audit projection after authorization.
VOC and Task export `permissionVocSourceSummary` and
`permissionTaskSourceSummary` through their public barrels; source-owner gates
and explicit metadata allowlists stay inside those owners. Opaque Survey sources
have no summary and cause no response reads. Permission owns active-deny overlap
and selected risk calculation; collection reads do not invoke selected projections.
Admin-only Permission Request recovery sources use
Auth's public `workspaceActorDisplayNameSql` bounded workspace-matched display-name projection;
it exposes no email/Role Level and adds no per-row application lookup. Actor-independent
Permission recovery truth and discovery do not invoke that display projection.

## Responsibility and recovery seams (ADR-0067; implemented)

Core-owned Managed Systems/Analytics Areas export locked transaction-aware routing inputs;
#1090 extends the existing AA lock with `owner_team_id` and consumes the Core-owned
`responsibility-read-projections.ts` team validity input plus the Auth barrel actor lock.
These are validity inputs only; no default resolver or domain assignment lives in Core.
destination VOC/Finding/Task Request/Task application services decide eligibility and write
only owned assignments. Extend `lockManagedSystem`/approved readers; shared contains DTOs,
not runtime resolution. Survey's independent operator rule stays intact.

Dashboard owns identity/occurrence/history/personal presentation projections.
Inject its transaction-aware recorder into relevant source/link commands; approved reads
reevaluate authoritative predicates and same-transaction transitions are deduplicated.
Avoid runtime cycles through command barrels; Core never imports domain/Dashboard commands.
Generic GETs write no projection/source state. Existing pg-boss handles discovery/reconciliation.
Survey owns response decisions and personal-gated presentation/history adapter; Dashboard
may reference it without bypassing privacy or duplicating decision state. Integration owns
the shared recovery UI/public seam consumed by Home; full workflows remain on sources.

## Analytics Area report composition (ADR-0069; backend/shared #1078)

Dashboard owns the Area report read composition. VOC/Finding/Task/Survey own authorized
source-list and grouped count predicates; Survey owns its safe Survey-level follow-up batch projection.
Analytics Areas and Managed Systems own batch metadata lookup for authorized referenced UUIDs including
archives. Read exports are owner seams, not foreign repository/table bypasses.
Integration owns the Coverage Area tab; Admin owns catalog maintenance only. Source repair commands,
entity-link visibility and canonical recovery resolution keep their existing owners. Report reads never
mutate sources or create report-specific assignment/resolution state.

Owner barrel exports added by #1078:

- Findings: `actorFindingListScope` (the same elevated role + per-system `canReadFinding` decisions
  used by `/findings`), `countGroupedFindingsForReport` (canonical execution/recovery predicates).
- Tasks: `actorTaskListScope` (the same elevated role + per-system `checkFindingManage` decisions
  used by `/tasks`), `countGroupedTasksForReport` (list predicates and DB UTC `as_of_date`).
- Surveys: `countGroupedSurveysForReport` (authorized MATERIALIZED fence and the existing
  aggregate-only `surveyFollowUpStateLateral`; Survey-grain, no personal audit).
- VOC: existing `VocGroupedCountReader.countGroupedVocs`; no new projection or predicate.
- Analytics Areas: `readAnalyticsAreaMetadata(db, workspaceId, ids)` returns
  `{ id, managed_system_id, name, archived }`, including archived referenced UUIDs, without locks.
- Managed Systems: `readManagedSystemMetadata(db, workspaceId, ids)` returns
  `{ id, name, archived }`, including archived referenced UUIDs, without locks.

The report calls one grouped query per domain and two batch metadata queries, with no Area argument
or per-record read. Owner list-scope enumeration and memoized point checks are bounded by Managed
Systems; availability is checked across the union even when an owner has no records in a System.
Metadata inputs come only from authorized grouped results, never catalog enumeration.

## Survey provenance and Evidence composition (ADR-0064)

Protected provenance is implemented by #739/#740, with #1109 attachment extensions:
Finding retains
Finding/highlight lifecycle and counters; Survey owns protected
response/approval/text extensions and authorized batch projections. Foreign
modules reach those bindings only through the Survey application seam. Entity
Links owns canonical link mutation, including the narrow Survey definer; Core
keeps append-only audit APIs, with raw app audit reads revoked at cutover.

Integration's Evidence route consumes backend-composed authorized
DTOs, never private provenance/link/audit joins. ADR-0065 assigns Findings as composition owner for
`GET /evidence-highlights` and `GET /evidence-highlights/:id`. UI ownership grants
no Survey/Finding mutation ownership. #816 reuses the approved Survey projection
and Finding-owned attachment command rather than granting personal-response
access to safe result readers.

## Cluster suggestion and draft-preview ownership (ADR-0068; suggestions shipped #1097, preview shipped #1099)

VOC owns the non-domain suggestion lifecycle, generation job/cursor/caps and
paid-preview ledger/budgets/cleanup (#1097 suggestions and #1099 preview implemented); subdirectories are
`apps/backend/src/modules/voc/cluster-suggestions/` and
`apps/backend/src/modules/voc/similarity-preview/` (shipped #1099). They are not a generic Core
AI service. VOC Clusters alone writes its existing Cluster/member tables through
exported application commands, called only on human suggestion confirmation.
Automatic generation calls no Cluster mutation service. Saved recommendations
and shadow measurements remain separate. Workspace Settings owns the shipped
`voc_cluster_suggestions_enabled` policy; VOC consumes its exported resolved
settings seam. Managed Systems exports `lockLiveManagedSystemForShare` and
`managedSystemIsLiveSql` through its read projections for generation/C6.
No foreign repository imports.

2026-10-14 ADR-0068 concurrency amendment (#1097): all suggestion writers
acquire workspace recovery first, serializing with unchanged manual/saved
membership and permission commands. They do not add suggestion locks to those
existing paths. Reacquisition by Cluster commands is allowed in the transaction.

| Writer | Lock sequence |
| --- | --- |
| Generation | recovery → suggestion advisory → settings FOR UPDATE → active MS FOR SHARE → VOCs FOR SHARE (UUID order) → suggestion rows |
| Confirm | recovery → authorization → idempotency → suggestion advisory → MS FOR UPDATE → VOCs FOR UPDATE (UUID order) → suggestion row → Cluster commands |
| Discard / restore | recovery → authorization → idempotency → suggestion advisory → MS FOR UPDATE → VOCs FOR SHARE (UUID order) → suggestion row |

This avoids the generation/settings → manual createCluster/MS/actor-FK →
permission approval/recovery/actor/settings cycle. Restore adds C6/cap/disjoint
checks; confirm/restore never lock settings. Permission checks precede replay;
confirmation's injected per-transaction Cluster factory retains recoveryRecorder.

Frontend `features/voc-cluster/` owns suggestion review on `/voc-clusters`,
`features/voc/` owns optional preview on the create screen and Admin owns the
opt-in on `/admin/settings`. No new shell, top-level feature or domain route is
needed. Shared response/detail/audit schemas have no runtime permission logic.

## Responsibility diagnostic seam (#1089)

Core's Managed System module exports `recordResponsibilityDefaultFailure` from
`managed-systems/index.ts` and extends `lockManagedSystem` with owner/reviewer defaults.
Source commands may consume these transaction-aware inputs and append safe failed-rule
observations through the explicit seam; they own eligibility, routing, permissions and
assignment writes. No runtime Core-to-source or Dashboard import is introduced. The
Admin-authorized diagnostic read is specified in `api/core.md`; creation-time callers
remain #1090/#1091. Diagnostic inputs carry no private candidate or source identity.

### #1109 approved Survey excerpt selection and attachment

Survey's `createSurveyEvidenceCandidates` exposes the safe candidate read through
its service. `resolveSurveyAttachmentSelection` is the approved cross-module source
resolution seam: callers first authorize their target, then Survey locks settings
and the response and rechecks source read, active approval and result suppression.
It returns the existing internal response evidence subject, never a public response
identifier or personal result payload. `resolveExcerptResultAudience` shares actual
response/question suppression between candidate preview and submit without audited
personal Results calls.

Finding's `attachSurveyEvidence` owns the transaction, target authorization, public
null-body highlight, count, audit and metadata-only idempotency response. Survey's
existing `recordSurveyHighlightBinding` owns the protected approval snapshot.
Entity Links' existing `createSurveyFindingLink` owns the canonical active internal
`evidence_of`; the 0066 extension verifies the private attachment witness. These
seams do not grant source modules ownership of Finding writes or change inventory
and personal Results/creation contracts.

### Task responsibility routing inputs (#1091)

Task Request and Task share the Task-owned `tasks/responsibility.ts` destination resolver.
It consumes `managed-systems/index.ts` locked defaults/diagnostics, Auth's public Actor lock,
Finding's public authorization and `analytics-areas/index.ts` locked owner-team input.
Core's `core/responsibility-read-projections.ts` exports `findResponsibilityTeam` for transaction-aware
same-workspace active-team input; destinations retain eligibility and all assignment writes.
The Analytics Area lock preserves its prior signature and adds `owner_team_id` for both
source workers. Cluster has no direct Area and no member-derived rule.

### Managed System preview parent projection (#1099)

`managed-systems/index.ts` exports `readManagedSystemState(db, workspaceId, id)`:
non-locking ID/archive state within the workspace, solely for draft-preview parent
validation. It grants no candidate read permission; VOC resolves scope via
`actorReadScope` and uses `similarVocVisibilityPredicate` for every candidate read.

### Finding execution projection after generic detach (#1174a)

Findings exports `reconcileFindingExecution` and the type-only injected
`FindingExecutionReconciler` from its public barrel. Server composition injects
it into Entity Links; generic detach calls it after the canonical
`finding -> task requested_task` link update and before recovery finish, inside
the same transaction under the workspace recovery lock. The seam locks the
Finding and clears its convenience `linked_task_id` only when no active Task
`requested_task` link remains. Entity Links owns links; Findings owns its table.
Finding link-task reads active canonical links through the Entity Links command
read seam before deciding no-op, conflict or insertion. Task Request execution
predicates and existing command permissions remain unchanged.
