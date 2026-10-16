# ADR-0066: Permission Request lifecycle and governed direct grants

## Status

Accepted 2026-10-13 by the owner (MVP close-out decisions); implemented by
#1080–#1086, including the governed direct-grant UI.
The implementation issues below are historical planning notes, not pending work.

Partially supersedes
ADR-0044's requester cancel/edit exclusion; extends ADR-0061's grant lifecycle
and ADR-0041's `permission_self_approval` coverage. Reopens FR-PERM-002 in
`docs/design/09-permission-access.md` and the Admin decision lifecycle in
`docs/implementation/05-permission-policy.md` to resolve supported-scope narrowing.

## Context

People cannot clear obsolete requests or correct pending asks. Admins lack a
requestless grant path and enough context to judge access. A row lock alone
cannot prove that a reviewer saw the values they are approving. Object scope
fields exist, but the checker enforces workspace/Managed System scope only;
quietly dropping those fields would grant broader access than requested.

The owner approved memo D-55's recommendations on 2026-10-13 in
[#1041](https://github.com/hjung3113/FeedbackOps/issues/1041),
[#1042](https://github.com/hjung3113/FeedbackOps/issues/1042), and
[#1043](https://github.com/hjung3113/FeedbackOps/issues/1043), explicitly deferring
single-object authorization past MVP. The memo's sections 3, 4, and 6 inform
this decision; these owner comments settle the previous scope-contract collision.

## Decision

### Owner decisions and value

| Decision | Contract | Product value |
| --- | --- | --- |
| O1 / #1041 | Only the requester withdraws `pending` or `needs_more_info` to new terminal `cancelled`; optional trimmed reason, history retained. Label `요청 철회`. | Clears obsolete asks without an Admin round trip and frees the duplicate-open slot. |
| O2 / #1041 | Edit the same pending request's reason, supported scope, and duration. Preserve ID, requester, capability, source, and return intent; audit pre/post values. Supplementation remains separate. | Keeps one understandable ask and review trail instead of queue churn. |
| O3 / #1042 | Direct `workspace.admin` grants use an explicitly named governance mode, workspace scope, written reason, and confirmation. Ordinary blocked-action requests never offer this capability. | Replaces off-book DB grants with deliberate, accountable administration. |
| O4 / #1042 | Direct self grants follow `permission_self_approval`: forbidden rejects; allowed requires the existing policy-citation/peer-absence envelope and self audit marker. | A different screen cannot bypass workspace governance; single-Admin policy still works. |
| O5 / #1042 | Block direct grants for a matching open ask or overlapping active deny; offer existing request review or explicit deny lift and recheck at submission. | Avoids abandoned asks and success messages for ineffective grants. |
| O6 / #1043 | Four explained server signals: sensitive capability, workspace-wide scope, no expiration, matching active deny. Show role/effective access and administrative authority as facts, without scores. | Gives reviewers actionable reasons without invented precision. |
| O7 / #1041 | Admin may narrow a supported requested scope and override grant expiration, retaining requested versus granted values. Single-object authorization is post-MVP. | Grants the minimum useful access in one review while avoiding unenforceable restrictions. |

### Request transitions and concurrency

All successful request mutations advance a proposed positive integer `revision`
(initial/default 1) and `updated_at`, including repeated needs-more-info decisions.
Existing reserved `expired` and `revoked` request statuses remain legal; withdrawal
never uses them and grant revocation does not change request status.

| Actor / command | From | To | Writes beyond request |
| --- | --- | --- | --- |
| Session requester / create | none | `pending`, revision 1 | Submission audit and existing notification |
| Same requester / edit | `pending` | `pending` | New strict update audit with pre/post values |
| Same requester / supplement | `needs_more_info` | `pending` | Existing supplementation audit extended with revisions |
| Same requester / withdraw | `pending`, `needs_more_info` | `cancelled` | New cancellation audit only |
| `workspace.admin` / approve | `pending`, `needs_more_info` | `approved` | Grant, approval audit, existing decided notification |
| `workspace.admin` / reject or deny | `pending`, `needs_more_info` | `rejected` | Reject audit, or deny plus deny audit; existing decided notification |
| `workspace.admin` / need-more-info | `pending`, `needs_more_info` | `needs_more_info` | Question in audit; no decided notification |

Requester item lookup is one ID + session workspace + requester predicate,
including for Admin requesters. Missing, foreign-workspace, and other-owner IDs
all return `404 not_found.record`. Admin gates precede sensitive reads and replay;
foreign/unknown Admin item IDs return 404 after the gate. Wrong status, terminal
mutation, or revision mismatch returns `409 conflict.stale_write` with the current
revision only after authorization (new error detail field, not a new error code).

Require proposed `expected_revision` on edit, withdraw, supplement, and every
Admin decision. Compare after row lock/reload inside the idempotent run. Hash
action, request ID, revision, and body. Optional UUIDv4 `Idempotency-Key` replays
before status/revision checks, after authorization; a different body under the
same key is `conflict.idempotency_key_reuse`. Audit, request, grant/deny, and
idempotency effects commit or roll back together. Integer revisions avoid
round-trip timestamp precision errors and stop an old view approving a changed ask.

### Supported scope and approval

Permission owns one capability/scope policy, used transactionally by create,
edit, supplement, approval, and direct grant; shared contracts expose its typed
candidates. Developer-scoped capabilities require an active workspace Managed
System; preserve capability-specific exceptions such as workspace `survey.export`
(ADR-0033). No team, Analytics Area, or single-object authority in these MVP flows.
Source object fields are provenance, not authorization scope.

Approve omission keeps requested scope. An explicit proposed
`granted_managed_system_id` may keep the same Managed System or narrow a
policy-supported workspace scope to one active Managed System. It cannot widen a
single-system ask, move it to a sibling, or narrow workspace-only administrative
authority into a fictitious system scope. Only candidates the server permits are
valid. Keep requested fields unchanged; response and strict approval audit record
requested/granted scope and expiration. Existing `expiration` omit/override/null
semantics remain; any resolved non-null expiration must be future at approval.
Requester expiration remains optional with no automatic 30-day default (ADR-0044).

Reject non-null requested object scope in new create/edit/supplement and in
approval of legacy requests with `422 validation.failed`; never strip it into a
broader grant. Preserve historical fields and rows, display legacy limitations,
and allow withdrawal/rejection. Deployment inventory must identify legacy open
object-scoped requests and unsuperseded object-scoped grants; the latter are a
release blocker until an explicit operator disposition is agreed, because they
cannot be advertised as object-restricted access. No automatic widening, bulk
revocation, or silent history migration is authorized here.

### Selected reads, risk, and privacy

Extend mine with revision, expiration, updated time, and return intent. New
owner-scoped detail supplies latest Admin question, editable scope candidates,
and allowed actions. Core provides an approved audit-question projection;
Permission must not query audit storage as a foreign repository.

New Admin selected detail supplies current request/revision, requester display
name and role, effective access, requested/source context, authorized safe source
summary when available, matching deny state, allowed actions, and typed
`risk_indicators: [{ code, evidence }]`. Compute in Permission only for the
selected request; collection rows stay minimal. Proposed signal codes are
`sensitive_capability`, `workspace_scope`, `no_expiration`, `active_deny`.
Evidence explains the capability, scope, expiry, or matching deny scope; no
numeric score or role-jump heuristic. A system request matches workspace/same-
system denies, not siblings; a workspace request overlaps any system deny for
that capability. Revoked denies never signal.

Requester reads omit risk/deny internals. No email, raw Survey answers, or
restricted source contents; `workspace.admin` never bypasses personal Survey
capability gates (ADR-0033). Safe summaries use source-owner authorization and
allowlists. Failed computation is an error/retry state, never an empty result.
UI heading is `검토 시 확인할 사항`; `추가 확인 사항 없음` means successful
calculation with zero signals. Signals inform review, not authorization.

### Direct grant, ownership, and expired reissue

New Admin options/preflight and direct-grant commands live in Permission.
Validate the recipient through the Auth-owned `actor-lookup.ts` seam, extended
with a proposed workspace-filtered row lock through Auth's public API. Lock order
for the shared approval/direct-grant writer is recipient Actor, request if relevant,
workspace policy row, grant row. Request creation and request scope-changing
commands participate in the same recipient serialization; direct/direct,
direct/approve, and direct/request-create cannot leave duplicate effective grants
or already-satisfied open asks. Cross-module rows stay behind owner seams.

Direct grant requires a known capability, server-valid scope, trimmed 1–2000
reason for every capability, and future optional expiration. Server workspace
comes from session. Recheck `workspace.admin` inside the transaction before
replay; use the sensitive rate-limit tier. Another Actor's grant cannot carry a
self envelope. Self grants use the existing strict `self_approval` envelope and
policy, plus proposed audit `self_grant: true`. The governance form explicitly
confirms workspace administrative authority; it changes capability access, never
Role Level. Matching open ask means same recipient/capability/supported scope
regardless of source; direct grant leaves it unchanged and directs to review.
A workspace grant overlaps system denies; a system grant overlaps workspace and
same-system denies. Denies must be explicitly lifted, never removed implicitly.

One Permission-owned grant command serves request approval and direct grants.
An active duplicate is `409 conflict.capability_already_granted`. Expired,
unrevoked exact-tuple predecessors are atomically superseded with proposed
nullable `superseded_at`, then a fresh grant ID is inserted. Preserve predecessor
expiry, grantor/time, and all revoke metadata; never revive it in place or invent
a user revocation. Keep every COALESCE scope column in the SQL-only unique index,
changing only its predicate to `revoked_at IS NULL AND superseded_at IS NULL`;
never put `now()` in it. Effective checks, scope resolution, active lists, revoke
validation, and seed existence checks exclude superseded rows. Old/expired ID
revoke remains `409 conflict.permission_not_active` (ADR-0061).

New strict `permission_granted` audit has subject `permission_grant`, grant ID,
actual recipient/capability/scope/reason/expiry, create versus reissue mode,
previous grant ID when reissuing, and self envelope/marker when applicable.
Approval retains `permission_approved` on the request and adds actual scope,
revisions, and predecessor ID when relevant. Audit failure restores the expired
predecessor and removes the replacement. No fabricated Permission Request,
entity link, Role Level mutation, automatic blocked action, or reused
`permission_request.decided` notification for requestless grants.

### Frontend and rollout

Home open-request rows open requester detail with server-allowed `수정`,
`요청 철회`, or `보완 제출`. Closing an unsubmitted form is not withdrawal.
Reuse shipped creation/expiration controls, preserve unsaved input and focus on
error, and remove only the withdrawn open row. A still-requestable capability
can be requested again. Admin review fetches selected detail, sends its revision,
and resets its decision draft when ID/revision changes. Stale conflicts refetch
and require fresh review; requester edits retain input for explicit reconciliation.
Never auto-resubmit approval. Retain Admin `tab`/`selected` and Back restoration;
all-history includes cancelled rows with label `철회` and no decision controls.

The existing active-grants `ListShell` gains one `권한 부여` primary action with
Actor names (no email), server scope options, reason, optional date, explicit
Admin governance mode/confirmation, and the self envelope when required.
Preflight offers review/deny-lift destinations; submit failure preserves input;
success selects the actual returned grant in existing URL state. Invalidate
relevant mine/review/check/scope/grant queries; server calls enforce access afresh.

Deploy schema additions before writers and API/shared/FE revision consumers as
one controlled rollout, refreshing old clients. Inventory legacy object scopes
before release. Migrations preserve full indexes, register journal/snapshot per
`docs/implementation/04-database-and-migrations.md`, and verify actual SQL. Once
cancelled or superseded rows exist, blindly restoring the old status CHECK or
unique predicate is unsafe: rollback needs explicit data handling or a forward
fix, preserving history. No DB work is performed by this ADR worker.

## Non-goals and consequences

No single-object enforcement, team/Analytics Area permission boundary, role
promotion workflow, numeric risk scoring, speculative pagination redesign,
custom policy language, automatic source action execution, or new notification
catalogue for direct grants. Single-object enforcement is recorded with reason
and reopen condition in `docs/design/14-post-mvp-backlog.md`; the other excluded
alternatives are not silently promised as future delivery.

The slice ships requester actions, explained review context, and governed direct
grants together. Revision consumers and grant-index changes increase rollout
coordination, but prevent stale approvals and preserve provenance. Shipped UI and
visual baselines remain the UI authority (ADR-0060). Existing all-history scale
risk must be measured separately; selected detail must not scan VOC/Task collections
or compute risk for every list row at the ~5k VOC/~5k Task release scale.

## Implementation issues

The conductor files these ordered chunks; they are proposed/new issues, not
claims of filed tickets or delivery. #1068 is the docs prerequisite for all six.
Use existing route integration/rendered suites; migration/shared work is BE-owned.

1. **Versioned requester lifecycle and supported scope policy (#1041 BE).**
   BE/shared/migration: `apps/backend/src/modules/permissions/{routes,request-service,decision-service}.ts`,
   `apps/backend/src/db/schema/permission.ts`, `apps/backend/migrations/`,
   `packages/shared/src/permissions/`, `packages/shared/src/audit/permission.ts`,
   Core audit projection (proposed/new) under `apps/backend/src/modules/core/audit/`,
   Auth lock extension under `apps/backend/src/modules/auth/actor-lookup.ts`,
   `apps/backend/src/lib/errors.ts` and `apps/frontend/src/lib/api/errorMapper.ts`
   for the proposed current_revision detail and stale-request copy.
   Depends on #1068. Acceptance: owner-only uniform 404; cancel frees exact slot
   without grant/deny; same-ID pending edit/supplement pre/post audits; immutable
   capability/source; supported/archived/object/expiry/duplicate failures leave
   no partial writes. All Admin commands consume revision and narrowing candidates;
   requested/granted scope/expiry remain distinct. Edit/supplement-first makes an
   old decision fail; approve/cancel-first makes later edit fail. Same-key replay,
   different-body conflict, and audit failure prove atomicity. Include legacy
   object inventory and controlled migration/rollback plan.
2. **Explainable selected review context (#1043 BE).** BE/shared:
   `apps/backend/src/modules/permissions/` selected read service (proposed/new),
   `routes.ts`, shared response schemas, approved Auth/Core/source-owner projections.
   Depends on 1. Acceptance: capability 403 before reads; foreign/unknown 404;
   current revision, role/access/expiry, four codes and evidence; workspace/same-
   system versus sibling/revoked deny; terminal no-actions. Requester reads omit
   risk/deny internals, restricted Survey sources remain safe without personal
   capability, no email/raw responses. Measure selected read at target scale;
   prove no per-list-row risk computation and distinguish failure from zero signals.
3. **Requester actions and stale-safe review UI (#1041 FE).** FE:
   `apps/frontend/src/features/home/HomeScreen.tsx`, feature-local requester flow
   (proposed/new), `apps/frontend/src/features/admin/permissions/`,
   `apps/frontend/src/lib/api/permissions.ts`, `apps/frontend/src/lib/copy/home.ts`,
   `apps/frontend/src/lib/copy/admin-permissions.ts`. Depends on 1–2.
   Acceptance: latest question/expiry, same-ID edit/supplement, explicit withdrawal
   confirmation, close-without-cancel, input/focus preserved on error. Revision/ID
   changes invalidate Admin draft; stale conflict requires review, never resubmits.
   Keep URL/Back, expiry keep/change/clear, unknown names, no email, cancelled history.
   Extend existing Home/Admin rendered tests; conductor verifies desktop 1440 and visuals.
4. **Show explained server risk signals (#1043 FE).** FE:
   Admin Permission detail/hooks, typed selected-detail adapter and
   `apps/frontend/src/lib/copy/admin-permissions.ts`. Depends on 2–3.
   Acceptance: every supplied code explains its facts; no client score/flag;
   loading, unavailable/retry, zero signals, and terminal distinguishable;
   another selection retains no previous risk/draft. Extend detail tests and
   `apps/frontend/tests/visual/permissions.visual.spec.ts` with existing fixtures.
5. **Governed direct grant and audited expired reissue (#1042 BE).** BE/shared/migration:
   `apps/backend/src/modules/permissions/{grant-admin-service,decision-service,check-service,scope-service,routes,index}.ts`,
   Auth actor lookup, permission schema/migrations, `apps/backend/src/seed/index.ts`,
   shared grant/decision/audit contracts and `apps/backend/src/lib/errors.ts`
   for proposed Admin-safe conflict destinations. Depends on 1–2. Acceptance: exact immediate
   access on an existing session; capability/deny gate before replay; foreign Actor,
   unsupported scope/governance, expiry, reason, and self-policy failures leave no
   grant/audit. Matching ask routes to review; overlapping deny requires lift;
   active duplicates conflict. Expired replacement uses new ID, preserves provenance,
   audits predecessor, old revoke 409, audit rollback restores both. Exercise
   direct/direct, direct/approve, direct/request-create, scope-edit serialization,
   replay-once and approval reissue. No role/link/domain-action/fake notification writes.
6. **Direct grant from active permissions (#1042 FE).** FE:
   `apps/frontend/src/features/admin/permissions/` grants screen/console and new
   feature-local form, `apps/frontend/src/lib/api/permissions.ts`,
   `apps/frontend/src/lib/copy/admin-permissions.ts`. Depends on 5 and options schema.
   Acceptance: only server-valid scopes, explicit governance/self envelope,
   deny/open-ask destination, errors retain input, repeated submit is one intent,
   actual returned grant selected with scope/expiry and URL/history preserved;
   no promise of Role Level change. Extend existing grants tests and
   `apps/frontend/tests/visual/permission-grants.visual.spec.ts`/fixtures;
   conductor verifies desktop 1440, keyboard, busy/error states, visual diff.
