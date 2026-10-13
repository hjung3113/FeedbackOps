# Database And Migrations

## Purpose

This document is the implementation-facing database contract. It supersedes schema drafts in system design docs when implementation begins.

Do not duplicate full table field lists here. Canonical design-level fields
live in `docs/design/15-data-contracts.md` until replaced by migrations.
Applied migrations are the final database authority.

## General Rules

```text
- All domain records include workspace_id unless explicitly global.
- VOC, Finding, Task Request, Task, and Survey records include managed_system_id in MVP.
- Prefer archive over hard delete for referenced objects.
- Cross-system optional relationships use core.entity_links.
- Direct cross-system convenience columns are denormalized projections, not canonical history.
- Migrations must be reversible when practical.
- Sensitive decisions append audit log entries.
- Inline images are stored as governed attachment records and referenced from rich content; never store base64 body images.
- Survey response and answer tables remain outside direct `fops_app` read
  access. Aggregate projections use narrow `SECURITY DEFINER` functions owned
  by `fops_survey_aggregate_owner`. The `survey.read_approved_result_excerpts_personal`,
  `survey.read_my_survey_response_history`, and `survey.read_my_answerable_surveys`
  functions are narrow
  `SECURITY DEFINER` projections owned by `fops_survey_evidence_reader_owner`:
  the first returns `response_id` with approved excerpts; the API projects
  `response_id` and writes the per-row personal-read audits only for
  `survey.read_personal_responses` holders (an app-layer gate, not a SQL-level
  one — `fops_app` holds EXECUTE),
  the second returns only `survey_id`, Survey title, `submitted_at`, and
  `identity_protected` for the session Actor's responses after the Surveys
  service supplies the session `workspace_id` and `actor_id`, and does
  not return a response ID. The third returns only Survey IDs for open Surveys
  in the session Workspace that have no response from the session Actor. The
  app reads respondent-safe Survey metadata and question counts through its
  existing `survey.surveys` and `survey.survey_questions` access, then applies
  `opened_at DESC, survey_id DESC` ordering and cursor pagination. This split
  keeps the response table hidden from `fops_app` without adding column grants
  to the definer owner. None of these functions return answer bodies or
  respondent Actor IDs.
- `survey.survey_response_excerpt_approvals` grants `fops_app` `INSERT`, column-level
  `SELECT` on every column except `response_id`, and column-level `UPDATE ("revoked_at")`
  (0057; before 0057 the `SELECT` was table-wide). The **direct table join** on
  `survey_response_excerpt_approvals.response_id` is therefore denied to `fops_app`;
  this is not SQL-level unlinkability: app-executable Survey definers remain
  composable. The historical audit/Finding/highlight/link direct-read residuals
  are superseded by ADR-0064 and must close in the coordinated #739/#740 cutover;
  every per-response binding read — highlight projections, the stored-highlight
  active check, and the revoke binding check — runs through the
  `survey.read_approved_response_excerpts` and `survey.read_response_excerpt_approval`
  `SECURITY DEFINER` readers owned by `fops_survey_evidence_reader_owner`.
```

### Database prerequisite: pgvector (ADR-0034 D1)

`voc.voc_embeddings` stores vectors, so every database that runs migrations
must already have the `vector` extension installed. pgvector is not a trusted
extension: `CREATE EXTENSION vector` requires superuser, and `fops_migrate`
deliberately is not one. Bootstrap owns it — `scripts/db/init.sql` installs it
when the volume is first created, and migration 0042 only asserts it is
present, failing with a directive message when it is not.

An existing database created before this change needs a one-time superuser
`CREATE EXTENSION vector;`, because `init.sql` runs only on a fresh volume. The
dev image is `pgvector/pgvector:pg16` (`docker-compose.dev.yml`); the older
`postgres:16-alpine` does not carry the extension at all.

## Schema Namespaces

Schema namespace does not always imply module ownership. `core.entity_links` is
stored in the `core` schema for shared relational access, but link behavior,
relation validation, and visibility enforcement are owned by the Entity Linking
module.

```text
core
- workspaces
- actors
- sessions
- teams
- managed_systems
- analytics_areas
- entity_links
- audit_log
- notifications
- rate_limits
- idempotency_keys
- display_counters
- workspace_settings
- saved_views

voc
- vocs
- voc_embeddings (versioned pgvector rows; workspace scope is denormalized for active-version scans)
- voc_recommendation_decisions
- voc_cluster_autogen_shadow_candidates (non-domain pairwise measurements; ADR-0054)
- voc_cluster_suggestions (inert retained pair history; ADR-0068)
- voc_cluster_suggestion_counters / voc_cluster_suggestion_admissions / voc_cluster_suggestion_cursors (inert admission/scan state; ADR-0068)
- voc_public_updates
- public_update_review_candidates
- voc_reporter_replies
- voc_internal_comments
- voc_attachments
- reporter_facing_status_transitions
- voc_permission_decisions_seed_fixture (seed-only fixture, not a production permission cache)

voc_cluster
- voc_clusters
- voc_cluster_members

finding
- findings
- evidence_highlights
- finding_comments (Finding progress notes; `docs/adr/0049-finding-task-progress-notes.md`)

task
- tasks
- task_comments (Task progress notes; `docs/adr/0049-finding-task-progress-notes.md`)
- milestones
- work_initiatives / projects when future execution grouping is introduced

task_request
- task_requests

survey
- surveys
- survey_questions
- survey_responses
- survey_response_answers
- survey_response_excerpt_approvals
- survey_results (computed read projection; not a table)
- outcome_recovery_identities / outcome_recovery_history / outcome_recovery_presentations (56-H private response projections)
- outcome_follow_up_decisions (ADR-0055 follow-up decision state; one current row per response, column-scoped UPDATE, no DELETE)

dashboard
- recovery_identities / recovery_history / recovery_presentations (56-H owner-derived projections)

permission
- permission_requests
- permission_grants
- permission_denies
```

`core.attachments` does not exist as a shared attachment table as of Slice 6;
attachments are domain-scoped, such as `voc.voc_attachments`. `role_levels`,
`customers`, and `contacts` are not present in the current schema. `task_request`
is the Slice 6 review-buffer namespace, with no migration that folds it back
into `task`.

## Enum Strategy

Use application-level string enums unless the database requires stronger constraints for query integrity.
MVP migrations should prefer `text` or `varchar` columns with application-level
validation. Add database `CHECK` constraints only for values that protect core
invariants or query integrity. Do not introduce native database enum types
without a dedicated migration decision.

Required enums:

```text
reporter_facing_voc_status
task_status
task_request_status
finding_status
survey_type
permission_request_status
entity_link_relation_type
entity_link_visibility
voc_source_context
severity
priority
confidence
```

Reporter-facing VOC status, VOC triage state, and Task status are separate
state machines and must use separate columns/enums. Task status changes may
create review candidates, but they must not directly overwrite reporter-facing
VOC status.

## Managed System Data Rules

```text
- core.managed_systems is the MVP registry for scope, filters, defaults, and Developer permission grants.
- core.analytics_areas rows require managed_system_id.
- Analytics Area uniqueness should be scoped to workspace_id plus managed_system_id as needed.
- Analytics Area archive preserves historical references.
- core.analytics_areas is the MVP source of truth; external BI menu keys are optional metadata, not sync ownership.
- analytics_areas.owner_team_id is a routing/defaulting hint only; permission grants remain Managed System scoped.
- project_id columns in existing drafts are transitional only; new MVP migrations should use managed_system_id for scoped records.
- Work Initiative / Project tables must not be required for VOC, Finding, Task Request, Task, Survey, Dashboard, or permission MVP scope.
```

## Adding a Field to an Owned Entity

Update the owning Drizzle table in `apps/backend/src/db/schema/<schema>.ts`, and update the wire contract separately: use `packages/shared/src/<entity>/` where that shared schema exists; otherwise update the module's `routes.ts` request schemas and the frontend `apps/frontend/src/lib/api/<entity>.ts` request types/response DTO. Generate the SQL migration and Drizzle metadata with `pnpm --filter backend db:generate`; if SQL is hand-written, follow [Migration Naming](#migration-naming) for the journal registration and snapshot refresh—never hand-edit `apps/backend/migrations/meta/*.json`—and run `pnpm gate:db-migration-drift`. If the table uses column-level privileges, add the new column to the corresponding column-level grant for `fops_app` in the same migration; do not widen it to a table-level grant. Then update the owning service and required audit detail, the consuming UI, and the affected design/API docs in the same change. For example, `apps/backend/src/db/schema/core.ts` defines the Drizzle table, `apps/backend/migrations/0005_slice2_registry.sql` creates `core.managed_systems`, `apps/backend/src/modules/managed-systems/routes.ts` defines its request schemas, `apps/frontend/src/lib/api/managed-systems.ts` defines its wire DTO, `apps/backend/src/modules/managed-systems/managed-system-service.ts` persists and audits it, `packages/shared/src/audit/managed-system.ts` defines the audit detail schema (a column missing there is silently dropped from the audit snapshot), and `apps/frontend/src/features/admin/managed-systems/ManagedSystemsScreen.tsx` exposes it. Amend an ADR when recording a compatible addition that leaves its decision in force; reopen the decision with a new ADR when changing or reversing it. For `managed_systems`, adding a column requires a dated amendment to ADR-0017 that updates the column list and audit detail; changing the semantics of `id`, `slug`, or `external_key` requires a new ADR reopening ADR-0017.

## Rich Content And Attachments

```text
- Rich content may be stored as structured editor JSON or sanitized HTML plus a format/version column.
- Inline images are attachment references inside the rich content document.
- Attachment rows record workspace_id, owning entity, visibility, content type, size, storage key, and audit metadata.
- External image URLs may be stored as normal links but must not render inline in MVP.
- Rich Table support is spike-gated in MVP; when enabled, rich tables are stored as structured rich content with backend size limits.
- Large spreadsheet-like data belongs in attachments, not oversized rich-content tables.
```

### Archive over delete on `voc.voc_attachments` (migration 0016)

Migration `0016_voc_attachments_grants.sql` grants `DELETE ON voc.voc_attachments TO fops_app`. The grant exists strictly to let the **hourly `core.attachments_purge` worker** reclaim unlinked attachment rows older than 24h (rows with `voc_id IS NULL AND comment_id IS NULL`). It is **not** a relaxation of the project-wide "archive over hard delete" rule:

- **User-initiated paths** (Triage Console "remove attachment", EditDescriptionModal, etc.) MUST go through the service-layer archive: set `archived_at = now()`, `archived_by_actor_id = caller`. They never issue a `DELETE`.
- **The purge worker** is the only legitimate row-deleter, and only against truly orphaned uploads that were never linked to a parent VOC or comment.

The archive-over-delete invariant is enforced in `apps/backend/src/modules/attachments/service.ts` (and surrounding tests), not by withholding the DB grant. Adding new code paths that issue `DELETE FROM voc.voc_attachments` requires explicit ADR-level justification — the purge worker is the lone exception.

## Index Requirements

```text
- All workspace-scoped tables index workspace_id.
- List views index workspace_id plus primary filter status.
- entity_links indexes:
  - workspace_id, source_type, source_id
  - workspace_id, target_type, target_id
  - workspace_id, relation_type
  - workspace_id, source_type, source_id, relation_type
- core.audit_log indexes: (workspace_id, created_at DESC), (workspace_id, subject_type, subject_id, created_at DESC), (workspace_id, actor_id, created_at DESC), and (workspace_id, event_type, created_at DESC).
- notifications index workspace_id, actor_id, read_at, created_at DESC.
```

## Migration Naming

```text
NNNN_slug.sql            # drizzle-kit 4-digit sequence + slug (generated or custom)
```

Examples:

```text
0022_voc_clusters.sql
0025_task_domain.sql
0027_display_id_scheme.sql
```

`drizzle-kit generate` assigns the 4-digit sequence. Timestamp prefixes are not
used in the current migrations directory.

`apps/backend/migrations/meta/*.json` files are Drizzle-generated metadata and
must not be hand-edited. Commit them with their generated SQL migration. The
root `pnpm gate:db-migration-drift` gate mechanically verifies that every
`migrations/*.sql` file has exactly one `_journal.json` registration (and vice
versa), runs `drizzle-kit check` against the committed migration history, then
diffs the live TS schema against a throwaway copy of the committed migrations:
`check` only validates migration-history/journal consistency — it does **not**
diff the schema, so the gate also runs `db:generate` with its output redirected
to the throwaway copy (via `DRIZZLE_OUT`) and fails if generate would add or
rewrite any SQL/journal/snapshot file. (`db:generate` first bundles
`src/db/schema/index.ts` with esbuild to the gitignored
`.drizzle-schema/schema.cjs` because drizzle-kit 0.30.1's CJS loader cannot
resolve the NodeNext `.js` specifiers the schema's cross-file imports require.)

`drizzle-kit generate` diffs against the newest snapshot under `migrations/meta`
(only the newest one matters). Hand-written migrations may land without
snapshots, so #422 added the first TS-derived baseline snapshot, generated from
the TS schema and checked against a database built by applying all migrations
then present (tables, columns and nullability match; `voc.workspace_display_counters`,
created by raw SQL in 0017, is intentionally not modeled in the TS schema).
The gate does not require a snapshot for every migration: it fails only when
`db:generate` would add or rewrite files. When it fails and the newest journal
entry has no snapshot, refresh the newest snapshot, but only after the
migration and the TS schema agree: apply all migrations to a
scratch database and compare it with the TS-derived snapshot (tables, columns,
nullability, defaults, indexes, FKs) *before* adopting a newly generated snapshot
as the baseline — otherwise a TS change the migration never applied is silently
blessed. Then run `pnpm --filter backend db:generate` into a scratch copy, keep
only the new meta snapshot renamed to the latest journal index, and discard the
generated SQL/journal change. The gate prints this instruction when it detects
drift and the newest journal entry has no snapshot.

Known limits of the TS-derived baseline: constraint and index *names* in
hand-written migrations (for example unnamed `REFERENCES`, which PostgreSQL names
`<table>_<column>_fkey`) differ from the names drizzle derives, and the TS schema
does not model every SQL-only object. These are intentionally SQL-only (#433):
functional `COALESCE` unique indexes on `permission.permission_grants|denies|requests`
(drizzle cannot express them), the 14 hand-written FKs on `permission.*`, the extra
indexes on those tables, and `voc.workspace_display_counters` (migration 0017).
`core.saved_views` is modeled: its unique is the 4-column
`saved_views_workspace_actor_surface_name_uq` constraint, exactly as named in 0045. A generated
`DROP CONSTRAINT`/`DROP INDEX` for such an object must be hand-checked against
the real name before use.

## Issue #165: released Task review candidates

`voc.public_update_review_candidates` is a VOC-owned durable queue of human
review obligations. Its permanent `(workspace_id, release_event_id, voc_id)`
unique key makes pg-boss retries safe; its partial pending Task/VOC key prevents
two unresolved obligations for the same Task/VOC. `fops_app` has SELECT and
INSERT plus column-scoped UPDATE only for `status`, resolver/timestamp, dismissal
reason, and actioned Public Update fields (migration 0033); it has no DELETE,
TRUNCATE, or table-wide UPDATE. Migration `0032_task_released_review_candidates.sql` also
pre-creates the Task release queue with ADR-0009 retry defaults. Its resolution
CHECK validates pending/dismissed/actioned fields, and its terminal-immutability
trigger rejects every rewrite of an actioned or dismissed candidate. A later
Task release must create a new candidate row; it must never reopen or mutate a
terminal decision.

## Issue #512: VOC cluster shadow measurements

Migration `0051_voc_cluster_autogen_shadow.sql` pre-creates the hourly
`voc.cluster_autogen_shadow` queue with ADR-0009 retry defaults and creates
`voc.voc_cluster_autogen_shadow_candidates` as a separate non-domain measurement
table. Rows are unique by workspace, sorted VOC pair, and embedding version;
`fops_app` has `SELECT`, `INSERT`, and `UPDATE`, with no `DELETE`. The shadow
handler never writes cluster, membership, recommendation-decision, VOC, or audit
rows; see ADR-0054 for its eligibility and reporting rules.

## Issue #510: outcome follow-up decisions

Migration `0052_outcome_follow_up_decisions.sql` creates
`survey.outcome_follow_up_decisions` (ADR-0055 storage option (b): state row
plus `core.audit_log` history) and the `SECURITY DEFINER` classifier
`survey.read_outcome_follow_up_state`, and replaces
`survey.count_negative_outcome_without_followup` in place with the ADR-0055
predicate: low rating band via the IMMUTABLE `survey.rating_band_for_value`
helper (parity-tested against `getRatingBandForValue`), closed outcome
surveys only, workspace `survey_anonymity_threshold` respected, resolution
only by an active `generated_finding` link to a `draft`/`active`/`converted`
Finding or a current `no_follow_up` decision. `fops_app` holds `SELECT`,
`INSERT`, and `UPDATE` scoped to `state`, `reason`, `decided_by_actor_id`,
`updated_at`, with no `DELETE`; `fops_survey_aggregate_owner` gained only the
column grants the new predicate reads (`surveys.status`,
`survey_questions.rating_max`, `entity_links.relation_type`/`target_id`,
`finding.findings(id, workspace_id, status)` plus schema `USAGE`,
`core.workspace_settings(workspace_id, survey_anonymity_threshold)`, and
column-scoped `SELECT` on the decision table).

Migration `0053_outcome_follow_up_read.sql` adds the part C read surface as
two more `SECURITY DEFINER` functions owned by `fops_survey_aggregate_owner`
(chosen over the evidence-reader owner because its grants already cover the
whole ADR-0055 classifier predicate; the items reader crosses no raw-text or
excerpt boundary): `survey.read_outcome_follow_up_survey_state` returns only
the two survey-grain booleans (`classifiable`, `follow_up_needed`) for any
`survey.read` caller, and `survey.read_outcome_follow_up_items_personal`
returns the per-poor-response review rows — response id, 1-based submission
ordinal, low-band answers with question label and bounds, resolution, the
qualifying Finding (earliest-created live `generated_finding`, returned with
its primary Managed System so the service can apply the caller's Finding read
scope), and the
current decision — only for callers that already crossed the
personal-response seam. Both reuse `survey.rating_band_for_value` and the
same predicate as `read_outcome_follow_up_state`. The owner gained only the
display columns the review list needs: `survey_responses.submitted_at`,
`survey_questions.prompt`/`sort_order`,
`outcome_follow_up_decisions.reason`/`updated_at`, and
`finding.findings.created_at`/`display_id`/`primary_managed_system_id`.

## Issue #509: notification inbox and dispatch

Migration `0054_notifications.sql` creates `core.notifications` with a
workspace and recipient Actor foreign key, a UUID `correlation_id`, and the
unique idempotency key `(workspace_id, actor_id, event_type, subject_id,
correlation_id)`. The table intentionally has no database CHECK on
`event_type`; the application catalogue owns that allowlist. Its inbox index
is `(workspace_id, actor_id, read_at, created_at DESC)`. `fops_app` has
`SELECT`, `INSERT`, and column-scoped `UPDATE` on `read_at`, `archived_at`, and
`email_sent_at`, with no `DELETE` or table-wide `UPDATE`; `fops_migrate` retains
`ALL` on the table.

The same migration pre-creates the `notifications.dispatch` pg-boss queue
with ADR-0009 retry defaults (5 retries, 30 second delay, backoff enabled).
Notification jobs are enqueued in the caller's transaction; the handler
persists one actor-scoped inbox row and makes the email claim while holding
that row transaction open. Email delivery is at-least-once because a process
can send successfully and fail before the transaction commits.

## Issue #182: conversion-link visibility backfill

Migration `0035_voc_task_conversion_summary_visible.sql` changes only
`core.entity_links.visibility`. Its audit-provenance predicate requires an
active `(voc, task, evidence_of)` link whose exact ID is present in the
matching `task_created_from_request` audit row's `detail.preserved_links`
array. This covers direct-VOC and Finding-propagated conversion links while
leaving manually created same-endpoint links `internal_only`. Audit payloads
without preserved-link IDs are deliberately outside backfill coverage;
provenance is never inferred from endpoint or Task Request shape. The update
is idempotent because it targets only currently `internal_only` rows.

## Seed Data

The seed is a separate, idempotent command (`pnpm --filter @fops/backend db:seed`,
`apps/backend/src/seed/index.ts`), not part of a migration. It seeds:

```text
- one workspace (WORKSPACE_ID)
- actors: mock-admin-1 (admin), mock-user-1 (user), system (admin, system actor)
- managed systems: Tableau and Power BI, default owner mock-admin-1
- 5 analytics areas: Permission Management, Usage Analytics, and Dashboard Catalog under Tableau; Permission Management and Usage Analytics under Power BI
- one fixture team, "[seed] VOC owner team", inserted through the fops_migrate URL because fops_app cannot insert core.teams (ADR-0019)
- 12 deterministic VOC fixtures (display_id VOC-SEED-*) with three conversation rows each, and two permission-decision fixtures (apps/backend/src/seed/voc-fixtures.ts)
- SEED_MODE=personas only: mock-admin-2, mock-user-2, mock-developer-1, mock-developer-2, and permission grants for the two developers
```

It does not seed Findings, Evidence Highlights, Task Requests, Tasks, Surveys, or Dashboard rows.

## Permission close-out migration contract (ADR-0066; proposed/new)

Migration `0058_permission_request_revision.sql` adds the request revision and
`cancelled` status without altering the open-request unique index. Apply it before
writers and deploy required-revision API and #1083 clients together. Its SQL
contains a history-preserving rollback note. Scratch-DB verification and the
latest snapshot refresh must precede the migration drift gate; never adopt a
TS-derived snapshot without comparing actual migrated SQL as described above.

No migration is applied by the docs decision. Implementation adds positive integer
permission.permission_requests.revision NOT NULL DEFAULT 1 and extends the existing
text status CHECK with cancelled, retaining every old status. Every successful
mutation advances revision/updated_at. Preserve permission_requests_active_uq over
the full COALESCE requester/capability/scope/source tuple and open predicate
pending/needs_more_info; cancelled falls outside it, preserving history.

Migration `0063_permission_grant_reissue.sql` (#1085) adds nullable
permission.permission_grants.superseded_at. Generated journal/snapshot accompany
it; the SQL preserves the historical expression scope columns. Apply before the
writers; migration numbering and combined metadata verification belong to the conductor. Atomic expired exact-tuple
reissue sets only that predecessor marker and inserts a new ID. Preserve original
expiry/grantor/time/revoke metadata. permission_grants_active_uq keeps every existing
COALESCE scope column, changing only its predicate to revoked_at IS NULL AND
superseded_at IS NULL. Never now(); expiry remains enforced at runtime. Checks,
scope resolution, active lists, revoke validation and seed existence checks exclude
superseded rows. Register generated SQL/journal/snapshot under the existing rules;
verify SQL-only indexes against real applied SQL, not a shortened Drizzle definition.

Inventory legacy non-null object scope requests and unsuperseded grants; retain
historical fields, reject unsupported request writes/approval, and resolve legacy
grant disposition explicitly before release without automatic widening/revocation.
Schema precedes writers; API/shared/frontend expected_revision consumers roll out
together with stale-client refresh. After cancelled/superseded rows exist, restoring
the old CHECK/unique predicate blindly is unsafe. Rollback requires explicit data
handling preserving history or a forward fix; document irreversible state in the
implementation migration plan and test audit-failure rollback of reissue.

## Close-out storage (ADR-0067; proposed/new, not applied)

The new responsibility fields/settings and logical Dashboard projection shapes are in
`docs/design/15-data-contracts.md`. Add nullable Finding owner, Task Request assigned-reviewer,
Task team-assignee, Managed System reviewer pairs and Coverage thresholds with registered
SQL/generated metadata/grants in implementation chunks. Preserve existing null assignments,
completed reviewer attribution and Survey operator behavior; no provenance/assignment backfill.
XOR-or-both-null constraints and service workspace/active-team/Actor eligibility apply.

56-H registers `dashboard.recovery_identities`, `dashboard.recovery_history` and
`dashboard.recovery_presentations`, plus Survey-owned `survey.outcome_recovery_identities`,
`survey.outcome_recovery_history` and `survey.outcome_recovery_presentations`. Runtime identity
and presentation grants are SELECT/INSERT/UPDATE; histories are SELECT/INSERT only. The
journaled migration precreates `dashboard.recovery_reconcile` (5 retries, 30 seconds, backoff)
and adds narrow Survey definer readers using the existing protected owner column grants.
No existing table grants widen. Owner source/Actor/System IDs in these projections are
durable logical references, preserving evidence across owner lifecycle; only workspace
references are physical FKs. The generated follow-up migration removes the initial owner
reference FKs without deleting projection data. Index workspace/scope/category,
history `(workspace_id, resolved_at, id)`, source/Actor identity. Exact transitions commit
with source/link mutations via an injected recorder; pg-boss discovery/reconciliation is
idempotent and marks observation-only evidence honestly. Seed current identities without
inventing past repairs. Read history from the inclusive first instant of the current UTC month minus two calendar
months, ordered by resolution time/UUID and filtered by current permission before count/LIMIT; pruning never deletes
`core.audit_log` or stable/current-occurrence identity needed to prevent preference drift.
Survey response presentation/history remains a personal-gated Survey-owned adapter and
retains ADR-0055 state/definer/grant protections, not duplicated Dashboard resolution state.

## Analytics Area report storage boundary (ADR-0069; implementation pending)

No report tables, lifecycle storage, Area backfill, mandatory classification or Task Request Area
column are introduced. Grouped owner reads and metadata batching produce the proposed/new API projection.
Survey classification remains behind protected owner readers; `fops_app` gains no direct response/answer
read grant. If batching requires a new protected reader, its name/migration is proposed/new until
implemented: register it in `apps/backend/migrations/meta/_journal.json`, narrowly grant the owner's
needed columns, fix `search_path = pg_catalog`, revoke PUBLIC and preserve existing capability gates.
Measure grouped query plans around 5k VOCs/5k Tasks before proposing an index; no preemptive materialized cache.

## Survey provenance cutover — ADR-0064 (coordinated delivery pending)

#739 adds generated/journaled migration `0059_survey_finding_provenance.sql`,
protected `survey.finding_response_bindings` and `survey.highlight_response_bindings`,
and scoped reader/mutator seams. Existing-DB owner prerequisites, constraints,
function signatures, cache inventory, standalone legacy-upgrade procedure and #740
coordination are in [the #739 cutover contract](survey-provenance-cutover-739.md).
Execution and combined #739/#740 verification are still required.

- Proposed/new Survey-owned protected Finding and highlight extensions retain
  workspace-qualified response/approval bindings and historical generated text.
  Fields, NULL conditions and consistency rules are in `docs/design/15-data-contracts.md`.
  `fops_app` has no SELECT/INSERT/UPDATE/DELETE on these extensions; use scoped
  functions with least-privileged NOLOGIN reader/separate mutator owners,
  `search_path=pg_catalog`, qualified tables, no dynamic SQL, PUBLIC EXECUTE
  revoked and explicit app EXECUTE only. Do not widen existing owner writes.
- Public Survey Finding `source_id` is NULL; title/summary contain deterministic
  allowlisted metadata only. Public Survey highlight `source_id`,
  `approved_excerpt_id` and `quote_or_summary` are NULL. Ordinary provenance/text
  remains readable under existing rules; conditional constraints enforce the split.
- Proposed/new owner-backed, explicitly column-listed `security_barrier` updatable
  link view excludes either `survey_response` endpoint in every status, with
  `WITH CHECK OPTION`. App SELECT/INSERT/UPDATE use this view, no DELETE; revoke
  raw `core.entity_links` SELECT/INSERT/UPDATE and surviving column/inherited grants.
  Survey link mutations use an Entity Links-owned narrow definer. Verify real
  conflict/RETURNING/UPDATE paths rather than assuming table SQL works on the view.
- `core.audit_log`: revoke raw app SELECT, retain INSERT/no UPDATE/DELETE. Preserve
  Actor/subject/detail identifiers and history; controlled migrate/operator reads
  supply verification. No broad app audit reader. Inventory consumers before cutover.
- Backfill/reconcile active and archived Findings, zero-highlight creations, revoked
  approvals and all link statuses; reject orphan/workspace/approval-response mismatches.
  Preserve original UUIDs, timestamps, counters and detach metadata. Sanitize only
  confirmed Survey-derived legacy mutation cache copies under ADR-0015's dated
  exception, preserving keys/hashes/status and exactly-once effects.
- Update application/repositories/DTOs with schema and grants in one coordinated
  release; old binaries are incompatible. Generate/review SQL, journal and snapshots
  through existing migration discipline. Neither #739 nor #740 alone proves delivery.
  Index private workspace+parent/response/approval paths and batch hydration; no audit
  JSON scan in request paths. Verify actual app ACL denial and operator history.
- This closes direct-table paths, not SQL-level unlinkability against stolen app
  credentials: permitted definers remain trusted application tools.

## Close-out assistance storage (ADR-0068; inert suggestions #1096, preview pending)

Generated migration `0062_cluster_suggestion_storage.sql` (journal + snapshot) adds
`voc.voc_cluster_suggestions`, the three VOC-owned counter/cursor tables in
`docs/design/15-data-contracts.md`, and the default-off workspace policy. No Cluster
schema, queue registration, generation/review commands or Admin editor are added.
Shadow measurements and saved recommendations stay separate and unchanged.

DB checks enforce sorted/distinct pairs, positive revision/version/dimensions,
required nonempty scoring/hash metadata and exact lifecycle field combinations.
The pair unique key excludes version/state, so retained terminal identities suppress
recreation across model changes. NO ACTION FKs retain VOC/Actor/Cluster references;
write guards check workspace/MS integrity without adding domain Cluster columns or
keys, freeze initial identity/timestamp and make confirmed rows immutable. Source
archive/text/MS changes still require future current-eligibility checks. Freshness,
disjoint/cap admission, revision advancement, legal review transitions and five-minute
restore belong to item 2's commands, not this inert item.

`fops_app` has SELECT/INSERT/UPDATE on suggestions, occupancy and cursors, and
SELECT/INSERT/UPDATE/DELETE on hourly admissions. An invoker guard permits app DELETE
only after the hour ends. No app TRUNCATE or durable suggestion DELETE is granted;
`fops_migrate` retains operator teardown privileges. Policy changes serialize under
the existing settings singleton, preserve Coverage/other settings, audit boolean
effective diffs only and never spend counters or advance cursors. The conductor
owns migration numbering/reconciliation and actual app/migrate throwaway-DB checks.

Paid preview requests/budgets remain proposed: no raw prose or cached candidate IDs/
titles, vectors at most ten minutes, tombstones 24h, budget buckets until UTC window
expiry. A future VOC cleanup job may receive narrowly scoped DELETE only on preview
operational rows/ended counters, never Cluster, member or audit tables. No preview
storage or cleanup registration ships in #1096. Future provider I/O remains outside
short reservation/completion transactions.

## Responsibility storage (#1089 / ADR-0067 56-D)

Migration `0060_responsibility_defaults.sql` adds nullable Finding owner, Task Request
assigned-reviewer, Task team-assignee and Managed System reviewer columns with FKs and
XOR-or-both-null checks. It performs no source UPDATE/backfill and leaves actual decision
Actor/provenance and Survey operator fields intact. Existing table grants already cover
these columns; no table-wide privilege widening or bootstrap-role change is needed.
The new Core diagnostic input table has runtime SELECT/INSERT only; `core.teams` stays
SELECT-only and `core.audit_log` immutable. Generated SQL/journal/snapshot ship together.
Workspace/active-team and Actor eligibility checks apply to explicit registry defaults;
Task Request creation and Task conversion/edit validation/routing are implemented by #1091;
VOC/Finding creation remains #1090. No additional migration or grant widening is required. The failure-input/read contract is
`docs/implementation/api/core.md`.

## ADR-0064 #740 canonical read cutover

`core.entity_links` remains canonical and supplies FK/history identity. Runtime ordinary
SQL uses `core.entity_links_app`, an explicitly column-listed owner-backed simple
updatable security-barrier view with cascaded CHECK OPTION. Both Survey-response
endpoints are excluded in all statuses. App SELECT/INSERT/UPDATE are granted only on
the view; no DELETE. Raw table and column ACLs are revoked, including PUBLIC; the
migration fails closed on inherited raw grants rather than changing memberships.
App audit INSERT stays without RETURNING; raw audit SELECT is revoked, while controlled
migrate/operator history retains Actor, subject and detail. The narrow scoped Core
question/configuration projections replace the two existing audit readers.

The coordinated rollout, new owner-role prerequisite, consumer inventory and conductor
verification are recorded in `survey-link-audit-cutover-740.md`. Neither 0059 nor #740
alone closes Slice 53. Trusted permitted-definer composition is the accepted limit;
stolen-app-credential unlinkability is not claimed.

### #1109 approved Survey attachment extension (0066)

`apps/backend/migrations/0066_survey_evidence_attachment.sql` and its generated
`meta/0066_snapshot.json`/journal extend the existing Survey provenance and Entity
Links mutator functions. No storage table changes, new owners, app table grants or
reader-owner widening are introduced. Exact column privileges and their purposes
are recorded in [the #1109 cutover section](survey-link-audit-cutover-740.md#1109-approved-attachment-extension-0066-runtime-verification-pending).
The new approval-addressed response lock has PUBLIC EXECUTE revoked and app EXECUTE
only. Ownership-transfer schema CREATE is temporary and revoked before commit.
Deferred 0059 checks allow another response on a target only with its same-transaction
active internal-only `evidence_of`; generated lineage and original history stay intact.

Generation is completed; application and real-role verification are conductor-owned.
Apply after 0065, verify owner/membership/function/column ACLs, and execute the new
route rollback/replay/revoke/threshold race tests together with existing provenance
and canonical-read suites on a throwaway database before deployment acceptance.
