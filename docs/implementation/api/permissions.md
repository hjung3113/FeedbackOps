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
GET /permission-requests/mine     # caller's open requests
POST /permission-requests/:id/approve   # 미구현 as of Slice 6 — permission request approval workflow not started
POST /permission-requests/:id/reject    # 미구현 as of Slice 6 — permission request rejection workflow not started
POST /permission-requests/:id/revoke    # 미구현 as of Slice 6 — permission grant/request revoke workflow not started
```

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
