# Entity Linking

## Purpose

Entity Link is the loose coupling layer between VOC, Finding, Task, Survey, Dashboard, and Permission.

It enables cross-system context without forcing every object to own every relationship directly.

## Data Model Draft

```text
core.entity_links
- id
- workspace_id
- source_type
- source_id
- target_type
- target_id
- relation_type
- visibility
- created_by
- created_at
```

The stored table also carries lifecycle `status`, `managed_system_id`, `updated_at`,
and the `detached_*` columns, and enforces uniqueness for active links. The full
column list is `15-data-contracts.md`.

## Relation Types

This document does not define relation type meaning or the allowed registry.
Those are an implementation contract: [06-entity-linking-contract.md](../implementation/06-entity-linking-contract.md).

## Visibility

This document does not define stored visibility tokens or read-time visibility rules.
Those are an implementation contract: [06-entity-linking-contract.md](../implementation/06-entity-linking-contract.md).

## Functional Requirements

### FR-LINK-001: Create Entity Link

Priority: MUST

Acceptance Criteria:

```text
- Authorized users can link supported entity pairs.
- Link stores relation_type and visibility.
- Link creation is audited for sensitive relations.
```

### FR-LINK-001A: Detach Entity Link

Priority: SHOULD

Acceptance Criteria:

```text
- Authorized users can detach a supported link when policy allows.
- Detach does not hard-delete canonical history.
- The entity_link is marked inactive, detached, or revoked with actor, reason,
  and timestamp.
- Sensitive detach actions are audited.
```

Detach writes `detached` only. `revoked` is reserved for future admin/policy
flows and `stale` is not written.

### FR-LINK-002: Enforce Visibility

Priority: MUST

Acceptance Criteria:

```text
- internal_only links are not exposed to Reporter.
- summary_visible exposes only the target system's summary contract.
- admin_only is restricted to Admin.
- Source and target permissions are both respected.
- Linked-object UI visibility is backend-decided as the current effective Entity Link set `allowed`, `hidden`, `summary_visible`, or `denied`; `request_access` remains reserved and is not emitted until a requestable link target exists (ADR-0023 §B). Permission Decision and permission frontend states are separate vocabularies.
- Frontend must not synthesize linked-object summaries from raw data that the actor cannot otherwise read.
```

Hidden inventory rows expose audit metadata (`status`, `managed_system_id`,
`created_by`, `created_at`, `updated_at`) and omit source/target endpoint ids and
any synthesized endpoint summary.

**ADR-0023** locks the full enforcement: the per-(stored
visibility × actor) decision table, the `hidden`/`denied` boundary, both-side
enforcement on endpoint and inventory reads, the deferral of `request_access`
(unreachable for VOC↔VOC until a requestable link target lands), and the
canonical summary/forbidden-field contract. Effective VOC↔VOC read decisions
are `allowed | hidden | denied`; `summary_visible` is defined but never emitted
for a `voc` target. `POST /entity-links` stays locked to `internal_only`; each
visibility token is enforced via seeded rows, not API-created data.

The Survey Response→Finding registry rows and their command-only rule (tuple CHECK,
generic rejection/hiding, Finding-domain commands as the only writers) are owned by
`docs/implementation/06-entity-linking-contract.md` (Survey Response→Finding
command-only tuples; ADR-0064 Survey boundary).

### FR-LINK-003: Support Dashboard Missing-Link Queries

Priority: MUST

Acceptance Criteria:

```text
- Dashboard can query records without expected relation types.
- Dashboard can query records missing relation types expected by workspace policy, Managed System policy, severity rules, or explicit workflow configuration.
- Dashboard can detect stale or missing workflow links without treating every unlinked record as incomplete.
- Missing-link detection does not require hard-coded foreign keys for every relationship.
```

## Direct Foreign Keys vs Entity Links

Recommended:

```text
- VOC / Task / Survey / Finding store primary_managed_system_id directly and may store analytics_area_id directly.
- Strong ownership relationships can use direct foreign keys.
- Cross-system, optional, or many-to-many relationships use entity_links.
```

## Cross-System Dependencies

```text
- 10-cross-system-workflows.md defines optional integration patterns and policy-driven expected links.
- 09-permission-access.md defines visibility enforcement.
- 08-dashboard-system.md depends on missing-link queries.
```

## Out Of Scope For MVP

```text
- Arbitrary user-defined relation types
- Visual graph explorer
- Cross-workspace links
```

## Survey canonical history isolation (ADR-0064)

Implemented by #740: keep every canonical link endpoint/status
and detach metadata, but move ordinary app reads/writes to a filtered
owner-backed view excluding either Survey-response endpoint in every status.
Generic counts/cursors/detach omit those rows entirely. Survey mutations remain
Entity Links-owned narrow commands; safe derived-Finding reads belong to Survey,
with source/target authorization including the cross-Managed-System exception.
Raw app audit SELECT is revoked while controlled operator history remains intact.
No new generic Survey detach or raw provenance reconstruction surface is added.
