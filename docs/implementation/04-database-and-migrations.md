# Database And Migrations

## Purpose

This document is the implementation-facing database contract. It supersedes schema drafts in system design docs when implementation begins.

Do not duplicate full table field lists here. Canonical design-level fields
live in `docs/design/15-data-contracts.md` until replaced by migrations.
Applied migrations are the final database authority.

## General Rules

```text
- All domain records include workspace_id unless explicitly global.
- Prefer archive over hard delete for referenced objects.
- Cross-system optional relationships use core.entity_links.
- Direct cross-system convenience columns are denormalized projections, not canonical history.
- Migrations must be reversible when practical.
- Sensitive decisions append audit log entries.
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
- teams
- customers
- contacts
- product_areas
- entity_links
- audit_logs

voc
- vocs
- voc_clusters
- public_updates

finding
- findings
- evidence_highlights

task
- task_requests
- tasks
- projects
- milestones

survey
- surveys
- survey_responses
- survey_results

permission
- permission_requests
- permission_grants
- permission_denies
```

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
severity
priority
confidence
```

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
YYYYMMDDHHMM_descriptive_change.sql
```

Examples:

```text
202605121200_create_core_product_areas.sql
202605121230_create_core_entity_links.sql
```

## Seed Data

MVP seed data should include:

```text
- one workspace
- admin, manager, contributor, reporter actors
- product area tree
- sample VOCs
- sample Finding with Evidence Highlight
- sample Task Request
- dashboard recovery examples
```
