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

Slice 4.1 tracer registry (#112):

```text
voc -> voc
- relation_type: related_to
- resolver: voc.vocs(id, workspace_id, primary_managed_system_id)
- create authz: actor must have voc.read on both source and target Managed Systems
- read authz: focused endpoint must be readable; the opposite endpoint is emitted
  as visibility_state=allowed when readable and visibility_state=hidden when not
```

Slice 4.3 workspace inventory (#114):

```text
GET /entity-links?scope=workspace
- default inventory mode is also used when no source or target endpoint is
  supplied.
- endpoint mode and workspace inventory mode are mutually exclusive.
- optional filters: status=active|stale|detached|revoked, relation_type=related_to,
  managed_system_id=<uuid>
- order: created_at DESC, id DESC
- response: { items: EntityLinkDto[] }
- authz: every row checks voc.read on both endpoints' Managed Systems.
  Rows are visibility_state=allowed only when both endpoints are readable;
  otherwise they are visibility_state=hidden.
- hidden inventory rows expose audit metadata but never source_id, target_id, or
  synthesized endpoint summaries.
```

## Link Detach Validation

Slice 4.2 detach lifecycle (#113):

```text
PATCH /entity-links/:id
- request body: { reason: string } where reason is required, trimmed, and non-empty
- supported transition: active -> detached only
- authz: actor must have the same voc.read capability used by link creation on
  both source and target VOC Managed Systems
- not found / cross-workspace / missing scope on either endpoint: 404
- already detached, revoked, stale, or lost update race: 409
- side effects in one transaction: update status/detach metadata and append
  audit_log event_type entity_link.detached
- hard delete is forbidden; fops_app has UPDATE but not DELETE on core.entity_links
```

Because the active uniqueness constraint is partial (`WHERE status='active'`),
detaching a link intentionally frees the same VOC pair to be linked again later.

## Visibility Enforcement

ADR-0023 (Slice 4.4 #115) locks the per-(stored visibility × actor) decision
table, the `hidden`/`denied` boundary, both-side enforcement, the `request_access`
deferral for VOC↔VOC, and the canonical summary/forbidden-field lists. The
`evaluateLinkVisibility` pure function in the backend entity-links module is the
single decision point; the read DTO gains `summary_visible` and `denied` variants
(not `request_access`).

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
