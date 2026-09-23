# Cross-System Endpoints

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Reporter Summary Contract

Reporter-visible linked-work summaries must return only:

```text
public_title
reporter_facing_status
owning_team_public_name
expected_resolution_date optional
last_public_update_at
public_update_excerpt
```

Reporter Summary must not expose raw task status, backlog priority, internal
comments, individual Developer names, internal due dates, root-cause detail,
severity, confidence, or private notes.

## Cross-System Endpoint Decisions

These decisions pin the MVP endpoints that are easiest for implementation
agents to misread. Detailed relation semantics live in
`docs/implementation/06-entity-linking-contract.md`.
The entity-link VOC visibility requirement is recorded in `docs/adr/0047-entity-link-voc-read-required-not-triage.md`.

Source-shaped routes may exist for clarity and discoverability. The source
module may host request parsing for routes such as
`POST /vocs/:id/create-finding`, but it must not write target-owned tables
directly. Target writes must run through the target module's application command
or an approved cross-system orchestration service that also writes links, audit
events, and dashboard repair signals.

| Endpoint | Requirement | Source | Target | Relation Type | Audit Event | Dashboard Effect | Forbidden Alternative |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /vocs/:id/create-finding` | FOP-FIND-001 | VOC | Finding | `created_finding` | finding_created_from_voc | resolves configured synthesis action for source VOC | creating generated VOCs |
| `POST /voc-clusters/:id/create-finding` | FOP-FIND-001 | VOC Cluster | Finding | `created_finding` | finding_created_from_voc_cluster | resolves configured synthesis action for cluster | creating generated VOCs |
| `POST /survey-responses/:id/create-finding` | FOP-SURVEY-005 | Survey Response | Finding | `generated_finding` | finding_created_from_survey_response | resolves configured synthesis action for survey response | `POST /survey-responses/:id/create-voc` |
| `POST /vocs/:id/request-task` | FOP-TASK-001 | VOC | Task Request | `requested_task` | task_request_created_from_voc | moves VOC follow-up to pending execution review | creating Task directly from VOC follow-up |
| `POST /voc-clusters/:id/request-task` | FOP-TASK-001 | VOC Cluster | Task Request | `requested_task` | task_request_created_from_voc_cluster | moves cluster follow-up to pending execution review | creating Task directly from VOC Cluster follow-up |
| `POST /findings/:id/request-task` | FOP-TASK-001 | Finding | Task Request | `requested_task` | task_request_created_from_finding | moves Finding to pending execution review | creating Task without review when review is required |
| `POST /survey-findings/:id/request-task` | FOP-SURVEY-005 | Finding | Task Request | `requested_task` | task_request_created_from_survey_finding | moves survey-derived Finding to pending execution review | |
| `POST /task-requests/:id/convert` | FOP-TASK-002 / FOP-TASK-003 | Task Request | Task | `converted_to` | task_created_from_request | satisfies approved execution candidate | folding conversion into approval |
| `POST /task-requests/:id/link-task` | FOP-TASK-002 / FOP-TASK-003 | Task Request | Task | `converted_to` | task_linked_to_request | satisfies approved execution candidate with existing work | creating duplicate Task when suitable Task exists |
| `POST /permission-requests/:id/approve` | FOP-PERM-002 | Permission Request | Permission Grant | none | permission_request_approved (미구현 as of Slice 6) | may restore blocked object visibility | bypassing explicit deny checks |
| `POST /permission-requests/:id/reject` | FOP-PERM-002 | Permission Request | Permission Deny | none | permission_request_rejected (미구현 as of Slice 6) | keeps or creates permission-blocked state | exposing full restricted object |

Task Request review may be performed by a workspace Admin or by a Developer in
the same Managed System Permission Scope. MVP allows a Developer to approve
their own Task Request only when they have explicit `task_request.self_approve`
capability within that scope. Self-approval requires a reason and must audit
`self_approval: true`, `sensitive: true`, and the reason.
Approval and conversion are separate domain events. The API may expose an
approve-and-convert convenience flow, but it must record both
`task_request_approved` and `task_created_from_request` or
`task_linked_to_request` as separate audit/side-effect events.
Approved Task Requests may remain in `approved` state until converted or linked
to an existing Task.
Converted Tasks start in Backlog by default. Backlog Tasks may have assignees,
but execution has not started until the Task moves to Todo or Doing.
