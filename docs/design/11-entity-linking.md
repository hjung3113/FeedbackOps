# Entity Linking

## Purpose

Entity Link is the loose coupling layer between VOC, Finding, Task / Project, Survey, Dashboard, and Permission.

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

## Relation Types

Common:

```text
- related_to
- evidence_of
- supports
- validates
- follow_up_for
```

VOC:

```text
- clustered_into
- supports_existing_voc
- created_finding
```

Survey:

```text
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

## Functional Requirements

### FR-LINK-001: Create Entity Link

Priority: MUST

Acceptance Criteria:

```text
- Authorized users can link supported entity pairs.
- Link stores relation_type and visibility.
- Link creation is audited for sensitive relations.
```

### FR-LINK-002: Enforce Visibility

Priority: MUST

Acceptance Criteria:

```text
- internal_only links are not exposed to Reporter.
- summary_visible exposes only the target system's summary contract.
- admin_only is restricted to Admin.
- Source and target permissions are both respected.
```

### FR-LINK-003: Support Dashboard Missing-Link Queries

Priority: MUST

Acceptance Criteria:

```text
- Dashboard can query records without expected relation types.
- Dashboard can detect stale or missing workflow links.
- Missing-link detection does not require hard-coded foreign keys for every relationship.
```

## Direct Foreign Keys vs Entity Links

Recommended:

```text
- VOC / Task / Survey / Finding can store product_area_id directly.
- Strong ownership relationships can use direct foreign keys.
- Cross-system, optional, or many-to-many relationships use entity_links.
```

## Cross-System Dependencies

```text
- 10-cross-system-workflows.md defines expected links.
- 09-permission-access.md defines visibility enforcement.
- 08-dashboard-system.md depends on missing-link queries.
```

## Out Of Scope For MVP

```text
- Arbitrary user-defined relation types
- Visual graph explorer
- Cross-workspace links
```
