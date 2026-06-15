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

## Visibility

```text
- internal_only
- summary_visible
- visible_to_reporter
- admin_only
```

`summary_visible` requires a system-specific summary contract.

Example Task summary visible to Reporter:

```text
- public_title
- reporter_facing_status
- expected_resolution_date optional
- owning_team_public_name optional
- last_public_update_at
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
`related_to` reads. Hidden rows carry only link id, endpoint types,
relation_type, and visibility_state.

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
