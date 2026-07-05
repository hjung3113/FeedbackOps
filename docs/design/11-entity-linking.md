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

Slice 4.1 tracer (#112) implements the first production path: VOC → VOC
`related_to` links with `visibility='internal_only'` and lifecycle
`status='active'`. It also adds `managed_system_id`, `updated_at`, uniqueness
for active links, and active source/target lookup indexes.

## Relation Types

Common:

```text
- related_to
- evidence_of
- supports
- validates
- follow_up_for
```

For Slice 4.1, `related_to` is enabled only for VOC↔VOC links. Additional
entity pairs remain deferred to later slices.

VOC:

```text
- clustered_into
- supports_existing_voc
- created_finding
```

Survey:

```text
- survey_evidence_for_existing_voc
- generated_finding
- survey_evidence_for_task
- survey_evidence_for_milestone
- task_validated_by_survey
- milestone_validated_by_survey
```

Task:

```text
- requested_task
- created_task
- created_milestone
- linked_existing_task
```

Explicitly excluded:

```text
- generated_voc
```

`survey_evidence_for_existing_voc` links Survey evidence to an already existing
VOC only. It must respect Managed System scope, target visibility, policy, and
anonymous response protections. It must not imply Survey Response to VOC
conversion.

Slice 4.1 tracer (#112): production support starts with VOC↔VOC `related_to`
links only. The tracer creates `core.entity_links` rows with `status='active'`,
`visibility='internal_only'`, and backend-decided read visibility of `allowed`
or `hidden`.

Slice 4.2 detach lifecycle (#113): production support detaches only existing
active VOC↔VOC `related_to` links via `PATCH /entity-links/:id` with a required
non-empty reason. Detach transitions `status` to `detached`, records
`detached_by`, `detach_reason`, and `detached_at`, and preserves the row; hard
delete and `DELETE /entity-links/:id` are intentionally not used.

Slice 4.3 inventory UI (#114): `GET /entity-links?scope=workspace` lists the
workspace-wide audit inventory across `active`, `stale`, `detached`, and
`revoked` rows, newest first. Filters are read-only: `status`,
`relation_type`, and `managed_system_id`. Production data still only creates
VOC↔VOC `related_to` rows and does not synthesize `stale` or `revoked` rows in
this slice.

Slice 5 (Finding From VOC): introduces the **second** production link pair,
`(voc → finding, created_finding)`, created by `POST /vocs/:id/create-finding`
(`03-api-contracts.md:346`). It also lands the real **entity-link provider
registry** (`06-entity-linking-contract.md`) the #112 tracer stubbed by
hard-coding VOC. ADR-0024 locks Finding read/create authz (`finding.read` /
`finding.manage`), the `finding`-target visibility row (amending ADR-0023 §C),
and the composite tuple CHECK admitting only the two production pairs. `finding`
is a `target_type` only this slice; `created_finding` stays `internal_only`.
The `evidence_of` relation (for `POST /findings/:id/link-evidence`) and the
Survey `generated_finding` relation are unchanged by this slice.

Slice 6 (#132): introduces Task Request as a production link target for the
first Task Request tracer. `POST /findings/:id/request-task` creates
`(finding -> task_request, requested_task)` with `visibility='internal_only'`.
The endpoint creates only a `pending_review` Task Request; approval,
conversion to Task, Link Existing Task, and VOC/VOC Cluster request sources are
deferred to later slices.

## Visibility

```text
- internal_only
- summary_visible
- visible_to_reporter
- admin_only
```

`summary_visible` requires a system-specific summary contract.

ADR-0023 locks the per-(stored-token × actor) decision table, the
`hidden`/`denied` boundary, the deferral of `request_access` for VOC↔VOC, the
canonical Task summary field list, and the forbidden-fields list for Slice 4.4
(#115). The per-request verdict vocabulary is the **UI Visibility Decision**
enum (`allowed | hidden | summary_visible | request_access | denied`,
`CONTEXT.md`).

Canonical Task summary visible to Reporter (per ADR-0023):

```text
- public_title
- reporter_facing_status
- owning_team_public_name optional
- expected_resolution_date optional
- last_public_update_at
- public_update_excerpt optional
```

Reporter Summary must not expose raw Task Status, internal comments, priorities, developer discussion, severity, confidence, internal due dates, root-cause analysis detail, or private notes. It may expose only public-safe linked work information explicitly defined by the source summary contract.

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

Slice 4.2 (#113) implements this for VOC↔VOC `related_to` as `detached` only.
`revoked` remains reserved for future admin/policy flows and `stale` remains
deferred.

### FR-LINK-002: Enforce Visibility

Priority: MUST

Acceptance Criteria:

```text
- internal_only links are not exposed to Reporter.
- summary_visible exposes only the target system's summary contract.
- admin_only is restricted to Admin.
- Source and target permissions are both respected.
- Linked-object UI visibility is backend-decided as allowed, hidden, summary_visible, request_access, or denied.
- Frontend must not synthesize linked-object summaries from raw data that the actor cannot otherwise read.
```

Slice 4.1 exposes only `allowed` and `hidden` visibility states for VOC↔VOC
`related_to` reads. Slice 4.3 extends hidden inventory rows with audit metadata
needed by the read-only table (`status`, `managed_system_id`, `created_by`,
`created_at`, `updated_at`) while still omitting source/target endpoint ids and
any synthesized endpoint summary.

Slice 4.4 (#115) locks the full enforcement in **ADR-0023**: the per-(stored
visibility × actor) decision table, the `hidden`/`denied` boundary, both-side
enforcement on endpoint and inventory reads, the deferral of `request_access`
(unreachable for VOC↔VOC until a requestable link target lands), and the
canonical summary/forbidden-field contract. Effective VOC↔VOC read decisions
are `allowed | hidden | denied`; `summary_visible` is defined but never emitted
for a `voc` target. `POST /entity-links` stays locked to `internal_only`; each
visibility token is enforced via seeded rows, not API-created data.

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
