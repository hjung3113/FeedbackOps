# Milestone

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

Requirement source: FOP-TASK-004 (`docs/design/06-task-project-system.md` §FR-TASK-004). Shared schemas: `packages/shared/src/milestones/index.ts`.

## Milestone Create Contract

`POST /milestones`

```text
requirement_id: FOP-TASK-004
request body (strict, unknown fields rejected):
  title string required min 1 (trimmed)
  why string required min 1 (trimmed)
  primary_managed_system_id uuid required
  owner_actor_id uuid optional
  analytics_area_id uuid nullable optional
  start_date ISO date required
  target_date ISO date required
response body: 201 MilestoneDto
auth and permission: session + workspace; Admin or Developer with
  finding.manage on primary_managed_system_id. Admin bypass follows the same
  finding.manage convention used by Finding actions. A User is denied before
  the Managed System is loaded.
validation errors, in check order:
  - missing Idempotency-Key: 422 validation.failed; key that is not a UUIDv4:
    422 validation.malformed_idempotency_key
  - invalid request body: 422 validation.failed
  - non-elevated caller (User): 403 permission.denied
  - unknown primary_managed_system_id: 404 not_found.record
  - archived Managed System: 409 conflict.parent_archived with parent_archived
    on primary_managed_system_id
  - actor lacks finding.manage on the Managed System: 403 permission.denied
  - unknown or foreign-workspace owner_actor_id: 404 not_found.record
  - owner_actor_id must be an existing actor in the caller's workspace whose
    role is Admin or Developer: an Admin owner uses the same bypass as the
    requester (no finding.manage check); a Developer owner must have
    finding.manage on primary_managed_system_id. A non-elevated owner (User)
    or a Developer owner without finding.manage on the Managed System:
    422 validation.failed with out_of_scope on owner_actor_id
  - unknown or cross-workspace Analytics Area: 404 not_found.record
  - Analytics Area on another Managed System: 422 validation.failed with
    out_of_scope on analytics_area_id
  - archived Analytics Area: 409 conflict.parent_archived with parent_archived
    on analytics_area_id
side effects:
  - create task.milestones row; display_id from core.next_display_id, prefix
    MLS-
  - status column default 'planning'; the request body has no status field
  - owner_actor_id omitted defaults to the calling actor
audit events:
  - milestone_created with detail { milestone_id, display_id,
    primary_managed_system_id }
entity_links created: none
managed_system scope: primary_managed_system_id is required in the body. It is
  the field the Scoped Create Requirements section of 03-api-contracts.md
  means by managed_system_id. It is written on create and never updated: it is
  not a PATCH field.
idempotency behavior: Idempotency-Key required; hash includes the raw request
  body and route identity milestone.create. Reuse of the same key with a
  different body is 409 conflict.idempotency_key_reuse; a matching replay
  returns the stored response.
```

`analytics_area_id`, when present, must belong to `primary_managed_system_id`
and must not be archived. This is the same Analytics Area rule as Task
conversion; the service locks the Managed System before the Analytics Area.

## Milestone List Contract

`GET /milestones`

```text
requirement_id: FOP-TASK-004
query (strict, unknown params rejected):
  managed_system_id optional uuid or all
  status optional planning|in_progress|blocked|released
response body: { items: MilestoneDto[] }
sort: created_at DESC, id DESC
auth and permission: Admin or Developer. Admin sees all workspace Milestones.
  Developer rows are filtered per row by finding.manage on the Milestone
  primary_managed_system_id; out-of-scope rows are omitted, not a list-wide
  403. User is denied with 403 permission.denied.
managed_system scope: managed_system_id=all is the caller's effective Managed
  System scope union, not a workspace bypass.
```

List items are the base MilestoneDto. `source_finding` is detail-only.

## Milestone Detail Contract

`GET /milestones/:id`

```text
requirement_id: FOP-TASK-004
response body: MilestoneDetailDto = MilestoneDto + source_finding
auth and permission: Admin or Developer with finding.manage on the Milestone
  primary_managed_system_id. Admin bypass follows GET /milestones.
validation errors, in check order:
  - id path param is not a UUID: 422 validation.failed
  - non-elevated caller (User): 403 permission.denied, before the row is
    loaded, so a missing Milestone is also 403 for a User
  - missing Milestone, elevated actor: 404 not_found.record
  - Milestone exists but the actor cannot manage it: 403 permission.denied
side effects: none. An archived parent Managed System still allows GET.
audit events: none
```

`source_finding` is a read-only projection:

```text
source_finding: null, or
  { id, display_id, title, summary, evidence_count }
```

It resolves to the oldest Finding whose `linked_milestone_id` equals this
Milestone (ORDER BY created_at ASC, id ASC, LIMIT 1); null when no Finding
links it. There is no writer: no route sets
`finding.findings.linked_milestone_id` (WF-TASK-002 Finding To Milestone is a
future cross-system workflow), and entity_links cannot point at a Milestone.
The list DTO has no source_finding field.

## Milestone Update Contract

`PATCH /milestones/:id`

```text
requirement_id: FOP-TASK-004
headers:
  Idempotency-Key required (UUIDv4)
  If-Match required: the last seen updated_at, ISO timestamp with milliseconds
request body (strict, unknown fields rejected; at least one field required):
  title optional string min 1 (trimmed)
  why optional string min 1 (trimmed)
  owner_actor_id optional uuid
  analytics_area_id optional nullable uuid
  start_date optional ISO date
  target_date optional ISO date
response body: 200 MilestoneDto
auth and permission: Admin or Developer with finding.manage on the Milestone
  primary_managed_system_id. Admin bypass follows the Finding actions
  convention.
validation errors, in check order:
  - id path param is not a UUID: 422 validation.failed
  - missing Idempotency-Key: 422 validation.failed; key that is not a UUIDv4:
    422 validation.malformed_idempotency_key
  - missing or malformed If-Match: 422 validation.failed
  - invalid request body (unknown field, empty body): 422 validation.failed
  - non-elevated caller (User): 403 permission.denied
  - missing Milestone, elevated actor: 404 not_found.record
  - Milestone exists but the actor cannot manage it: 403 permission.denied
  - If-Match does not equal updated_at: 409 conflict.stale_write with
    current_updated_at; the stale action is not applied
  - owner_actor_id uses the same owner rule as create: it must be an existing
    in-workspace Admin or Developer (an Admin owner bypasses finding.manage; a
    Developer owner must have finding.manage on the Milestone's Managed
    System). Unknown or foreign-workspace owner: 404 not_found.record.
    Non-elevated or insufficiently scoped owner: 422 validation.failed with
    out_of_scope on owner_actor_id
  - Analytics Area checks run against the Milestone's Managed System with the
    same errors as create
side effects:
  - update the submitted fields
  - milestone_updated audit with detail { milestone_id, fields }. The audit
    has no from_status / to_status pair today.
optimistic concurrency: If-Match on updated_at. On mismatch the API returns
  the current version and does not auto-merge.
idempotency behavior: Idempotency-Key required; hash includes the raw request
  body, the Milestone id, the If-Match value, and route identity
  milestone.update.
```

`primary_managed_system_id` is not a PATCH field: the Managed System is
immutable after create. `status` is not a PATCH field either; see below.

## Status

Client status is not accepted today. The create and PATCH bodies are strict
and contain no status field; the column default is `planning`. ADR 0050 will
record the confirmed status labels (`planning`, `in_progress`, `blocked`,
`released`) and the lifecycle rules before A-status lands; this section does
not describe a transition graph, and A-status amends it.

## Not implemented

- No DELETE route and no hard delete; `fops_app` holds SELECT, INSERT, UPDATE
  on `task.milestones`.
- No per-milestone Task create, attach, or listing route. A Task carries
  `milestone_id` only from Task conversion
  (`POST /task-requests/:id/convert`, [tasks.md](tasks.md) §Task Conversion
  Contract): unknown or cross-workspace Milestone is 404 not_found.record, a
  Milestone on another Managed System is 422 validation.failed with
  out_of_scope on milestone_id, and null stays valid.
- No Gantt or timeline endpoint.

Shared DTOs: `MilestoneDto` / `MilestoneDetailDto` in
`packages/shared/src/milestones/index.ts`.
