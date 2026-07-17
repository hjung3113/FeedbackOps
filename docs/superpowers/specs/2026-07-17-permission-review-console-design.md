# Permission Review Console — Design (MVP)

**Date:** 2026-07-17
**Status:** Approved (design), pending spec review → plan
**Milestone:** Slice 7: Action Dashboard (admin surface)
**Risk tier:** Full Cluster (auth/permissions, `packages/shared` audit enums, migration, cross-module)

## Problem

Admins cannot grant, deny, or decide access requests from the UI. The RBAC machinery
(`permission_grants` / `permission_denies` / `permission_requests`, capability checks in
`check-service.ts`) is fully built, and `/admin/permissions/requests` already lists **pending** requests
read-only — but the only way to actually issue a grant or a deny today is seed/SQL. There is no
approve/reject/deny path. The admin sidebar link even points at `/admin/placeholder`, a dead stub.

This chunk closes the review loop: an admin reviews a pending permission request and decides it, and the
decision writes real `permission_grants` / `permission_denies` rows + audit, so `check-service` starts
allowing (or denying) the capability.

## Scope

### In (MVP — core review loop)

Four decisions on a **decidable** request (`status ∈ {pending, needs_more_info}`):

1. **approve** → mint a `permission_grant`; request → `approved`.
2. **reject** → request → `rejected` (no grant); reason required.
3. **need-more-info** → request → `needs_more_info`; note required.
4. **explicit-deny** → mint a `permission_deny` (overrides allow) + request → `rejected`; reason required.

Locked rules (from `docs/design/09-permission-access.md` + prototype `screen-permissions.jsx`):

- **Approval does NOT auto-run the originally blocked action.** The requester must re-invoke it. The
  decision endpoints have no side effect beyond the grant/deny row + status + audit.
- **Explicit deny overrides allow** (`check-service` step 2 already honors `permission_denies`).
- Reason gating: required (non-empty, trimmed) for **reject**, **explicit-deny**, **need-more-info**, and
  for **approve of a sensitive capability** (`isSensitiveCapability`). Optional for non-sensitive approve.

### Out (deferred to v2 — explicitly NOT in this chunk)

- **Self-approval audit capture** (Pack 8: policy-citation + no-peer-reviewer envelope, `SELF_APPROVAL`
  label). Requires an extra audit sub-envelope + FE fields. Self-approval simply follows the normal
  admin gate for now.
- **Revoke** an active grant/deny from the console.
- **Direct grant** (admin grants without a preceding request).
- **Risk scoring** UI (prototype's low/medium/high chips). No `risk` column exists; not modeled in MVP.
- Requester-side "respond to needs_more_info" round-trip beyond seeing the question.

## Architecture

Built **backend-first, then frontend** (two implementation phases; sequenced by the plan).

### Backend — `apps/backend/src/modules/permissions/`

New `decision-service.ts` (sibling to `request-service.ts`, `check-service.ts`) exposing four operations,
each: (a) `workspace.admin` gate via `checkService.checkCapability`, (b) load the request FOR UPDATE in a
tx, (c) assert it is decidable (else `conflict.stale_write` 409), (d) perform the write, (e) audit in the
same tx, (f) Idempotency-Key support mirroring `request-service.createRequest` (advisory xact lock +
`idempotencyService`).

Routes (all `POST`, admin-gated, in `permissions/routes.ts`):

| Route | Effect |
|---|---|
| `POST /permissions/requests/:id/approve` | Insert `permission_grants`: `capability = request.requested_capability`, `managed_system_id = request.requested_managed_system_id`, `expires_at = request.requested_expiration`, `granted_by_actor_id = admin`, `sensitive_reason = reason ?? null`. Request → `approved`, `updated_at = now()`. Audit `permission_approved`. |
| `POST /permissions/requests/:id/reject` | Request → `rejected`, `updated_at`. Audit `permission_rejected`. Reason required. |
| `POST /permissions/requests/:id/need-more-info` | Request → `needs_more_info`, `updated_at`. Audit `permission_needs_more_info` (note in detail). Note required. |
| `POST /permissions/requests/:id/deny` | Insert `permission_denies`: `capability`, `managed_system_id`, `reason` (required), `created_by_actor_id = admin`. Request → `rejected`, `updated_at`. Audit `permission_denied`. |

Guards / edge cases:

- **Decidable check:** only `pending | needs_more_info` proceed; anything else → `conflict.stale_write`.
- **Approve idempotence vs active-unique:** `permission_grants_active_uq (workspace, actor, capability)
  WHERE revoked_at IS NULL` — a second approve for an actor who already holds an active grant on that
  capability raises 23505 → map to `conflict.capability_already_granted` (mirrors request-service).
- **Deny active-unique:** `permission_denies_active_uq` similarly; a duplicate active deny → same-shaped
  conflict.
- **Scope note:** the grant's `managed_system_id` is copied verbatim from the request (null =
  workspace-wide). Admin cannot narrow/alter scope in MVP (that is a v2 concern).

`packages/shared`:

- Add audit event types to `AUDIT_EVENT_TYPES`: `permission_approved`, `permission_rejected`,
  `permission_needs_more_info`, `permission_denied`, plus their `AUDIT_EVENT_DETAIL_SCHEMAS` entries
  (capability, managed_system_id, subject requester actor id, reason/note, grant_id/deny_id where
  applicable).
- Response/request DTO schemas for the four decision endpoints (Zod), consumed by FE.

Admin list extension (`request-service.listAllActive` or a new `listForReview`):

- Today it returns only `pending | needs_more_info`. The console's Approved/Rejected/All tabs need decided
  rows. Extend the admin list to accept an optional status filter (or return all statuses with the status
  field) so the FE can tab across the lifecycle. Keep the `workspace.admin` gate.

Migration: the `permission_requests.status` CHECK already admits all six states (no schema change for
status). No new columns needed for MVP. **Confirm during planning** whether a migration is required at all
(likely none — all target columns exist).

### Frontend — `apps/frontend/src/routes/_authed/admin/permissions/requests.tsx` (+ feature hooks)

Upgrade the read-only list into the review console modeled on `docs/design-prototype/screen-permissions.jsx`:

- **Tabs:** Pending / Needs info / Approved / Rejected / All (client tabs over the extended admin list).
- **Detail panel:** decision section (action picker approve/need-info/reject/deny), reason textarea with
  the gating above, submit calling the matching mutation with a fresh Idempotency-Key, query invalidation
  on success; requester/capability/scope/reason/audit sections read-only.
- **Approval-does-not-auto-run** notice preserved in the panel copy.
- New hooks: `useDecidePermissionRequest` (or one per action) + the extended admin list query.
- **Sidebar fix:** `AppSidebar.tsx` admin link currently → `/admin/placeholder`; point it at
  `/admin/permissions/requests` (or an admin landing that defaults there).
- Korean UI copy (match the app, not the prototype's mixed EN/KO literally — structure is the contract).

## Data flow

Admin opens console → GET extended admin list (pending default tab) → selects a request → decision panel →
POST decision (Idempotency-Key) → server gates `workspace.admin`, asserts decidable, writes grant/deny +
status + audit in one tx → FE invalidates the list + any `permission-check` queries → requester (later)
re-runs the previously blocked action, which now passes `check-service`.

## Error handling

- Non-admin caller → `permission.denied` (403).
- Already-decided request → `conflict.stale_write` (409); FE surfaces "이미 처리된 요청" and refetches.
- Duplicate active grant/deny → `conflict.capability_already_granted` (409).
- Missing reason where required → `validation.*` (400); FE blocks submit client-side too.
- Unknown request id → `not_found.record` (404).

## Testing

**Backend integration** (throwaway DB, `fops_app` app handle + migrate handle):

- approve → a follow-up `check-service.checkCapability` for that actor/capability now returns
  `allow: true, via: 'direct_grant'` (or `managed_system_scope` for MS-scoped).
- explicit-deny → `check-service` returns `allow: false, reason: 'explicit_deny'`, even if a grant exists.
- reject / need-more-info → request status transitions; no grant minted.
- admin-only gate: a developer actor gets 403 on every decision route.
- stale-write: deciding an already-approved request → 409.
- duplicate approve → `capability_already_granted`.
- audit: one audit row per decision with the right event_type + subject.
- Idempotency: same key replays the stored response, no double grant.

**Frontend** (vitest, jsdom, mocked hooks):

- Console renders the five tabs and filters the list per status.
- Decision panel: each action calls the right mutation; reason gating blocks submit when required-and-empty;
  success invalidates the list.
- Non-vacuous (would fail if the mutation wiring were removed).

## Build order

1. **Backend chunk** — decision-service + 4 routes + shared audit enums/DTOs + list extension + tests.
   (Full Cluster: CODEX + REVIEWER + VERIFIER.)
2. **Frontend chunk** — console upgrade + sidebar fix + tests. (Full Cluster FE + VISUAL deferred like
   127-e, unless the durable-Playwright gap #173 is addressed first.)

## Open questions to resolve in planning

- Exact shape of the extended admin list (status-filter param vs return-all) — pick the smaller change.
- Whether any migration is needed (expected: none; all columns exist).
- New audit `AUDIT_EVENT_DETAIL_SCHEMAS` field lists — finalize against `audit-service.record` usage.
