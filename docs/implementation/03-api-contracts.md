# API Contracts

## Purpose

This document is the implementation-facing API contract.
`docs/design/14-api-draft.md` is design input only where not restated here.

Detailed endpoint schemas may later move into OpenAPI, but this document remains the behavioral contract.

## Global API Rules

```text
- All workspace-scoped endpoints validate workspace context.
- All mutating endpoints check permission before writing.
- Cross-system creation endpoints preserve source context.
- Cross-system creation endpoints create required entity_links in the same application transaction when possible.
- Sensitive decisions emit audit events.
- APIs must not expose Survey Response -> Create VOC.
- APIs must not expose generated_voc relation_type.
- List endpoints for Tasks, Task Requests, Findings, VOC triage, Surveys, and Dashboard queues must accept managed_system_id filters where scoped data can appear.
- Backend responses must exclude objects outside the actor's effective Managed System Permission Scopes.
- managed_system_id=all means the actor's effective Managed System scope union. Only workspace Admin receives true workspace-wide results.
- Managed System scope is the MVP filter, defaulting, and Developer permission context; APIs must not create separate per-Managed-System VOC, Survey, Task, or Integration route trees.
- Analytics Area filters are allowed only within the selected Managed System and do not grant authorization.
- Work Initiative or Project identifiers may appear only as future execution grouping fields and must not replace managed_system_id in MVP-scoped records.
- Rich content fields must reference inline images through attachment IDs, not base64 body data or external image URLs.
```

## Standard Error Codes

```text
validation_failed
unauthorized
permission_denied
not_found
workspace_mismatch
conflict
invalid_transition
link_visibility_denied
link_creation_failed
audit_write_failed
```

## Endpoint Contract Template

Each endpoint must define:

```text
- requirement_id
- method and path
- request body
- response body
- auth and permission
- validation errors
- side effects
- audit events
- entity_links created or updated
- dashboard queues affected
- managed_system scope and default owner/reviewer resolution when applicable
- idempotency behavior
```

## Default Owner / Reviewer Resolution

When creating VOC, Finding, Task Request, Task, or Survey work tied to a Managed System, application services resolve default owner or reviewer from:

```text
1. explicit request field when permitted
2. Managed System default owner / reviewer
3. Analytics Area owner team or routing hint within the same Managed System
4. workspace fallback queue
```

Resolved defaults are written to actual owner/reviewer fields and must be returned in creation responses when they affect routing, triage, review, or audit behavior. Default owner does not mark VOC triage complete, and default reviewer does not mark Task Request review complete. Analytics Area owner team is a routing/defaulting hint only and must not grant authorization. If a resolved owner or reviewer lacks required Managed System scope, the API returns validation_failed or a permission-requestable response instead of silently granting access. Creation responses and audit metadata should indicate default_resolved, the source rule, and managed_system_id. Failure to resolve a required reviewer returns validation_failed rather than creating unowned review work.

If a request includes analytics_area_id, the API must validate that the
Analytics Area belongs to the same managed_system_id. Analytics Area ownership must not
broaden or narrow the caller's Managed System Permission Scope.

## VOC Create And Conversation Contract

`POST /vocs` request body must include:

```text
managed_system_id required
title required
description rich content required
analytics_area_id optional
source_context optional enum: direct_use | proxy_report | operational_discovery | stakeholder_request
attachments optional attachment references
```

`POST /vocs` must not accept:

```text
reporter_id
severity
reporter_facing_status
task_status
```

Reporter is derived from the authenticated Actor. Severity is assigned during
triage by an authorized Admin or same-Managed-System Developer. The Reporter
may edit title, description, and attachments only before triage begins. After
triage begins, additional Reporter input must be captured through Reporter
Reply, not by mutating the original description.
MVP has no affected_user field; proxy-report context is captured in the VOC
description.

VOC conversation endpoints:

```text
POST /vocs/:id/public-updates
- Admin or Developer in the same Managed System Permission Scope only.
- Creates reporter-visible Public Update.

POST /vocs/:id/reporter-replies
- Reporter on their own VOC only.
- Creates reporter-visible Reporter Reply and may return Waiting Reporter VOCs to the follow-up queue.

POST /vocs/:id/internal-comments
- Admin or Developer in the same Managed System Permission Scope only.
- Creates private Internal Comment.
```

Conversation entries are append-only in MVP. The API does not expose general
edit/delete, mention, reaction, read receipt, or threaded reply behavior. Admin
moderation delete may be added later as an explicit audit-backed endpoint.

Public Update, Reporter Reply, Internal Comment, and VOC description fields use
rich content. Backend validation must sanitize/render safely, enforce
attachment visibility, reject base64 inline body images, and prevent external
image URLs from rendering inline.

VOC Cluster is not a reporter-visible object in MVP. Cluster-level bulk update
behavior may generate a candidate only; applying it creates separate Public
Update records for selected VOCs and does not automatically change
reporter_facing_status.

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

## Scoped Create Requirements

MVP create endpoints for these records must require managed_system_id, or must
derive it from a source record that already has exactly one Primary Managed
System:

```text
VOC
Finding
Task Request
Task
Survey
```

Standalone `POST /tasks` creates internal work from the Tasks surface. VOC and
Finding follow-up must create Task Request first; approved Task Requests are
then converted to Tasks.

## Cross-System Endpoint Decisions

These decisions pin the MVP endpoints that are easiest for implementation
agents to misread. Detailed relation semantics live in
`docs/design/11-entity-linking.md`.

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
| `POST /findings/:id/request-task` | FOP-TASK-001 | Finding | Task Request | `requested_task` | task_request_created_from_finding | moves Finding to pending execution review | creating Task without review when review is required |
| `POST /survey-findings/:id/request-task` | FOP-SURVEY-005 | Finding | Task Request | `requested_task` | task_request_created_from_survey_finding | moves survey-derived Finding to pending execution review | Survey Response creates VOC |
| `POST /permission-requests/:id/approve` | FOP-PERM-002 | Permission Request | Permission Grant | none | permission_request_approved | may restore blocked object visibility | bypassing explicit deny checks |
| `POST /permission-requests/:id/reject` | FOP-PERM-002 | Permission Request | Permission Deny | none | permission_request_rejected | keeps or creates permission-blocked state | exposing full restricted object |

Task Request review may be performed by a workspace Admin or by a Developer in
the same Managed System Permission Scope. MVP allows a Developer to approve
their own Task Request only when they have explicit task_request_self_approval
capability within that scope. Self-approval requires a reason and must audit
self_approved, reason, source_entity, and managed_system_id metadata.
Converted Tasks start in Backlog by default. Backlog Tasks may have assignees,
but execution has not started until the Task moves to Todo or Doing.

## Required MVP Endpoints

### VOC

```text
POST /vocs
GET /vocs
GET /vocs/:id
PATCH /vocs/:id
POST /vocs/:id/create-finding
POST /vocs/:id/request-task
POST /vocs/:id/public-updates
POST /vocs/:id/reporter-replies
POST /vocs/:id/internal-comments
```

### VOC Cluster

```text
POST /voc-clusters
GET /voc-clusters
GET /voc-clusters/:id
PATCH /voc-clusters/:id
POST /voc-clusters/:id/vocs
DELETE /voc-clusters/:id/vocs/:voc_id
POST /voc-clusters/:id/create-finding
```

Cluster membership changes are audited. MVP cluster APIs must not merge VOC
records. Cluster merge and split endpoints are out of scope for MVP.

### Finding

```text
POST /findings
GET /findings
GET /findings/:id
PATCH /findings/:id
POST /findings/:id/evidence-highlights
POST /findings/:id/link-evidence
POST /findings/:id/request-task
POST /findings/:id/link-task
```

Finding-to-Milestone linking is future cross-system behavior and is not an MVP
Finding endpoint.

### Task

```text
POST /task-requests
GET /task-requests
GET /task-requests/:id
POST /task-requests/:id/approve
POST /task-requests/:id/reject
POST /task-requests/:id/request-more-evidence
POST /task-requests/:id/convert-to-task
POST /task-requests/:id/link-existing-task

GET /tasks
GET /tasks/:id
POST /tasks
PATCH /tasks/:id
```

### Survey

```text
POST /surveys
GET /surveys
GET /surveys/:id
POST /surveys/:id/responses
GET /surveys/:id/results
POST /survey-responses/:id/create-finding
POST /survey-findings/:id/request-task
POST /survey-findings/:id/link-task
# future: POST /survey-findings/:id/link-milestone
```

### Core / Managed System / Analytics Area

```text
GET /managed-systems
POST /managed-systems
PATCH /managed-systems/:id
POST /managed-systems/:id/archive
GET /analytics-areas
POST /analytics-areas
PATCH /analytics-areas/:id
POST /analytics-areas/:id/archive
```

### Permission

```text
POST /permission-requests
GET /permission-requests
POST /permission-requests/:id/approve
POST /permission-requests/:id/reject
POST /permission-requests/:id/revoke
```

### Entity Links

```text
POST /entity-links
GET /entity-links
PATCH /entity-links/:id
DELETE /entity-links/:id
```

## Forbidden Endpoint

```text
POST /survey-responses/:id/create-voc
```

If compatibility handling is ever needed, return `404` or `410`. Never create a VOC or `generated_voc` link from a Survey Response.
