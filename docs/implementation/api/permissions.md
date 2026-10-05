# Permission

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Permission

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
  requested_object_type?: string;
  requested_object_id?: uuid;
  reason: string;
  requested_expiration?: iso8601;
  source_object_type?: string;
  source_object_id?: uuid;
  source_action_id?: string;
  return_route_intent?: string;
}
```

The response remains `{ id: uuid, status: "pending", created_at: iso8601 }`.

### `POST /permission-requests/:id/submit-more-info`

Any authenticated member may resubmit a request only when the request belongs
to that actor in the current workspace and has status `needs_more_info`. Admins
use the same requester check; there is no admin bypass. An unknown request id,
a request in another workspace, or another member's request returns
`404 not_found.record`.

The strict request body accepts:

```ts
{
  reason?: string; // 1–2000 characters
  requested_managed_system_id?: uuid | null;
  requested_object_type?: string | null; // at least 1 character when present
  requested_object_id?: uuid | null;
  requested_expiration?: iso8601 | null;
}
```

Omitted values keep the stored value. JSON `null` clears the four nullable
scope and expiration columns; `reason` cannot be null.
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
  "updated_at": "iso8601"
}
```

The command locks the request row inside the transaction and accepts only
`needs_more_info`; all other statuses return `409 conflict.stale_write`. A
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
      "status": "pending | needs_more_info | approved | rejected",
      "created_at": "iso8601"
    }
  ],
  "count": 0
}
```

`GET /permissions/requests` is the canonical Admin review-console list and
accepts `status=pending|needs_more_info|approved|rejected|all`; without a
status it returns open requests. It uses the same review item shape, including
`requested_expiration`. The detail panel is populated from that item and shows
the same requested value; no separate detail endpoint is used.

### `POST /permissions/requests/:id/approve`

The strict approve body accepts:

```ts
{
  reason?: string;
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
is the resolved value. The `permission_approved` audit detail records both
`requested_expiration` and `granted_expiration`, each as `iso8601 | null`.

### `POST /permissions/requests/:id/reject`, `/need-more-info`, `/deny`

The three non-approving decisions share the approve route's gate and
transaction shape. Each requires `workspace.admin` (checked before any
`Idempotency-Key` replay, so a cached response never bypasses it); a
non-admin caller receives `403 permission.denied`. The request row is locked
inside the transaction. An unknown id or one from another workspace returns
`404 not_found.record`. Only `pending` and `needs_more_info` requests are
decidable; any other status returns `409 conflict.stale_write`. Unknown body
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
{ reason?: string } // max 2000 characters; must be non-empty after trimming
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
{ note?: string } // max 2000 characters; must be non-empty after trimming
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
{ reason?: string } // max 2000 characters; must be non-empty after trimming
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
Only rows with `revoked_at IS NULL` and no expiry or a future expiry are
returned. Deny items contain `id`, `actor_id`, `capability`,
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
row, or an expired grant, returns `409 conflict.permission_not_active`.
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
The next permission check observes the revocation immediately; a revoked grant
is requestable again, and so is an expired grant (#767), while an explicit active
deny remains non-requestable.
