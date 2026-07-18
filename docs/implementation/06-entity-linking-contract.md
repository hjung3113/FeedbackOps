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
entityType
assertExists(db, workspaceId, id)
getPermissionSubject(db, workspaceId, id)
canRead(deps, actor, subject)                 # read visibility gate (required)
canCreateTarget?(deps, actor, subject)        # creatable target gate (optional)
getReporterSummary(id)
getInternalSummary(db, workspaceId, id)
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

Slice 5 provider registry (Finding From VOC, ADR-0024):

```text
finding -> registered as a link TARGET type
- relation_type: created_finding   (voc -> finding), created by POST /vocs/:id/create-finding
- resolver: finding.findings(id, workspace_id, primary_managed_system_id)
- create authz: actor needs voc.read on the source VOC's MS AND finding.manage
  on the target Finding's MS; both checked in one transaction before insert
- read authz: finding endpoint readable by Admin, or Developer with finding.read
  on the finding's primary_managed_system_id; User/Reporter never
- getReporterSummary(finding): returns UNAVAILABLE (Finding has no reporter
  summary — ADR-0024 §E); summary_visible therefore unreachable for a finding target
- getInternalSummary(finding): Finding internal read model
- the #112 hard-coded VOC resolution is refactored into this registry; VOC↔VOC
  related_to behavior (#112-#115) is preserved unchanged
```

Link creation endpoints map to registered pairs as of Slice 6:

```text
POST /vocs/:id/create-finding          -> (voc, finding, created_finding)            [#122]
POST /voc-clusters/:id/create-finding  -> (voc_cluster, finding, created_finding)    [#126]
POST /voc-clusters/:id/link-finding    -> (voc_cluster, finding, evidence_of)        [#127]
POST /findings/:id/request-task        -> (finding, task_request, requested_task)    [#132]
POST /vocs/:id/request-task            -> (voc, task_request, requested_task)        [#136]
POST /voc-clusters/:id/request-task    -> (voc_cluster, task_request, requested_task) [#136]
```

Direct `POST /entity-links` creation is narrower than the registered/DB tuple
set. As of #134, direct creation is allowed for these tuples:

```text
(voc, voc, related_to)
(voc, finding, created_finding)
(voc, finding, evidence_of)
(voc_cluster, finding, created_finding)
(finding, task_request, requested_task)
(task_request, task, converted_to)
(finding, task, requested_task)
(voc, task, evidence_of)
```

As of #136, the registered/DB allowlist also includes source-conversion tuples
created by routes, not by direct `POST /entity-links`:

```text
(voc, task_request, requested_task)
(voc_cluster, task_request, requested_task)
```

`(voc_cluster, finding, evidence_of)` is registered for DB validation and is
created only by `POST /voc-clusters/:id/link-finding`. Generic
`POST /entity-links`, generic link listings, and generic `PATCH /entity-links/:id`
detach are prohibited categorically; PATCH/detach returns the same
non-disclosing 404 envelope as an absent link. Domain unlink is permitted only
through `POST /voc-clusters/:id/unlink-finding`, which soft-detaches the exact
active tuple.

Independent value CHECKs are forbidden because they would admit invalid tuples.
Creatable visibility stays `internal_only`.

Slice 6 tracer (#132):

```text
task_request -> registered as a link TARGET type
- relation_type: requested_task (finding -> task_request), created by
  POST /findings/:id/request-task
- resolver: task_request.task_requests(id, workspace_id, primary_managed_system_id)
- create authz: source Finding must exist/read through the Finding lock path,
  and actor needs finding.manage on the Finding's primary_managed_system_id
- read authz: Task Request endpoint uses the same Admin or same-scope Developer
  finding.read convention until the full Task backstage capability lands
- getReporterSummary(task_request): returns UNAVAILABLE
- getInternalSummary(task_request): Task Request internal read model
```

The Slice 6 #132 tracer baseline included:

```text
(finding, task_request, requested_task)
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
