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
- Dashboard, Home, and Integration recovery queue endpoints that expose the same workflow gap must return a stable `recovery_item_id` or equivalent source/action identity.
- Recovery queue inclusion and resolution are backend/domain-service decisions. Frontend clients must not infer that a recovery item is resolved from linked-object presence alone.
- Dashboard recovery queue endpoints may expose user-level snooze or mute state, but that state must not change the recovery item's domain resolution state.
- Dashboard recovery item detail responses must include `recovery_item_id`, recovery reason, source identity, safe affected-object summaries, permission-filtered `next_actions`, presentation state such as snooze or mute, and route intents for source-object jumps.
- Recovery detail responses must distinguish gap visibility from source-object visibility. A response may include a summary-safe recovery item while hiding source titles, source route intents, or blocked actions according to backend visibility decisions.
- Dashboard recovery queue responses must include backend-computed priority, severity, and reason codes when the UI needs ordering or emphasis. Clients may sort or group provided values but must not compute operational priority independently.
- Dashboard recovery queue responses may include `responsible_actor_hint`, derived from the source object's owner, reviewer, assignee, permission reviewer, or workflow policy. Recovery items must not expose independent owner mutation.
- Dashboard metric responses must include `computed_at` when values may be stale. Active recovery queues should prioritize current workflow state over metric cache freshness. Resolved recovery items are removed from active queues but remain available in Dashboard activity/history for three months. History responses expose safe summaries and resolution metadata only; source-object jumps require current permission checks.
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
stale_object_version
action_no_longer_available
recovery_item_resolved
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
- entity_links created, updated, detached, or revoked
- dashboard queues affected
- managed_system scope and default owner/reviewer resolution when applicable
- idempotency behavior
```

Audit-sensitive mutation endpoints must require an optimistic concurrency token
such as `expected_version` or `last_seen_at`. On mismatch, APIs must return a
conflict-style response with the current object version and must not auto-merge
or apply the stale action. This applies to reporter-facing status changes,
Public Update send, Task Request approval, Permission approval or rejection, and
Survey evidence attachment to VOC.

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
Any AD-authenticated Actor may call `POST /vocs` to create their own VOC
without a Permission Request. Permission checks still validate workspace
membership and that the selected Managed System is available for VOC submission,
but Task, Finding, Developer, or Admin permissions are not required to submit
VOC.

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

Reporter-facing VOC Status may be changed only by workspace Admin or Developer
within the same Managed System Permission Scope, through an explicit Public
Update flow or reporter-status review action. Task Done, Task Released,
Reporter Reply, and cluster bulk update candidates must not automatically
change reporter_facing_status. Status changes are per-VOC audited decisions and
should return whether a Public Update was created, skipped with reason, or still
recommended.

MVP APIs must not expose a direct bulk reporter_facing_status mutation. Bulk or
cluster endpoints may return status update candidates and shared draft content,
but apply requests must resolve into separate per-VOC status decisions, Public
Update records or skip reasons, and audit events.

Status-change requests that omit Public Update creation must include
`skip_public_update: true` and a non-empty `skip_reason`. The audit event must
record `public_update_created` or `skipped_with_reason`, the previous and next
reporter_facing_status, actor id, managed_system_id, and source action id.

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

## Next Action Contract

Backend responses for work-object detail and queue rows must provide
permission-filtered `next_actions` when an object has actionable workflow steps.
The frontend renders and invokes these actions; it must not infer action
eligibility from status fields, Role Level labels, or linked-object presence.

`next_actions` are derived by application services from permissions, Managed
System scope, workflow state, reporter-facing status, linked entities, policy
configuration, default owner/reviewer rules, and special capabilities such as
Task Request self-approval.

Survey Result and Survey Response endpoints use the same `next_actions`
contract for follow-up actions. Poor outcome recommendations must be returned as
API-provided priority or `recommended_action_id`, not inferred by the frontend
from score thresholds alone. Recommendation reasons must use domain-safe summary
text and must not expose hidden response detail.

`attach_evidence_to_existing_voc` may be returned only when eligible target VOCs
exist in the actor's effective Managed System scope, the actor may see
summary-visible VOC context, Survey evidence attachment is policy-allowed, and
anonymous or identity-protected response data can be represented with safe
summary fields. The action must not offer a create-new-VOC fallback.
Linked surfaces must not receive raw anonymous or identity-protected Survey
response text or respondent identity unless the actor has explicit personal
response viewing permission for the Survey source route.
Survey safe summaries for linked surfaces are produced by backend application
services using deterministic templates, aggregate counts, configured labels,
score bands, selected tags, and redacted approved highlight excerpts. LLM output
must not be the default mechanism for enforcing anonymity or permission-safe
summaries.
Safe summaries may be localized to workspace default language or viewer UI
locale, but raw free-text responses and approved excerpts remain in source
language unless a later assistive translation draft is explicitly requested.
Survey result filters must enforce the configured anonymity threshold, default
5 responses, by hiding aggregates or merging buckets for actors without personal
response viewing permission. Workspace Admin does not bypass the threshold
without explicit personal response viewing permission.
Free-text Evidence Highlights require user selection or approval before they
are attached to another object. Automatic candidates may be returned only as
draft suggestions and must pass redaction and permission checks first.
When Survey evidence is attached to a Closed VOC, the attachment must not
automatically reopen the VOC or change reporter_facing_status. If communication
may be needed, the response should include `review_reporter_status` or
`write_public_update` as follow-up `next_actions`.
Survey evidence attachment to an existing VOC must not resolve poor Outcome
Survey follow-up recovery by itself; resolution requires Finding, Task Request,
linked execution work, or an explicit no-follow-up-needed decision.
No-follow-up-needed actions require Admin or same Managed System Developer
workflow capability, a non-empty reason, managed_system_id, source object,
previous recovery state, and affected recovery item ids. Reversal uses a
separate audited reopen-follow-up action that supersedes the decision and
triggers recovery item re-evaluation.
Undoing Survey evidence attachment detaches or revokes the entity_link through a
separate audited action. It must not hard-delete the Evidence Highlight or erase
canonical link history.

Common VOC `next_actions` include:

```text
assign_owner
request_reporter_info
write_public_update
create_finding
request_task
mark_no_follow_up
review_reporter_status
```

Each action item should include an action id, label, target endpoint or route
intent, disabled or blocked reason when applicable, and confirmation metadata
for irreversible or audit-sensitive actions.

Audit-sensitive actions must include backend-provided confirmation metadata.
This includes reporter-facing status changes, Public Update send actions,
Permission Request approval or rejection, Task Request approval, and protected
Survey evidence attachment to VOC. Clients must render the provided confirmation
title, body, risk level, required reason flags, and audit event intent instead
of inventing generic confirmation copy.

Action visibility states:

```text
available: actor can execute the action now.
blocked_requestable: actor cannot execute now, but may request permission or missing prerequisites.
blocked_not_requestable: actor may know the action exists, but cannot request or execute it in the current context.
hidden: actor must not know the action exists for this object.
```

The backend decides the visibility state. The frontend must not downgrade
`hidden` into a disabled control or upgrade blocked actions into visible
permission requests without an API-provided state and reason.

When an action is `blocked_requestable`, the response must include the allowed
permission request scope candidates or prerequisite request intent. Clients must
submit one of those candidates and must not synthesize broader scopes.

Failed `next_actions` executions must return a structured action failure
payload, not only a generic error. Include `action_id`, `failure_code`,
domain-safe message, `retryable`, requestable permission candidates when
applicable, and `current_object_version` when stale state caused the failure.
Use `action_no_longer_available` when workflow state changed and
`recovery_item_resolved` when the underlying recovery item was already resolved.
Resolved recovery item responses should include resolution metadata such as
`resolved_by_action_id`, `resolved_at`, `resolution_source_type`,
`resolution_source_id`, and `resolved_by_actor_id` when actor visibility allows.
When actor identity is not visible, return a safe actor label or omit the actor.

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

Task Request stores the source link, evidence summary, requested outcome,
Primary Managed System, requester, reviewer decision, and review notes.
Execution fields such as Task title, assignee, priority, due date, optional
Milestone, optional Analytics Area, and execution notes are finalized during
Convert to Task. APIs may suggest defaults from the source object or Task
Request, but conversion must explicitly persist the final Task fields.

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
Approval and conversion are separate domain events. The API may expose an
approve-and-convert convenience flow, but it must record both
`task_request_approved` and `task_created_from_request` or
`task_request_linked_existing_task` as separate audit/side-effect events.
Approved Task Requests may remain in `approved` state until converted or linked
to an existing Task.
Converted Tasks start in Backlog by default. Backlog Tasks may have assignees,
but execution has not started until the Task moves to Todo or Doing.

## Required MVP Endpoints

### VOC

```text
POST /vocs
GET /vocs
GET /vocs/:id
PATCH /vocs/:id
PATCH /vocs/:id/description
POST /vocs/:id/create-finding
POST /vocs/:id/request-task
POST /vocs/:id/public-updates
POST /vocs/:id/reporter-replies
POST /vocs/:id/internal-comments
```

### PATCH /vocs/:id/description — Reporter pre-triage edit (Slice 3 #17)

| Aspect | Contract |
|---|---|
| Purpose | Reporter-only edit of `title` / `description_rich_content` / `attachments` while VOC is in `triage_state='untriaged'`. Closes Slice 3 BE exit criterion (`docs/implementation/08-mvp-slice-plan.md`). |
| Headers | `Idempotency-Key: <uuidv4>` (required) · `If-Match: <updated_at ISO>` (required) · `Authorization: Bearer <session>` |
| Body | `{ title?: 1..200, description_rich_content?: TipTapDoc, attachments?: AttachmentRef[] }` — at least one field; `.strict()` (zod) rejects unknown keys |
| Forbidden fields (UX-named) | `severity`, `owner_user_id`, `owner_team_id`, `analytics_area_id`, `triage_state`, `cluster_decision`, `reporter_facing_status`, `source_context`, `primary_managed_system_id`, `reporter_id`, `archived_at`, `workspace_id`, `display_id`, `id`, `created_at`, `updated_at` → 422 `validation.unexpected_field` |
| Permission | `actor.actor_id === voc.reporter_id` — exclusive. Admin / Developer (with capability) / any non-reporter → 403 `permission.denied`. No admin elevation on this endpoint. |
| State gate | `voc.triage_state === 'untriaged'` — else 409 `conflict.triage_already_committed` with `detail.current_triage_state` |
| Optimistic concurrency | `If-Match` compared against `voc.updated_at`; mismatch → 409 `conflict.stale_write` with `detail.current_updated_at` |
| Service ordering | `SELECT FOR UPDATE voc → reporter check → state gate → If-Match → SELECT FOR UPDATE managed_system → sanitize description (surface `voc-description`) → attachments rejection (non-empty → 422 `attachment.unsupported_pending_storage_slice`) → diff → UPDATE (only when diff is non-empty) → audit emit → refresh envelope` |
| Empty-diff semantics | If sanitizer normalizes input to match current row (per-field check; description hashed via `stableStringify` → SHA-256) → 200 returns current envelope without bumping `updated_at` and without emitting an audit row. Idempotency cache still records the 200 envelope so replay is byte-equal. |
| Audit event | `voc_description_edited` with `changes: { title?: {from, to}, description_rich_content?: {from_hash, to_hash}, attachments?: {from, to} }` (per-field shape; non-empty required). |
| Idempotency hash | Includes `vocId`, `ifMatch`, route, and request body — a retry with a refreshed `If-Match` (post-409 refetch) produces a new hash; client must mint a fresh `Idempotency-Key` for each distinct `If-Match` value (same caveat as `PATCH /vocs/:id`). |
| Rate limit | 30/min per actor — dedicated `reporterEdit` bucket, separate from the 10/min `mutation` tier. |
| Error codes | `validation.failed` · `validation.unexpected_field` · `permission.denied` · `not_found.record` · `conflict.triage_already_committed` (new in #17) · `conflict.stale_write` · `conflict.record_archived` · `conflict.parent_archived` · `conflict.idempotency_key_reuse` · `rich_content.disallowed_node` · `rich_content.external_image_forbidden` · `attachment.unsupported_pending_storage_slice` · `rate_limited.actor` |

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
