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
- hidden from Reporter and Basic User unless separately authorized.

summary_visible
- exposes only backend-provided summary contract.

visible_to_reporter
- visible to reporter when source and target permissions allow.

admin_only
- visible to Admin only.
```

Both source and target permissions are checked on read.

## Dashboard Missing-Link Queries

Dashboard may query entity links to detect:

```text
- High Severity VOC without Finding
- VOC Cluster without Finding
- Finding without Task Request, Task, Milestone, linked existing Task, or not_actionable decision
- Released Task with unresolved reporter-facing VOC status
- Bad Outcome Survey without follow-up Finding or Task Request
```

Dashboard must deep-link users to owning module actions. Dashboard must not mutate source lifecycle state directly.

