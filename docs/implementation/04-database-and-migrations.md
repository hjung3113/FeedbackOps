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
  by `fops_survey_aggregate_owner`. The `survey.read_approved_result_excerpts_personal`
  and `survey.read_my_survey_response_history` functions are narrow
  `SECURITY DEFINER` projections owned by `fops_survey_evidence_reader_owner`:
  the former returns `response_id` only behind `survey.read_personal_responses`,
  and the latter returns only `survey_id`, Survey title, `submitted_at`, and
  `identity_protected` for the session Actor's responses after the Surveys
  service supplies the session `workspace_id` and `actor_id`. The latter does
  not return a response ID. Neither function returns answer bodies or
  respondent Actor IDs.
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

voc
- vocs
- voc_embeddings (versioned pgvector rows; workspace scope is denormalized for active-version scans)
- voc_cluster_autogen_shadow_candidates (non-domain pairwise measurements; ADR-0054)
- voc_public_updates
- voc_reporter_replies
- voc_internal_comments
- voc_attachments
- reporter_facing_status_transitions

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
- survey_responses
- survey_results
- outcome_follow_up_decisions (ADR-0055 follow-up decision state; one current row per response, column-scoped UPDATE, no DELETE)

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
- audit_logs index workspace_id, actor_id, event_type, created_at.
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
(only the newest one matters). Migrations 0027-0047 were hand-written without
snapshots, so #422 added `meta/0047_snapshot.json`, generated from the TS
schema and checked against a database built by applying all 48 migrations
(tables, columns and nullability match; `voc.workspace_display_counters`,
created by raw SQL in 0017, is intentionally not modeled in the TS schema).
When a hand-written migration lands, the newest snapshot must be refreshed, but
only after the migration and the TS schema agree: apply all migrations to a
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

MVP seed data should include:

```text
- one workspace
- admin, developer, user actors
- managed systems such as Tableau, Power BI, and Looker
- analytics area catalog under each managed system
- sample VOCs
- sample Finding with Evidence Highlight
- sample Task Request
- dashboard recovery examples
```
