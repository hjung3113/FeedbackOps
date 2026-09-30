# Permission

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Permission

```text
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
```

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
open (`pending` | `needs_more_info`) requests, plus a `count`. Guarded by the
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
      "reason": "string",
      "status": "pending | needs_more_info",
      "created_at": "iso8601"
    }
  ],
  "count": 0
}
```
