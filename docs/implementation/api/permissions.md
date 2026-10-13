# Permission

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Permission

ADR-0066 (accepted 2026-10-13) amends this contract. #1080 implements requester
edit/cancel/supplement revisions, required revisions for all Admin decisions,
supported-scope narrowing, and corresponding audits. #1081 implements selected
owner/Admin detail and explained risk. #1085 implements direct-grant options/writes
and superseded-grant filtering; its migration and runtime verification remain
conductor release checks.
Deploy migration 0058 before these writers and roll out the #1083 revision
consumers together, refreshing old clients. DB verification and the migration
snapshot refresh remain conductor release checks.
Existing endpoints retain their other rules. Single-object scope is post-MVP;
source objects remain provenance. FR-PERM-001/002 are the requirement anchors.

```text
GET /me/permissions/check?capability={capability}&managed_system_id={uuid?}
  -> 200 { state, decision }
  -> 401 auth.session_invalid
  -> 422 validation.unknown_capability

GET /me/permissions/scope?capability={capability}
  -> 200 { scope: { kind: "all" } }
  -> 200 { scope: { kind: "scoped", managed_system_ids: [uuid, ...] } }
  -> 401 auth.session_invalid
  -> 422 validation.unknown_capability

POST /permission-requests
GET /permission-requests          # admin-only workspace list (#87)
GET /permissions/requests         # canonical review-console list
GET /permission-requests/mine     # caller's open requests
POST /permissions/requests/:id/approve
POST /permissions/requests/:id/reject
POST /permissions/requests/:id/need-more-info
POST /permissions/requests/:id/deny
POST /permission-requests/:id/submit-more-info
GET /permissions/grants
GET /permissions/denies
POST /permissions/grants/:id/revoke
POST /permissions/denies/:id/revoke
# ADR-0066 lifecycle and direct-grant endpoints:
GET /permission-requests/:id      # requester-owned selected detail
PATCH /permission-requests/:id    # pending edit
POST /permission-requests/:id/cancel
GET /permissions/requests/:id     # Admin selected detail
GET /permissions/grant-options?actor_id={uuid}
POST /permissions/grants
```

### `GET /me/permissions/check`

Point check of one capability for the session actor. `capability` is required
and must be a known capability; `managed_system_id` is an optional UUID. A
missing `capability` or a non-UUID `managed_system_id` returns
`422 validation.failed`; an unknown capability returns
`422 validation.unknown_capability`. The route is a read: it takes no
`Idempotency-Key` and carries no per-route rate-limit tier.

Response `200`:

```ts
{
  state: "approved" | "blocked_non_requestable" | "request_access" |
    "pending_request" | "hidden_existence" | "rejected" | "expired" |
    "revoked" | "summary_visible";
  decision:
    | { allow: true; via: "direct_grant" | "role" | "managed_system_scope"; grant_id?: uuid }
    | {
        allow: false;
        reason: "workspace_mismatch" | "explicit_deny" | "no_grant" |
          "grant_expired" | "grant_revoked" | "sensitive_reason_missing";
        requestable: Array<{ workspace_id: uuid; managed_system_id?: uuid }> | null;
      };
}
```

`state` is a display hint derived from `decision` plus the caller's own open
(`pending` | `needs_more_info`) Permission Request for the same capability and
the same `managed_system_id` scope (a request without a Managed System matches
only a check without one). Backend decisions on the enforcing routes stay
authoritative.

The generic check answers for the role layer only. For a caller whose role level
is `admin`, the route re-applies the per-capability admin module bypass declared
in `CAPABILITY_META.adminModuleBypass` (`packages/shared/src/enums/capabilities.ts`)
through `applyAdminModuleBypass`, so the hint matches the module route that
enforces the capability. `always` turns any non-`workspace_mismatch` denial
into `allow: true, via: "role"`; `unless_denied` does the same except for an
`explicit_deny`; `none` leaves the decision unchanged.

### `POST /permission-requests`

The create body accepts `requested_expiration?: iso8601`. When present, the
service stores that requested end time on the Permission Request.

```ts
{
  requested_capability: string;
  requested_managed_system_id?: uuid;
  // requested_object_type/id are rejected when non-null (ADR-0066)
  reason: string;
  requested_expiration?: iso8601;
  source_object_type?: string;
  source_object_id?: uuid;
  source_action_id?: string;
  return_route_intent?: string;
}
```

Proposed response adds `revision: 1` to
`{ id: uuid, status: "pending", created_at: iso8601 }`. Validate a known capability
and active workspace Managed System against server scope candidates inside the
transaction; reject ordinary workspace.admin requests and unsupported object
scope with `422 validation.failed`. Retain optional expiration, no default;
non-null expiration must be future. Already-effective access is
`409 conflict.capability_already_granted`; duplicate complete open scope/source
is `409 conflict.permission_request_duplicate`. Request creation participates in
recipient serialization with direct grant/approval (ADR-0066).

### `POST /permission-requests/:id/submit-more-info`

Any authenticated member may resubmit a request only when the request belongs
to that actor in the current workspace and has status `needs_more_info`. Admins
use the same requester check; there is no admin bypass. An unknown request id,
a request in another workspace, or another member's request returns
`404 not_found.record`.

The strict request body accepts:

```ts
{
  expected_revision: positive_integer; // proposed/new, required
  reason?: string; // 1–2000 characters
  requested_managed_system_id?: uuid | null;
  // Non-null object scope is unsupported; no object-scope mutation field (ADR-0066).
  requested_expiration?: iso8601 | null;
}
```

Omitted values keep the stored value. JSON `null` clears requested Managed System
only when server policy permits workspace scope, or clears requested expiration;
`reason` cannot be null. Legacy non-null object scope is rejected, never silently
stripped. Use server candidates and validate active workspace Managed System and
future non-null expiry; `{ expected_revision }` alone may resubmit unchanged values.
Submitted reasons are trimmed and must remain non-empty. A sensitive
capability returns `validation.sensitive_reason_required` for an empty resolved
reason; other capabilities return `validation.failed` with a `reason` field
error. Unknown keys and malformed values return `422 validation.failed`.
An invalid UUIDv4 `Idempotency-Key` returns
`422 validation.malformed_idempotency_key`; a stored capability outside the
current vocabulary returns `422 validation.unknown_capability`. An unknown
managed-system id or one from another workspace returns `422 validation.failed`
with `fields: [{ path: ['requested_managed_system_id'], code: 'custom' }]`. A
non-UUID `:id` returns `422 validation.failed`.

```json
{
  "id": "uuid",
  "status": "pending",
  "updated_at": "iso8601",
  "revision": 1
}
```

The command compares expected_revision after locking the request row inside
the idempotent run and accepts only `needs_more_info`; status/revision mismatch
returns `409 conflict.stale_write` with authorized current_revision. Success
advances revision/updated_at, and the audit gains previous/resulting revisions. A
resolved managed-system id must belong to the current workspace. When the
scope tuple changes, the service rechecks the capability in the same
transaction and returns `409 conflict.capability_already_granted` if the actor
already has it. An active-request unique-index collision returns
`409 conflict.permission_request_duplicate`.

An optional UUIDv4 `Idempotency-Key` stores and replays the `200` response for
the same actor, key, and body. Reusing that key with a different body returns
`409 conflict.idempotency_key_reuse`. The transaction updates the request and
writes the strict `permission_more_info_submitted` audit detail, including the
stored pre-image, atomically.

`GET /me/permissions/scope` (Slice 11 #215) is the per-Managed-System bulk
equivalent of `GET /me/permissions/check` and resolves in the same order, so
membership in its result is identical to a point check on every Managed System.
`all` is returned only when every Managed System is allowed; an active
Managed-System-scoped deny forces `scoped` enumeration.

`GET /permission-requests` (Slice 3 #87) — admin-only workspace-wide list of
open (`pending` | `needs_more_info`) requests by default, plus a `count`; it
accepts the same `status` filter as `GET /permissions/requests`. Guarded by the
`workspace.admin` capability (mirrors the managed-systems mutation gate); a
non-admin caller receives `permission.denied` → `403`. Response:

```json
{
  "requests": [
    {
      "id": "uuid",
      "requester_actor_id": "uuid",
      "requested_capability": "string",
      "requested_managed_system_id": "uuid | null",
      "requested_expiration": "iso8601 | null",
      "reason": "string",
      "status": "pending | needs_more_info | approved | rejected | cancelled",
      "revision": 1,
      "created_at": "iso8601"
    }
  ],
  "count": 0
}
```

`GET /permissions/requests` is the canonical Admin review-console list and
accepts `status=pending|needs_more_info|approved|rejected|cancelled|all`; without a
status it returns open requests. It uses the same review item shape, including
`requested_expiration` and proposed revision. Collection rows remain minimal;
Admin detail is fetched through the new selected-detail endpoint below. `all`
retains history including cancelled/expired/revoked; terminal rows expose no
decision actions. Cancellation disappears from both default open lists and mine.

### `POST /permissions/requests/:id/approve`

The strict approve body accepts:

```ts
{
  expected_revision: positive_integer; // proposed/new, required
  reason?: string;
  granted_managed_system_id?: uuid | null; // proposed/new narrowing override
  expiration?: iso8601 | null;
  self_approval?: {
    policy_citation: string;
    peer_reviewer_absence: string;
  };
}
```

Omitting `expiration` keeps the request's `requested_expiration`; `null` grants
permanent access; an ISO datetime overrides the requested value. A datetime at
or before the current time returns `422 validation.failed` with
`fields: [{ path: ['expiration'], code: 'custom' }]`. The grant's `expires_at`
is the resolved value; even an unchanged non-null requested expiry must be future.
Omitted granted_managed_system_id keeps requested scope; a UUID narrows a server-
valid workspace ask to one active Managed System or retains that same system.
Null keeps workspace scope only if already requested and permitted. No widening,
sibling move, unsupported object scope, or fictitious system-scoped workspace.admin:
`422 validation.failed` with the offending field. Request fields stay unchanged.

Proposed response is `200 { id, status: approved, grant_id, revision, updated_at,
requested_managed_system_id, granted_managed_system_id, requested_expiration,
granted_expiration }` (scope and expiry values nullable). The strict
`permission_approved` audit records both requested/granted scope and expiry,
previous/resulting revision, and previous_grant_id on expired reissue. It retains
its request subject and existing notification. Shared grant writer preserves
expired predecessor history and inserts a new grant ID; active duplicates conflict.
The Admin gate, status and proposed revision/replay rules below apply to approve too.

### `POST /permissions/requests/:id/reject`, `/need-more-info`, `/deny`

The three non-approving decisions share the approve route's gate and
transaction shape. Each requires `workspace.admin` (checked before any
`Idempotency-Key` replay, so a cached response never bypasses it); a
non-admin caller receives `403 permission.denied`. The request row is locked
inside the transaction. An unknown id or one from another workspace returns
`404 not_found.record`. Only `pending` and `needs_more_info` requests are
decidable; all four commands require expected_revision and compare it after
locking in the idempotent run. Status/revision mismatch returns
`409 conflict.stale_write` with authorized current_revision. Every successful
decision advances revision and updated_at; responses below also add both fields
(proposed/new). Unknown body
keys, or a value over 2000 characters, return `422 validation.failed`. An
invalid UUIDv4 `Idempotency-Key` returns `422 validation.malformed_idempotency_key`;
a valid one stores and replays the `200` response for the same actor, key, and
body, and reuse with a different body returns `409 conflict.idempotency_key_reuse`.
The four decision routes use the `sensitive` rate-limit tier (5 per minute per
Actor).

A decision never executes the originally blocked domain action. Each success
writes one audit event, with `capability`, `managed_system_id`, and
`requester_actor_id` in its detail.

#### `POST /permissions/requests/:id/reject`

```ts
{ expected_revision: positive_integer, reason?: string } // max 2000; non-empty after trim
```

An empty or whitespace-only `reason` returns `422 validation.failed` with
`fields: [{ path: ['reason'], code: 'too_small' }]`. The request moves to
`rejected`; no grant or deny row is written. The requester receives a
`permission_request.decided` notification (`outcome: "rejected"`). The audit
event is `permission_rejected`, with `reason` in its detail.

```json
{ "id": "uuid", "status": "rejected" }
```

#### `POST /permissions/requests/:id/need-more-info`

```ts
{ expected_revision: positive_integer, note?: string } // max 2000; non-empty after trim
```

An empty or whitespace-only `note` returns `422 validation.failed` with
`fields: [{ path: ['note'], code: 'too_small' }]`. The request moves to
`needs_more_info` and stays decidable. This decision sends no
`permission_request.decided` notification. The audit event is
`permission_needs_more_info`, with `note` in its detail.

```json
{ "id": "uuid", "status": "needs_more_info" }
```

#### `POST /permissions/requests/:id/deny`

```ts
{ expected_revision: positive_integer, reason?: string } // max 2000; non-empty after trim
```

An empty or whitespace-only `reason` returns `422 validation.failed` with
`fields: [{ path: ['reason'], code: 'too_small' }]`. Deny writes an explicit
deny row for the requester, the requested capability, and the requested
Managed System (with `reason`, created by the deciding admin), and moves the
request to `rejected`. If the requester already has an active deny for that
scope, the route returns `409 conflict.capability_already_denied`. The
requester receives a `permission_request.decided` notification
(`outcome: "rejected"`). The audit event is `permission_denied`, with
`reason` and `deny_id` in its detail.

```json
{ "id": "uuid", "status": "rejected", "deny_id": "uuid" }
```

### Active grants and denies

`GET /permissions/grants` and `GET /permissions/denies` require
`workspace.admin`; non-admin callers receive `403 permission.denied`. Both
return `{ items }` for the current workspace, ordered newest first, without
pagination. Grant items contain `id`, `actor_id`, `capability`,
`managed_system_id`, `granted_by_actor_id`, `granted_at`, and `expires_at`.
Only rows with `revoked_at IS NULL`, proposed `superseded_at IS NULL`, and no
expiry or a future expiry are returned. Deny items contain `id`, `actor_id`, `capability`,
`managed_system_id`, `reason`, `created_by_actor_id`, and `created_at`; only
rows with `revoked_at IS NULL` are returned.

### `POST /permissions/grants/:id/revoke` and `/permissions/denies/:id/revoke`

Both commands require `workspace.admin`, use the `sensitive` rate-limit tier,
and accept a strict body `{ reason: string }`. The reason is trimmed and must
contain 1–2000 characters. An optional UUIDv4 `Idempotency-Key` replays the
same `200` response for the same Actor, key, and body; the Admin capability is
checked inside the transaction before replay. Reusing the key with a different
body returns `409 conflict.idempotency_key_reuse`.

Each command locks its target row in the current workspace. A missing row or a
row from another workspace returns `404 not_found.record`. An already-revoked
row, expired grant, or proposed superseded grant returns `409 conflict.permission_not_active`.
The `:id` path parameter must be a UUID; otherwise the route returns
`422 validation.failed`.

Grant revoke sets `revoked_at`, `revoked_by_actor_id`, and `revoked_reason`,
then writes one `permission_revoked` audit row with subject type
`permission_grant` and detail `{ grant_id, capability, managed_system_id,
grantee_actor_id, reason }`. The grantee receives the in-app and email
`permission_grant.revoked` notification. Its subject reference is allowed for
the grantee and workspace Admins and unavailable to other Actors.

Deny lift sets `revoked_at` and `revoked_by_actor_id`, then writes one
`permission_deny_revoked` audit row with subject type `permission_deny` and
detail `{ deny_id, capability, managed_system_id, denied_actor_id, reason,
self_lift?: true }`; `self_lift` is present only when the deny targets the
Admin lifting it.
The reason is retained in the audit row; the deny table has no reason-for-lift
column. A self-lift follows `permission_self_approval`: `forbidden` returns
`403 permission.denied` without changing the row or writing an audit event, and
`allowed` permits the lift. An Admin may revoke their own grant because it only
lowers privilege. Lifting a deny sends no notification.

Both return `200 { id, revoked_at }`. Permission Request status is unchanged.
Expired reissue under ADR-0066 inserts a fresh ID after marking its exact-tuple
predecessor superseded_at; audit and both writes are atomic. Preserve grant
provenance/revoke metadata and full unique scope tuple, exclude superseded rows
from all effective readers and seed checks, and keep old-ID revoke 409.
The next permission check observes the revocation immediately; a revoked grant
is requestable again, and so is an expired grant (#767), while an explicit active
deny remains non-requestable.

## Proposed requester and selected-read contracts (ADR-0066)

All commands below use strict shared schemas (proposed/new under
`packages/shared/src/permissions/`). IDs must be UUIDs; revision is a positive
integer. Unknown keys, missing revision, malformed fields/unsupported scope or
past resolved expiry return `422 validation.failed` with field paths. Malformed
UUIDv4 key returns `validation.malformed_idempotency_key`.

Owner item lookup combines ID + session workspace + requester, with no Admin
bypass: missing/foreign/non-owner all `404 not_found.record`. Admin reads/commands
check `workspace.admin` first (403 on failure), then workspace-filtered 404.
Require session for all reads/writes (401 if invalid). Optional UUIDv4 mutation
keys replay stored success after authorization, before status/revision validation;
hash action/ID/revision/body. Different-body reuse is 409
`conflict.idempotency_key_reuse`. Transaction/audit/idempotency failure rolls back
all writes. Read endpoints accept no Idempotency-Key and have no mutation tier.

### `POST /permission-requests/:id/cancel` (proposed/new)

Strict body `{ expected_revision: positive_integer, reason?: string }`; trim
reason, max 2000, empty treated as omitted. Requester only; `pending` or
`needs_more_info` only. Lock/reload and compare revision inside the idempotent run;
wrong status/revision is `409 conflict.stale_write` with `{ current_revision }`
(proposed detail shape after authorization). Success:
`200 { id, status: cancelled, updated_at, revision }`. Use mutation rate-limit tier.
Set cancelled, advance revision/time, free existing open uniqueness. Strict new
`permission_request_cancelled` request-subject audit includes previous status,
requester/capability/scope, reason if supplied and previous/resulting revisions.
No grant, deny, entity link, notification, blocked-action execution or queue write;
derived open Dashboard/mine counts lose this request. No owner-resolution effects.

### `PATCH /permission-requests/:id` (proposed/new)

Strict body `{ expected_revision, reason?, requested_managed_system_id?: uuid | null,
requested_expiration?: iso8601 | null }`. Only `pending`; needs_more_info uses its
existing supplement path. Omit keeps, null clears nullable values only if policy
allows. Immutable requester/capability/source/return intent cannot be supplied.
Retain ID, advance revision/time, return `200 { id, status: pending, updated_at,
revision }`. Use mutation tier. Validate supported scope/expiry and resolved reason,
including sensitive reason requirements, inside transaction; reject legacy object
scope. Changed scope already held is `409 conflict.capability_already_granted`;
complete open-tuple collision is `409 conflict.permission_request_duplicate`.
No partial writes; status/revision rules match cancel. New strict request-subject
`permission_request_updated` audit includes identity, complete previous/resulting
editable reason/scope/expiry and revisions. No grant/deny/link/notification/domain
action or queue write; derived status lists reflect current request. No owner resolution.

### Requester mine and `GET /permission-requests/:id` (#1080 / #1081)

Mine stays session-only and owner/open scoped; add revision, requested_expiration,
updated_at and return_route_intent to existing items. Selected owner detail returns
current request identity, reason, supported requested scope, source/return intent,
status/timestamps/revision, latest Admin question (nullable), typed editable scope
candidates and allowed actions (edit only pending, supplement only needs_more_info,
withdraw either open; terminal none). Latest question comes through a Core-owned
audit projection, not a Permission query into audit storage. No risk, deny internals,
email, raw Survey text or unsafe source summaries. Item ownership 404 as above.
No writes, audits, links, notifications, queue or default-owner effects for these reads.

### `GET /permissions/requests/:id` (#1081)

Admin selected read, 200 current request/revision and requested/source context,
requester display name/Role Level, effective access/scope/expiry, administrative
authority context, authorized safe source summary when available, matching active
deny state, typed approval scope candidates and allowed decision actions. Terminal
requests have no actions. Risk is `risk_indicators: [{ code, evidence }]` with
proposed codes `sensitive_capability`, `workspace_scope`, `no_expiration`,
`active_deny`; evidence contains the corresponding capability, requested scope,
null expiry or overlapping deny scope. Workspace asks overlap all active denies
for that capability; system asks match workspace/same-system denies, not sibling
or revoked denies. A successful zero-signal result is `[]`; failed computation
returns an error (existing `internal.unexpected` 500), never a false safe result.
Permission computes only selected-row context, no per-list-row risk/large source
collection scan. Source-owner gates/allowlists apply; Admin without personal Survey
capability receives no restricted response text. No email or deny-reason leakage
into requester detail. Read has no writes/audits/links/notification/queue/default effects.

Selected response contracts are exported as `permissionRequestOwnerDetailSchema`
and `permissionRequestAdminDetailSchema` from
`packages/shared/src/permissions/selected-detail.ts`. Both responses carry the
request fields at the top level, preserving the mine names, plus
`requester_actor_id` and nullable `source_summary`. Owner detail adds
`latest_admin_question`, `editable_scope_candidates`, and `allowed_actions`
(`edit`, `supplement`, `withdraw`). Admin detail adds `requester`
(`id`, `display_name`, `role_level`), `effective_access`,
`administrative_authority`, `approval_scope_candidates`, `matching_denies`,
`risk_indicators`, and decision `allowed_actions`
(`approve`, `reject`, `need_more_info`, `deny`).

`effective_access` contains the existing capability `decision`, effective `scope`,
and the selected decision grant's nullable `expires_at` and
`granted_managed_system_id`; role-derived access has no grant expiry.
`administrative_authority` records the reviewer's `workspace.admin` authority,
`is_requester`, resolved `permission_self_approval`, and
`self_approval_required`. Forbidden self-approval omits `approve` from actions.
Scope candidates never broaden or move a system request to a sibling. If the
original requested scope is unsupported by the command's shared scope policy
(including legacy workspace-scoped Developer capabilities and object requests),
Admin detail returns no approval candidates or `approve` action. Supported
workspace `survey.export` requests retain workspace approval and system narrowing;
non-approving decisions and requester withdrawal remain available for open requests.

Risk evidence is a strict union: `sensitive_capability` has `{ capability }`,
`workspace_scope` has `{ managed_system_id: null }`, `no_expiration` has
`{ requested_expiration: null }`, and `active_deny` has
`{ denies: [{ id, managed_system_id }] }`. Matching denies expose only ID and
scope, with no deny reason. Historical unknown capability data fails selected
context calculation with `internal.unexpected`; collection reads stay minimal.

VOC and Task owner projections return only authorized
`{ type, id, display_id, status }` navigation metadata by workspace and source ID.
Their existing source-owner read gates apply, independently of review authority:
VOC uses scope-or-reporter visibility; Task requires an elevated Role Level and
`finding.manage`, matching its shipped detail route.
Survey, Survey Response and other unavailable sources remain opaque with
`source_summary: null`; selected reads do not query raw Survey candidate or
response readers. Selected context uses a repeatable-read, read-only transaction
without recipient/request mutation locks. The Core question projection is called
only after owner authorization; Auth owns the email-free display-name projection.

## Direct-grant contracts (ADR-0066 / #1085)

### `GET /permissions/grant-options?actor_id={uuid}`

Admin capability gate before data; invalid/missing UUID is 422 validation.failed;
unknown/foreign recipient is 404 not_found.record. Return 200 recipient ID/display
name/Role Level, typed supported capability/scope candidates, governance/self-policy
requirements, and advisory preflight per candidate: matching open request ID/review
route, overlapping deny IDs/lift destination, or available. All references are
workspace-filtered Admin-safe; no email. Workspace comes from session. Read has
no mutation tier, idempotency, writes/audits/links/notifications/queue/default effects.

The strict response is `permissionGrantOptionsSchema` in
`packages/shared/src/permissions/admin.ts`:

```ts
{
  recipient: { id: uuid, display_name: string, role_level: 'admin' | 'developer' | 'user' },
  self_policy: 'allowed' | 'forbidden',
  self_approval_required: boolean,
  candidates: [{
    capability: known_capability,
    managed_system_id: uuid | null,
    governance_required: boolean, // true only for workspace.admin
    preflight:
      | { state: 'available' }
      | { state: 'request_review', request_id: uuid, review_route: string }
      | { state: 'deny_lift', deny_ids: uuid[], lift_route: string }
  }]
}
```

`available` means no matching open ask or overlapping active deny; it is advisory,
and submission still checks active duplicates and all write-time rules. Review links
use `/admin/permissions/requests?selected={request_id}`; deny lift links use
`/admin/permissions/grants?tab=denies&selected={first_deny_id}`. Deny IDs sort by ID.
Workspace governance confirmation belongs to the form, with no extra backend body key.

### `POST /permissions/grants`

Strict body `{ actor_id: uuid, capability: known_capability,
managed_system_id?: uuid, expires_at?: iso8601, reason: string,
self_approval?: { policy_citation: string, peer_reviewer_absence: string } }`.
Omitted managed_system_id means workspace only when capability policy permits;
omitted expiration means permanent. No object/team/Analytics Area/free-text scope.
Reason is trimmed 1–2000 for all direct grants; supplied expiry must be future.
Known capability vocabulary is `CAPABILITY_META`; server validates current active
workspace scope candidates. `workspace.admin` is workspace-only and selected via
an explicitly named governance mode with reason and confirmation in the form.
No ordinary request-access candidate offers it. Self-grant forbidden returns 403
permission.denied; allowed requires the strict non-empty existing self envelope.
Another-Actor envelope or missing/invalid allowed-self envelope is 422 validation.failed.

Sensitive tier (5/minute/Actor); optional UUIDv4 key. Gate workspace.admin inside
transaction before replay, even if access was denied since the original submit.
Unknown/cross-workspace recipient 404; invalid fields, scope, expiry, reason or
self envelope 422; active duplicate `409 conflict.capability_already_granted`.
Matching open ask is `409 conflict.permission_request_duplicate` with proposed
Admin-safe `{ request_id, review_route }`; overlapping active deny is
`409 conflict.capability_already_denied` with proposed `{ deny_ids, lift_route }`.
Extend the closed error detail union (ADR-0012), without inventing error codes.
If both exist, matching ask directs to review; review still obeys deny precedence.
For workspace grant, any same-capability deny overlaps; for system grant only
workspace/same-system denies overlap. Neither request nor deny is silently changed.

Resolve/lock recipient through Auth seam; use recipient → request when relevant →
workspace policy → grant order and shared Permission grant command with approval.
Request creation/edit/supplement serialize by recipient too. Expired exact-tuple
reissue sets proposed superseded_at and inserts a fresh ID; no in-place renewal.
Return `201` actual `permissionGrantAdminItemSchema` item, parsed through shared
schema (`packages/shared/src/permissions/admin.ts`), not fabricated form input.
New strict `permission_granted` grant-subject audit includes actual grant/recipient/
capability/scope/reason/expiry, create/reissue mode, predecessor ID on reissue,
self_grant: true and envelope only on self grant. Failed audit rolls back predecessor,
replacement and idempotency. No fake request, Role Level change, entity link,
request-decided notification or automatic domain action. No stored queue writes or
owner/reviewer resolution. Next privileged call on an existing recipient session
sees access immediately; invalidate client check/scope/grant caches on success.
