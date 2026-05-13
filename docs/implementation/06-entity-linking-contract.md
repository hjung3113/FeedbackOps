# Entity Linking Contract

## Purpose

Entity Links are the canonical cross-system relationship layer.

## Ownership

Entity Linking owns:

```text
- relation_type registry
- link creation validation
- workspace matching
- visibility enforcement
- summary-visible dispatch
```

It does not own source object lifecycle.

## Relation Types

Allowed relation types are the registry from `docs/design/11-entity-linking.md`.

Forbidden:

```text
generated_voc
```

## Link Creation Validation

Every new entity link must validate:

```text
- source entity type is registered
- target entity type is registered
- source exists in workspace
- target exists in workspace
- source and target are in the same workspace
- source and target Managed System scope is compatible when both records are MVP-scoped
- relation_type is allowed for the entity pair
- actor has permission to create the link
- visibility is allowed for the relation and actor
```

## Provider Interface

Each linkable module registers:

```text
entity_type
assertExists(id, workspace_id)
getPermissionSubject(id)
getReporterSummary(id)
getInternalSummary(id)
listExpectedLinks(id)
```

## Visibility Enforcement

```text
internal_only
- hidden from Reporter and User unless separately authorized.

summary_visible
- exposes only backend-provided summary contract.
- Reporter summaries expose only public_title, reporter_facing_status,
  owning_team_public_name, expected_resolution_date, last_public_update_at,
  and public_update_excerpt.

visible_to_reporter
- visible to reporter when source and target permissions allow.

admin_only
- visible to Admin only.
```

Both source and target permissions are checked on read. Reporter-visible
summaries must not expose raw Task Status, priority, internal comments,
individual Developer names, internal due dates, root-cause detail, severity,
confidence, or private notes.

## Dashboard Missing-Link Queries

Dashboard may query entity links to detect records missing relation types expected by workspace policy, Managed System policy, severity rules, or explicit workflow configuration:

```text
- Unassigned VOC in configured Managed System scope
- High Severity VOC eligible for follow-up and currently lacks a Finding, Task Request, Task link, or authorized no-follow-up-needed decision
- VOC Cluster marked "needs synthesis" without Finding
- Finding marked actionable without Task Request, Task, linked existing Task, or not_actionable decision
- Released Task with unresolved reporter-facing VOC status
- Bad Outcome Survey without configured follow-up Finding or Task Request
```

Dashboard must not treat every unlinked record as incomplete. Dashboard must deep-link users to owning module actions and must not mutate source lifecycle state directly.
