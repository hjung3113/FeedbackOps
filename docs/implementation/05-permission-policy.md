# Permission Policy

## Purpose

This file owns permission check order, audit event verbs, sensitive-capability rules, and permission-request decision mechanics.
What the default user can do, and the capability matrix, live in docs/design/09-permission-access.md. Do not copy that matrix here.

ADR-0066 (accepted 2026-10-13) adds proposed/new revision, withdrawal/edit,
supported narrowing, selected risk detail, direct-grant and superseded-row behavior.
These accepted contracts are implementation work; this docs change ships none of them.

## Role Level And Capability

Role Level controls authority; backend capability checks are authoritative.
Reporter is the Actor who submitted a specific VOC, not a separate role level.

Role meanings, the default-user boundary, and the capability matrix: docs/design/09-permission-access.md (AD Principle, Default User Can / Cannot, Capability Matrix). Adding a Role Level follows
`docs/adr/0048-role-level-extension.md`: the shared enum, the
`actors_role_level_check` constraint, `roleSatisfies`, and the domain gates
that compare `role_level` move together.

Capability vocabulary is module-prefixed (`{module}.{action}`,
`packages/shared/src/enums/capabilities.ts`). Slice 5 (ADR-0024) adds
`finding.read` (read a Finding / its entity links) and `finding.manage`
(create/update a Finding). Both are Developer-requestable per Managed System and
are NOT sensitive. Reading or creating a Finding is Admin (workspace) or
Developer scoped to the Finding's `primary_managed_system_id`; User and Reporter
never read Findings directly. The #112/#124 Entity Links Finding endpoint and
command surfaces are the documented exception: a User/Reporter holding an
explicit `finding.read` or `finding.manage` grant retains that point capability
there, without an Admin-or-Developer role gate. Creating a Finding from a VOC additionally requires
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

The Findings module owns the canonical implementation of these predicates:
`checkFindingRead` resolves a point `finding.read` decision, preserving the
Permission Check Service clock and archived Managed System behavior;
`actorFindingReadScope` resolves `finding.read` list-filter scope; and
`checkFindingManage` resolves point `finding.manage` decisions. Entity Links,
VOC Clusters, Task Requests, and Tasks must consume the form matching their
original call-site semantics; they must not reconstruct Finding scope or
capability checks locally.

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

Admin satisfaction has two layers. Do not conclude "Admin cannot X" from layer 1
alone.

```text
1. roleSatisfies (check-service.ts, step 4 above): Admin satisfies only workspace.read,
   workspace.admin, voc.triage, and voc.read. User satisfies only workspace.read.
   Developer satisfies none and needs Managed System grants.
2. Module bypass, declared per capability in CAPABILITY_META.adminModuleBypass
   (packages/shared/src/enums/capabilities.ts):
   - always: finding.read, finding.manage, task_request.self_approve
   - unless_denied: survey.read, survey.manage (an explicit deny still wins, ADR-0033 section C)
   - none: every other capability, including survey.read_personal_responses and survey.export
```

Layer 2 is enforced by `findings/authorization.ts`, `surveys/authorization.ts`,
and `task-requests/service.ts`, and applied to scope resolution in
`capabilityScope`. `applyAdminModuleBypass` (`check-service.ts`) mirrors it onto
the advisory `GET /me/permissions/check` decision so the frontend display hint
matches the enforcing route.

`GET /me/permissions/scope` resolves a capability over every Managed System
using the same order as a point check: workspace mismatch denies; active
workspace-wide or matching Managed-System denies deny before grants; active
workspace-wide grants allow; role-derived capability allows; then active
matching Managed-System grants allow. A workspace-wide grant or role match
returns `kind: all` only when there are no active Managed-System-scoped denies.
When such denies exist, the scope is the workspace Managed System list minus
the denied ids so its membership remains identical to point checks.

Managed System is the MVP authorization boundary below workspace Admin. Sibling
Managed Systems and Analytics Area are not grant sources. See the 09 Capability
Matrix notes.

Permission scope shape:

```text
workspace_id required
managed_system_id optional for Admin, required for Developer-scoped grants
object_type/object_id are historical storage fields; single-object authorization is post-MVP (ADR-0066)
```

Admin grants may omit managed_system_id when the capability is workspace-level.
Developer grants must include managed_system_id for scoped VOC triage,
Findings, Task Requests, Tasks, Surveys, Dashboard queues, Public Updates, and
Internal Comments. Analytics Area filters may narrow a list query but must not be
used as the source of authorization.
ADR-0067 supersedes the earlier unconditional assignment-failure rule. An invalid
explicit responsibility target returns `validation.failed`; an absent/invalid automatic
candidate falls through to the next rule and ultimately the existing scoped queue with
null fields and an Admin warning. Concrete Actors must pass the destination gate with
its current Admin-bypass/explicit-deny semantics inside the transaction. Active same-workspace
team responsibility grants no permission or self-approval and chooses no member.
Resolution order: docs/design/09-permission-access.md, Default Owner / Reviewer Resolution.
Survey operator validation remains separate and unchanged.

For list filters, managed_system_id=all means the actor's effective Managed
System scope union. Workspace Admin can receive true workspace-wide results.
Developers receive only records in their granted Managed System scopes, even
when the frontend URL says all. A Developer with one scope receives the same
result as that single scope. User-facing views should not expose all as a
workspace-wide bypass.

## Sensitive Permissions

Sensitive permission requests require a reason (`validation.sensitive_reason_required`).
Sensitivity is per capability, `CAPABILITY_META.sensitive` in
`packages/shared/src/enums/capabilities.ts`:

```text
workspace.admin
task_request.self_approve
survey.manage
survey.read_personal_responses
survey.export
```

Every other capability is non-sensitive and needs no reason beyond the route's `min(1)`.

Requester expiration is optional, with no automatic default (ADR-0044, confirmed
by ADR-0066). Any supplied/resolved non-null expiry must be future in create,
edit, supplement, approve, and direct grant. Admins may override grant expiration
without overwriting requested expiration. Workspace
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
-> approved | rejected | expired | revoked | cancelled
```

`needs_more_info` keeps the same Permission Request identity. Requester
supplementation moves the same request back to `pending`; it must not create a
new request for the same source object, source action, and requested scope.
ADR-0066 adds requester-only same-ID pending edit and withdrawal from either open
status to cancelled. Each successful mutation advances proposed revision/updated_at;
wrong status or revision returns conflict.stale_write after authorization. Withdrawal
retains history, frees open uniqueness, and writes no grant/deny/domain action.

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
may request `?status=pending|needs_more_info|approved|rejected|cancelled|all` to review
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
POST /permissions/requests/:id/approve         { expected_revision, reason?, expiration?, granted_managed_system_id?, self_approval? }
POST /permissions/requests/:id/reject          { expected_revision, reason: string }
POST /permissions/requests/:id/need-more-info  { expected_revision, note: string }
POST /permissions/requests/:id/deny            { expected_revision, reason: string }
```

- Approve grants the requested capability with the same or a supported narrower
  scope through the shared Permission grant command, then sets the request to
  `approved`. ADR-0066 reopens and supersedes the earlier copy-scope-only rule:
  workspace may narrow to one server-valid Managed System; system cannot widen
  or move to a sibling, and workspace-only authority cannot become system scope.
  The response/audit distinguish requested and granted scope/expiry without
  overwriting requested fields. Unsupported legacy object approval is 422. It never
  auto-runs the blocked action. The grant's expiration is the requested
  expiration unless the approver changes it (`expiration`: a future datetime
  overrides it, `null` clears it, omitted keeps it; a past datetime is
  `validation.failed`). The `permission_approved` audit detail records both the
  requested and the granted expiration (#590, per `docs/design/09-permission-access.md`).
- Reject sets the request to `rejected`; it does not mint a grant.
- Need-more-info sets it to `needs_more_info`; the note is kept in audit detail.
- Explicit deny copies the requested capability and Managed System scope into a
  real `permission_denies` row and sets the request to `rejected`. A
  workspace-wide deny takes precedence over every grant; a Managed-System-scoped
  deny takes precedence only for checks in that same Managed System.
- Reject, deny, and need-more-info require a non-empty trimmed reason/note.
  Approve requires one only for `isSensitiveCapability`; it is optional for a
  non-sensitive capability. Missing decision reason/note is a `validation.*`
  response (`422`), including `validation.sensitive_reason_required` for a
  sensitive approval. Reviewers may alter granted scope/expiry within ADR-0066,
  but never overwrite the requested values. All resolved non-null expirations
  must be future, including an unchanged requested expiry.
- Unknown request IDs are `not_found.record` (`404`); non-decidable requests
  are `conflict.stale_write` (`409`). Duplicate active grants/denies are
  `conflict.capability_already_granted` / `conflict.capability_already_denied`.
  `Idempotency-Key` replays the stored decision response without a second write.
  All decisions require proposed expected_revision and advance revision. Compare
  inside the idempotent run after row lock; authorization precedes replay, and
  replay precedes revision/status checks. Return current_revision only after
  authorization; no request data on owner/workspace lookup failure.

### Self-approval policy (Permission Requests, self deny lifts, and direct self grants)

An Admin deciding their own Permission Request is a self-approval. The resolved
workspace `permission_self_approval` setting defaults to `allowed`; in that
mode the approve body must include strict
`self_approval: { policy_citation: string, peer_reviewer_absence: string }`.
The approve body schema lives in `packages/shared/src/permissions/decisions.ts`, and the backend route imports it rather than declaring its own.
The recorded `permission_approved` audit detail carries this envelope only for
self-approval. The envelope is rejected for an approval decided by another
Admin. If the workspace setting is `forbidden`, self-approval returns
`permission.denied` without changing the pending request; another Admin may
approve the same request normally.

An Admin lifting an active deny on themself follows the same setting:
`forbidden` returns `permission.denied` without changing the deny or writing an
audit row, while `allowed` permits the lift and records `self_lift: true` in the
audit detail. An Admin may revoke their own grant because that action only
lowers privilege. ADR-0066 extends the setting to direct self grants: forbidden
returns permission.denied; allowed requires the same strict self_approval envelope
and records self_grant: true plus the envelope. Another-Actor grant rejects that
envelope. This is capability authority, not a Role Level promotion.

The canonical event values (`AUDIT_EVENT_TYPES`), Zod enum (`auditEventTypeSchema`), and per-event detail schemas (`AUDIT_EVENT_DETAIL_SCHEMAS`) are aggregated in `packages/shared/src/enums/audit-events.ts`. The event literals and detail schemas are owned per domain in `packages/shared/src/audit/*.ts`.

Audit events (the permission and task-request subset; the full vocabulary is in code):

```text
permission_requested
permission_approved
permission_rejected
permission_needs_more_info
permission_denied
permission_more_info_submitted
permission_revoked
permission_deny_revoked
task_request_approved
task_request_rejected
task_request_needs_more_evidence
task_request_self_approval_denied
task_request_created_from_finding
task_request_created_from_voc
task_request_created_from_voc_cluster
task_created_from_request
task_linked_to_request
```

Expiry handling is not implemented yet. Its planned event remains:

```text
permission_expired
```

### Grant revoke and deny lift (ADR-0061)

`POST /permissions/grants/:id/revoke` and `POST /permissions/denies/:id/revoke`
are workspace-admin commands. They lock and update only active rows, require
a trimmed reason, and append one strict audit event in the same transaction.
An expired grant is not active and returns `conflict.permission_not_active`;
an active deny is lifted by setting its revoke metadata. Permission Request
status does not change. Revoke does not terminate sessions or change
role-derived capabilities.

The permission check treats a revoked grant or an expired grant as requestable
using the same workspace scope as `no_grant`. The state mapper returns
`pending_request` when the Actor has an open request for that capability and
otherwise returns `revoked` or `expired`, respectively. A revoke notification
goes to the grant's Actor; deny lift sends no notification. There is no migration
or grant change for these commands.
Domain responses treat `grant_revoked` and `grant_expired` like `no_grant`
(`isRequestableDenial`, #775); paths keyed on `requestable !== null` (Survey
results and follow-up) include `requestable_permission` for them.

## Summary-Visible Contract

When entity link visibility is `summary_visible`, the target module returns a safe summary.

ADR-0023 is the authoritative summary contract (Slice 4.4 #115): canonical Task
field list, forbidden-field list, and the decision table. The fields below are
the canonical list ADR-0023 reconciles to. No `voc` summary exists; `summary_visible`
is not emitted for a `voc` target. Task is the only provider with a reporter
summary (`tasks/entity-link-provider.ts`, ADR-0032); every other provider
returns `{ available: false }`.

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

## Accepted close-out extensions (ADR-0066; proposed/new)

The rules above incorporating revision, withdrawal and narrowing replace older
scope-copy/default-expiration text; the new API fields and behavior are not yet
implemented. `api/permissions.md` owns exact bodies, reads, responses and errors.

One Permission capability/scope policy supplies server candidates and validates
create/edit/supplement/approval/direct grants inside transactions. Developer-scoped
capabilities require an active Managed System; honor workspace Survey export per
ADR-0033. No ordinary workspace.admin request; use explicit direct-grant governance.
Reject non-null requested object scopes, preserve historical rows/source provenance,
and inventory legacy object grants before release (ADR-0066 / post-MVP backlog).

Recipient serialization uses an Auth-owned lock extension. Shared grant writer lock
order is recipient Actor, request if relevant, workspace policy row, grant row.
Request creation and scope-changing requester commands participate; the policy row
is obtained through Workspace Settings' approved seam. Admin capability is checked
before replay; a changed body under the same key conflicts. Audits and idempotency
rows share the mutation transaction.

Direct grant requires a reason for all capabilities and explicit workspace.admin
form governance. Match open asks by recipient/capability/supported scope regardless
of source, and refuse with a safe review destination; overlapping active denies
require explicit lift, never silent removal. Workspace grants overlap any deny for
that capability; system grants overlap workspace/same-system denies, not siblings.
Preflight is advisory and all checks run again transactionally on submission.
No Role Level change, automatic action, entity link, fake ask or decided notification.

New expired reissue sets superseded_at on an expired exact-tuple predecessor and
inserts a fresh ID. Preserve expiry/grantor/time/revoke fields. Keep the full COALESCE
unique scope tuple and change only the predicate to revoked_at IS NULL AND
superseded_at IS NULL; never now(). Checks, scope reads, active lists, revoke and
seed existence checks exclude superseded grants. Audit failure restores both rows;
expired/old-ID revoke stays conflict.permission_not_active.

Permission computes four explained codes only for selected Admin detail:
sensitive_capability, workspace_scope, no_expiration, active_deny (proposed/new).
Effective access and Role Level are facts, not a role-jump score. Unknown/failure
is retryable, not zero risk. Owner detail/mine omit risk and deny internals. Core
owns the latest-question audit projection; source-owner gates/allowlists control
safe summaries, including personal Survey data without an Admin bypass.

Proposed strict audits (register in shared permission audit schemas and aggregator):
- permission_request_cancelled: request subject; previous status, requester,
  capability/scope, optional trimmed reason, previous/resulting revisions.
- permission_request_updated: request subject; complete previous/resulting editable
  reason/scope/expiry and revisions, capability/requester identity.
- permission_granted: grant subject; actual recipient/capability/scope/reason/expiry,
  grant ID, create/reissue mode, predecessor ID on reissue, self_grant/envelope when self.
- Existing request mutation audits gain revisions; supplementation keeps pre/post
  values. permission_approved keeps the request subject and gains requested/granted
  scope, revisions, and predecessor ID when reissuing. Requestless grants do not
  reuse request-decided notifications. Withdrawal emits no decided notification.

## Safe Survey evidence reuse (ADR-0064; proposed/new #816 routes)

A Survey result reader may browse approved safe excerpt candidates with
`survey.read` and attach with `finding.manage` on the target Finding, without
`survey.read_personal_responses`. Non-holders obey existing response cohort,
per-question answer and low-bucket suppression on every page and on submit;
personal holders retain their existing result exceptions, but the picker still
omits response IDs. Source Survey and target Finding Managed Systems may differ
inside one workspace; each gate is independent. Existing module-specific role,
explicit-deny and non-disclosing source 404 rules remain in force; no new User
Finding-read grant or Admin personal bypass is introduced.

The response-addressed create-Finding command retains explicit personal access.
Existing attached highlights retain their source-read audience, separately from
result-picker suppression, and require exact active approval plus fresh target
read/source access in one snapshot. Safe reads do not fabricate personal-read
audits; actual personal-data reads keep existing per-row audits. Raw audit SELECT
is revoked at #740 cutover without deleting Actor/detail history (ADR-0008).
Endpoint authority: `api/surveys.md` and `api/findings.md`.
