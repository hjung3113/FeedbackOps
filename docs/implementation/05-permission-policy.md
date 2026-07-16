# Permission Policy

## Purpose

This document defines implementation rules for authorization, permission requests, and safe linked-object visibility.

## Role Level And Capability

```text
Role Levels:
- Admin
- Developer
- User
```

Role Level controls authority; backend capability checks are authoritative.
Admin is workspace-level in MVP. Developer is granted per Managed System
Permission Scope. User is the lowest role level and may submit VOC and access
their own allowed work. Reporter is the Actor who submitted a specific VOC, not
a separate role level.

Capability vocabulary is module-prefixed (`{module}.{action}`,
`packages/shared/src/enums/capabilities.ts`). Slice 5 (ADR-0024) adds
`finding.read` (read a Finding / its entity links) and `finding.manage`
(create/update a Finding). Both are Developer-requestable per Managed System and
are NOT sensitive. Reading or creating a Finding is Admin (workspace) or
Developer scoped to the Finding's `primary_managed_system_id`; User and Reporter
never read Findings. Creating a Finding from a VOC additionally requires
`voc.read` on the source VOC's Managed System (no forging a Finding from an
unreadable VOC). Slice 6 issue #133 adds `task_request.self_approve` for
same-requester Task Request approval. It is Developer-requestable per Managed
System and sensitive. Slice 6 issue #134 introduces Task conversion and
Link Existing Task without a new capability; both reuse `finding.manage` on the
Task Request or Task Primary Managed System, with Admin bypass. Slice 6 issue
#135 keeps Task Detail reads and Finding Link Task on the same boundary:
Admin or Developer with `finding.manage` on the relevant Primary Managed
System; User is denied.
Slice 6 issue #136 extends Task Request creation to VOC and VOC Cluster sources
without adding a new capability. `POST /vocs/:id/request-task` mirrors
`POST /vocs/:id/create-finding`: source VOC readability plus `finding.manage`
on the source Primary Managed System, with Admin bypass. `POST
/voc-clusters/:id/request-task` mirrors cluster create-finding authority:
Admin or Developer with `finding.manage` on the cluster Primary Managed System.

## Permission Check Order

```text
1. Validate workspace context.
2. Check explicit deny.
3. Check direct capability grant.
4. Check role-derived capability.
5. Check scoped Managed System permission.
6. If denied, determine whether request access is allowed.
```

Explicit Deny overrides general Allow.

Managed System Permission Scope is the MVP authorization boundary for
Developer access. Access to one Managed System does not grant access to sibling
Managed Systems. Analytics Area is not an MVP permission boundary.

Permission scope shape:

```text
workspace_id required
managed_system_id optional for Admin, required for Developer-scoped grants
object_type/object_id optional
```

Admin grants may omit managed_system_id when the capability is workspace-level.
Developer grants must include managed_system_id for scoped VOC triage,
Findings, Task Requests, Tasks, Surveys, Dashboard queues, Public Updates, and
Internal Comments. Analytics Area filters may narrow a list query but must not be
used as the source of authorization.
Analytics Area owner_team_id may route or prefill ownership, but it does not
grant Managed System scope. Assignment to an owner or reviewer that lacks the
required Managed System permission must fail validation or enter the permission
request flow.

For list filters, managed_system_id=all means the actor's effective Managed
System scope union. Workspace Admin can receive true workspace-wide results.
Developers receive only records in their granted Managed System scopes, even
when the frontend URL says all.

## Sensitive Permissions

Sensitive permission requests require a reason:

```text
- Task backstage access
- specific Managed System access
- Survey creation
- Survey personal response access
- Export
- Admin permission
- Public Update creation
- Task Request self-approval
```

Scoped Developer permission requests should include a requested expiration. If
the requester omits one, the API applies a default expiration such as 30 days.
Admins may approve a longer or permanent grant when policy allows. Workspace
Admin-level grants should not be offered through ordinary blocked-action request
flows in MVP; they require an explicit Admin governance path.

When a permission grant expires, previously opened objects or actions that
depended on that grant must stop executing privileged actions. Open panels should
move to a permission-lost or stale state and offer request-access when policy
allows.

Task Request self-approval is not included in the default Developer scoped
review permission. A Developer may approve their own Task Request only when a
grant includes `task_request.self_approve` for the same managed_system_id. The
review request must include a reason and the approval audit event records
`self_approval: true`, `sensitive: true`, and the reason.

## Permission Request Lifecycle

```text
pending
-> needs_more_info -> pending
-> approved | rejected | expired | revoked
```

`needs_more_info` keeps the same Permission Request identity. Requester
supplementation moves the same request back to `pending`; it must not create a
new request for the same source object, source action, and requested scope.

Permission requests may originate from blocked linked objects, blocked
`next_actions`, or explicit Admin request flows. Requests created from blocked
UI must persist source context when available:

```text
source_object_type optional
source_object_id optional
source_action_id optional
requested_scope
reason
requested_expiration optional
more_info_request optional
return_route_intent optional
```

For `blocked_requestable` actions, the backend must provide the minimum
requestable scope candidates. Frontend clients may render and submit only those
API-provided candidates; they must not invent broader workspace, all-managed-
system, or Admin scopes from local status, role, or route context.

Admin review responses must include requester identity, current role/scope,
requested capability, requested scope, safe source summary when available,
reason, risk indicators, requested expiration, explicit deny state, and allowed
decision actions.

The admin review queue is read via `GET /permissions/requests` (the legacy
`GET /permission-requests` remains compatible), which returns the workspace's
open (`pending` | `needs_more_info`) requests and a `count` by default. Admins
may request `?status=pending|needs_more_info|approved|rejected|all` to review
decided rows. The endpoint is gated by `workspace.admin`; a non-admin caller
receives `permission.denied` (`403`). The caller-scoped variant
`GET /permission-requests/mine` requires only a session (an Actor may always
read their own open requests).

Rejected Permission Requests must not be immediately resubmitted for the same
source object, source action, and requested scope unless the rejection response
allows appeal, requests more information, or provides `retry_after`. This keeps
Admin review queues from becoming repeated-denial loops while still allowing
corrected or supplemented requests.

After approval, the API response should provide enough route intent for the
frontend to return the requester to the originally blocked object or action
when possible.

Approval must not automatically execute the originally blocked domain action.
Permission approval and domain mutation are separate audited actions; after
approval, the requester returns to the original object or action and explicitly
runs it again.

### Admin decision lifecycle

Only a request in `pending` or `needs_more_info` is decidable. The four
administrator endpoints all require `workspace.admin`, lock the request row,
and write the request change plus its audit row in one transaction:

```text
POST /permissions/requests/:id/approve         { reason?: string }
POST /permissions/requests/:id/reject          { reason: string }
POST /permissions/requests/:id/need-more-info  { note: string }
POST /permissions/requests/:id/deny            { reason: string }
```

- Approve copies the requested capability, Managed System scope, and expiration
  verbatim into a real `permission_grants` row, then sets the request to
  `approved`. It never auto-runs the blocked action.
- Reject sets the request to `rejected`; it does not mint a grant.
- Need-more-info sets it to `needs_more_info`; the note is kept in audit detail.
- Explicit deny copies the requested capability and Managed System scope into a
  real `permission_denies` row and sets the request to `rejected`. A
  workspace-wide deny takes precedence over every grant; a Managed-System-scoped
  deny takes precedence only for checks in that same Managed System.
- Reject, deny, and need-more-info require a non-empty trimmed reason/note.
  Approve requires one only for `isSensitiveCapability`; it is optional for a
  non-sensitive capability. Reviewers cannot alter requested scope or expiry.
- Unknown request IDs are `not_found.record` (`404`); non-decidable requests
  are `conflict.stale_write` (`409`). Duplicate active grants/denies are
  `conflict.capability_already_granted` / `conflict.capability_already_denied`.
  `Idempotency-Key` replays the stored decision response without a second write.

Audit events:

```text
permission_requested
permission_approved
permission_rejected
permission_needs_more_info
permission_denied
task_request_approved
task_request_rejected
task_request_needs_more_evidence
task_request_self_approval_denied
task_request_created_from_voc
task_request_created_from_voc_cluster
task_created_from_request
task_linked_to_request
```

Revoke and expiry endpoints are not implemented yet. Planned event names remain:

```text
permission_more_info_submitted
permission_revoked
permission_expired
```

## Summary-Visible Contract

When entity link visibility is `summary_visible`, the target module returns a safe summary.

ADR-0023 is the authoritative summary contract (Slice 4.4 #115): canonical Task
field list, forbidden-field list, and the decision table. The fields below are
the canonical list ADR-0023 reconciles to. No `voc` summary exists; `summary_visible`
is not emitted for a `voc` target, and the runtime `getReporterSummary` resolver
lands with the first non-VOC link target, not in #115.

Dashboard recovery visibility may be summary-safe even when the underlying
source object is not fully visible. Gap visibility, source-object visibility,
source jump visibility, and action visibility are separate backend decisions.
If the source object is hidden, the response may expose only a safe recovery
category and domain-safe summary fields; it must not expose raw titles,
descriptions, reporter identity, personal Survey response detail, or private
linked-object content.

Task summary visible to Reporter:

```text
public_title
reporter_facing_status
owning_team_public_name
expected_resolution_date optional
last_public_update_at
public_update_excerpt
```

Forbidden in reporter summary:

```text
- internal comments
- internal assignee notes
- raw task status
- backlog priority
- individual Developer names
- internal due dates
- root-cause detail
- severity
- confidence
- private customer or survey response details
- permission decision internals
```

Public Update may be written only by workspace Admin or Developer in the same
Managed System Permission Scope. Reporter Reply may be written only by the
Reporter on their own VOC. Internal Comment remains private to authorized
Admins and same-scope Developers.

## Frontend Permission States

```text
hidden_existence
summary_visible
request_access
blocked_non_requestable
pending_request
approved
rejected
expired
revoked
```

The backend decides which state applies.
