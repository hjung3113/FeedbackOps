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
```

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
- rate_limits
- idempotency_keys
- display_counters

voc
- vocs
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

task
- tasks
- work_initiatives / projects when future execution grouping is introduced
- milestones when future execution grouping is introduced

task_request
- task_requests

survey
- surveys
- survey_responses
- survey_results

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
