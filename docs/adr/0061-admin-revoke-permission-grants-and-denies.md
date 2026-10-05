# ADR-0061: Admin revokes active permission grants and denies

Date: 2026-10-05

## Status

Accepted 2026-10-05 by the owner (issue #762). Amends ADR-0006 only by naming the write path that its "permission
revocations take effect immediately" rule relies on. Adds one code to the ADR-0012 closed enum and one event to the
ADR-0014 notification catalogue.

## Context

FR-PERM-002 (`docs/design/09-permission-access.md`) says an Admin can revoke existing grants. The schema already
supports it:

- `permission.permission_grants` has `revoked_at`, `revoked_by_actor_id` and `revoked_reason`.
- `permission.permission_denies` has `revoked_at` and `revoked_by_actor_id`, and no reason column.
- `fops_app` already holds UPDATE on both tables.
- `check-service` already skips revoked rows.

But nothing writes these columns. The only way to take back a capability is a direct database write.
`docs/implementation/05-permission-policy.md` lists `permission_revoked` as a planned audit event.

Two existing behaviours shape the design:

- Grants and denies do not reference the Permission Request that created them. Some grants have no request at all.
- When the only grant it finds is revoked, `checkCapability` returns `grant_revoked` with `requestable: null`. The
  frontend `revoked` state has no request call to action, and there is no direct-grant flow. Without a change, one
  revocation would lock the Actor out of that capability for good.

## Decision

1. **Revoke acts on the grant or deny itself, not on a Permission Request.**
   - `POST /permissions/grants/:id/revoke` revokes a grant.
   - `POST /permissions/denies/:id/revoke` lifts a deny.
   - Both take a body of `{ reason }`. The reason is required, trimmed, 1–2000 characters, and the body is strict.
   - Both mirror the Permission Request decision routes: optional UUIDv4 `Idempotency-Key`, the `sensitive`
     rate-limit tier, and `workspace.admin` checked inside the transaction before any idempotency replay.
   - Permission Request status is not changed. A request records what was asked and decided. The grant row and the
     audit log record its later revocation.
2. **Only active rows can be revoked.**
   - An active grant has `revoked_at IS NULL` and either no `expires_at` or one in the future.
   - An active deny has `revoked_at IS NULL`.
   - The target row is locked `FOR UPDATE`. A row that is missing or belongs to another workspace returns
     `404 not_found.record`.
   - A row that is already revoked, or a grant that has expired, returns `409 conflict.permission_not_active`. This
     is a new code in the ADR-0012 closed enum.
3. **Writes.**
   - A grant gets `revoked_at = now()`, `revoked_by_actor_id`, and `revoked_reason = reason`.
   - A deny gets `revoked_at` and `revoked_by_actor_id`. Its reason lives only in the audit row, so no migration is
     needed.
4. **Audit.** Each command writes one row in the same transaction.
   - `permission_revoked`: subject `permission_grant` / grant id. Detail is `{ grant_id, capability,
     managed_system_id, grantee_actor_id, reason }`.
   - `permission_deny_revoked`: subject `permission_deny` / deny id. Detail is `{ deny_id, capability,
     managed_system_id, denied_actor_id, reason }`.
   - Both detail schemas are strict and registered in `packages/shared/src/audit/permission.ts`.
5. **Effect is immediate.**
   - `checkCapability` reads grants and denies on every call, and no capability cache exists, so the next request
     sees the change (ADR-0006).
   - Sessions are not terminated. Role-derived capabilities are not grants and cannot be revoked here.
6. **Revocation is not a ban.** An explicit deny remains the tool for blocking a capability.
   - When `checkCapability` would return `grant_revoked`, it now returns the same `requestable` scopes as the
     `no_grant` branch instead of `null`.
   - The state mapper maps `grant_revoked` to `pending_request` while the Actor has a pending or needs_more_info
     request for that capability. Otherwise it maps to `revoked`.
   - The frontend `revoked` state keeps its "취소되었습니다" copy and adds the existing request-access action.
   - `grant_expired` is unchanged. The same lock-out exists for expiry and is tracked separately.
7. **Notification.** Revoking a grant notifies the grantee through a new catalogue event `permission_grant.revoked`.
   - Subject type is `permission_grant`. It is in-app and email, like `permission_request.decided`.
   - The summary reuses the shipped wording "권한이 취소되었습니다.".
   - The subject reference resolves as `allowed` (short id, capability) for the grantee and workspace Admins, and
     `unavailable` for anyone else.
   - The Inbox shows it without a link, like `permission_request.decided`.
   - Lifting a deny sends no notification.
8. **Read model.** `GET /permissions/grants` and `GET /permissions/denies` are `workspace.admin` only. Each returns
   `{ items }` with the active rows of the workspace, newest first, with no pagination. This mirrors
   `GET /permissions/requests`.
   - Grant items: `id, actor_id, capability, managed_system_id, granted_by_actor_id, granted_at, expires_at`.
   - Deny items: `id, actor_id, capability, managed_system_id, reason, created_by_actor_id, created_at`.
9. **UI.** A new Admin screen, `/admin/permissions/grants`, labelled "활성 권한".
   - It sits next to the Permission Requests console in the Admin navigation. It is a `ListShell` with tabs
     `권한 | 차단`, `ObjectRow` rows, and a detail panel holding a required reason field and the revoke or lift action.
   - No prototype screen exists. Per ADR-0060 it mirrors the shipped Permission Requests console, including the URL
     state `tab`/`selected` and the `PermissionGate` on `workspace.admin` (ADR-0056).

## Consequences

- An Admin can take back any grant, including grants that no request created, and lift any deny. Both actions leave
  an audit row with a reason.
- A revoked Actor can request the capability again. A deny is still the way to make a capability unrequestable.
- Expiry keeps the old lock-out until its follow-up lands.
- Docs to update with the implementation: `docs/implementation/api/permissions.md`, `05-permission-policy.md`
  (events and lifecycle), `docs/design/09-permission-access.md` FR-PERM-002 status, `docs/design/13-mvp-roadmap.md`
  Phase 1, `docs/frontend/routes-and-layout.md`, and the notification catalogue doc, if one lists events.
