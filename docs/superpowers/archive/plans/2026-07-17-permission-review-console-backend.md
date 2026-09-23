# Permission Review Console — Backend Chunk Implementation Plan

> **Execution routing:** This repo executes via the **agent-workflow** (cmux × Codex × Claude,
> evidence-gated: CODEX implements in a sandboxed worktree, REVIEWER in a clean context, VERIFIER proves
> green outside the sandbox). This plan is the dispatch contract for the backend chunk — NOT superpowers
> subagent-driven-development. Tasks below define the scoped touch set, interfaces, and the test matrix the
> VERIFIER must see pass.

**Goal:** Give admins backend endpoints to decide a pending permission request — approve (mint grant),
reject, need-more-info, explicit-deny (mint deny) — writing real `permission_grants`/`permission_denies`
rows + audit, so `check-service` starts allowing/denying the capability.

**Architecture:** New `decision-service.ts` in the existing `permissions` module, four admin-gated `POST`
routes, new shared audit event types + decision DTOs, and an admin-list extension so decided requests are
listable. Backend-only chunk; the FE console is a separate plan.

**Tech Stack:** Fastify + Drizzle (Postgres, `permission` schema), Zod DTOs in `packages/shared`, vitest
integration tests, the existing `auditService` + `idempotencyService` + `checkService`.

## Global Constraints

- Every decision route is gated by `workspace.admin` via `checkService.checkCapability` (mirror
  `request-service.listAllActive`); non-admin → `permission.denied` (403).
- All writes happen in ONE `db.transaction`; the audit row is written in the same tx.
- Idempotency-Key support mirrors `request-service.createRequest` (advisory xact lock + `idempotencyService`).
- Decidable = request `status ∈ {pending, needs_more_info}`; anything else → `conflict.stale_write` (409).
- **Approval has NO side effect beyond the grant row + status + audit** — it must NOT auto-run the blocked action.
- Reason required (non-empty, trimmed) for reject, deny, need-more-info, and for approve of a
  `isSensitiveCapability` capability; optional for non-sensitive approve.
- Grant scope is copied verbatim from the request (`requested_managed_system_id`, `requested_expiration`);
  admin does not alter scope in this chunk.
- Doc-sync: update `docs/implementation/05-permission-policy.md` (decision lifecycle) in the same chunk.

## File Structure

- Create: `apps/backend/src/modules/permissions/decision-service.ts` — the four decision operations.
- Modify: `apps/backend/src/modules/permissions/routes.ts` — add 4 POST routes + admin-list status filter.
- Modify: `apps/backend/src/modules/permissions/request-service.ts` (or a new `list-service`) — extend the
  admin list to include decided statuses via an optional filter.
- Modify: `packages/shared/src/enums/audit-events.ts` — 4 new event types + detail schemas.
- Create/Modify: `packages/shared/src/permissions/*` — decision request/response DTO Zod schemas.
- Test: `apps/backend/src/modules/permissions/__tests__/decision.integration.test.ts` — the matrix below.
- Modify: `docs/implementation/05-permission-policy.md` — decision lifecycle + endpoints.

## Interfaces (produced by this chunk, consumed by the FE plan)

```ts
// decision-service.ts
type DecideDeps = { db: Db; checkService: CheckService; auditService: AuditService; idempotencyService: IdempotencyService };
type DecisionResult = { status: number; body: { id: string; status: 'approved' | 'rejected' | 'needs_more_info'; grant_id?: string; deny_id?: string } };

approveRequest(actor: ActorContext, requestId: string, body: { reason?: string }, opts?: { idempotencyKey?: string }): Promise<DecisionResult>
rejectRequest(actor: ActorContext, requestId: string, body: { reason: string }, opts?): Promise<DecisionResult>
needMoreInfoRequest(actor: ActorContext, requestId: string, body: { note: string }, opts?): Promise<DecisionResult>
denyRequest(actor: ActorContext, requestId: string, body: { reason: string }, opts?): Promise<DecisionResult>
```

Routes (all admin-gated, Idempotency-Key optional header):
- `POST /permissions/requests/:id/approve`  body `{ reason?: string }`
- `POST /permissions/requests/:id/reject`   body `{ reason: string }`
- `POST /permissions/requests/:id/need-more-info` body `{ note: string }`
- `POST /permissions/requests/:id/deny`      body `{ reason: string }`
- `GET  /permissions/requests` extended: optional `?status=pending|needs_more_info|approved|rejected|all`
  (default keeps current active-only behavior for back-compat).

New shared audit event types: `permission_approved`, `permission_rejected`, `permission_needs_more_info`,
`permission_denied`, each with an `AUDIT_EVENT_DETAIL_SCHEMAS` entry
(`{ capability, managed_system_id, requester_actor_id, reason|note, grant_id?|deny_id? }`).

---

## Task 1: Shared audit event types + decision DTOs

**Files:** Modify `packages/shared/src/enums/audit-events.ts`; create/modify `packages/shared/src/permissions/decisions.ts` (+ barrel export).

**Deliverable:** the 4 event types are in `AUDIT_EVENT_TYPES` with matching detail schemas; decision
request/response DTO schemas exist and are exported from `@fops/shared`. `pnpm --filter @fops/shared build`
(or typecheck) clean.

- [ ] Add `permission_approved`, `permission_rejected`, `permission_needs_more_info`, `permission_denied`
  to `AUDIT_EVENT_TYPES`, and add each to `AUDIT_EVENT_DETAIL_SCHEMAS` with a strict Zod object
  (`capability: string`, `managed_system_id: uuid nullable`, `requester_actor_id: uuid`,
  `reason`/`note: string`, plus `grant_id: uuid` for approved / `deny_id: uuid` for denied).
- [ ] Add decision DTO schemas (approve/reject/need-info/deny request bodies + the `DecisionResult` body).
- [ ] Commit: `feat(shared): permission decision audit events + DTOs`.

## Task 2: decision-service.ts — the four operations

**Files:** Create `apps/backend/src/modules/permissions/decision-service.ts`. This is the core.

**Consumes:** `CheckService`, `AuditService`, `IdempotencyService`, the `permission_grants` /
`permission_denies` / `permission_requests` schema, `isSensitiveCapability`.

**Deliverable (behavior — the VERIFIER proves it, not step-by-step here):**
- Each op: admin gate → `SELECT ... FOR UPDATE` the request in a tx → assert decidable → write → audit → return.
- `approveRequest`: insert `permission_grants` (`capability`, `managed_system_id`, `expires_at` from the
  request; `granted_by_actor_id = actor`; `sensitive_reason = reason ?? null`); set request `approved`,
  `updated_at = now()`; audit `permission_approved` with `grant_id`. On 23505 →
  `conflict.capability_already_granted`. Reason required iff `isSensitiveCapability(capability)`.
- `rejectRequest`: set `rejected`; reason required; audit `permission_rejected`.
- `needMoreInfoRequest`: set `needs_more_info`; note required; audit `permission_needs_more_info` (note in detail).
- `denyRequest`: insert `permission_denies` (`capability`, `managed_system_id`, `reason`,
  `created_by_actor_id = actor`); set request `rejected`; audit `permission_denied` with `deny_id`. On
  23505 → `conflict.capability_already_denied` (shape mirrors already_granted).
- Non-decidable request → `conflict.stale_write`; unknown id → `not_found.record`; non-admin →
  `permission.denied`.
- Idempotency-Key replays the stored response, no double write.

- [ ] Implement the service following `request-service.ts` conventions (advisory xact lock, tx-threaded
  `checkService`, `auditService.record(tx, …)`).
- [ ] Commit: `feat(backend): permission decision service (approve/reject/need-info/deny)`.

## Task 3: Routes + admin-list status filter

**Files:** Modify `apps/backend/src/modules/permissions/routes.ts`; the list extension in
`request-service.ts`.

**Deliverable:**
- Four `POST` routes wired to the service, Zod-validated bodies, `Idempotency-Key` header parsed like the
  create route, admin gate enforced (service already gates; route may pre-check).
- `GET /permissions/requests?status=` returns decided rows when asked (default unchanged). Keep
  `workspace.admin` gate.

- [ ] Wire routes + list filter; map service `HttpError`s to status codes via the existing error mapper.
- [ ] Commit: `feat(backend): permission decision routes + decided-request listing`.

## Task 4: Integration test matrix (the VERIFIER gate)

**Files:** Create `apps/backend/src/modules/permissions/__tests__/decision.integration.test.ts`.

**Every assertion below must exist and pass** (non-vacuous — would fail if the corresponding service
branch were removed):

- [ ] approve → a subsequent `checkService.checkCapability(requester, capability, scope)` returns
  `allow: true` (`via: 'direct_grant'` for workspace-wide, `'managed_system_scope'` for MS-scoped).
- [ ] deny → `checkService` returns `allow: false, reason: 'explicit_deny'` even when a grant also exists.
- [ ] reject / need-more-info → request status transitions; NO `permission_grants` row minted.
- [ ] admin-only: a `developer` actor calling each of the 4 routes → 403 `permission.denied`.
- [ ] stale-write: deciding an already-`approved` request → 409 `conflict.stale_write`.
- [ ] duplicate approve (actor already holds active grant) → 409 `conflict.capability_already_granted`.
- [ ] audit: exactly one audit row per decision, correct `event_type` + `subject_id = request id`.
- [ ] idempotency: same `Idempotency-Key` replays the response, exactly one grant/deny row.
- [ ] reason gating: reject/deny/need-info with empty reason → 400; sensitive-capability approve with empty
  reason → 400; non-sensitive approve with no reason → 200.

- [ ] Run VERIFY (whole `permissions` module filter) outside the sandbox on a fresh DB; `fops_app` app
  handle + migrate handle. Also `verify.sh --typecheck`.
- [ ] Commit tests with the service if not already committed.

## Task 5: Doc-sync

**Files:** Modify `docs/implementation/05-permission-policy.md`.

- [ ] Document the decision lifecycle (pending/needs_more_info → approved/rejected via the 4 endpoints),
  the "approval does not auto-run" rule, explicit-deny-overrides-allow, reason gating, and the endpoint
  list. Same commit as Task 3 or a trailing docs commit.

---

## Self-Review (spec coverage)

- Approve/reject/need-info/deny → Tasks 2/3, tested in 4. ✅
- Grant/deny issuance + check-service consequence → Task 2, asserted in Task 4. ✅
- Audit events → Task 1 (types) + Task 2 (emit) + Task 4 (assert). ✅
- Admin gate, stale-write, idempotency, reason gating → Task 2 behavior, Task 4 assertions. ✅
- Decided-request listing (for FE tabs) → Task 3. ✅
- Doc-sync → Task 5. ✅
- Deferred (self-approval Pack 8, revoke, direct-grant, risk) → explicitly OUT per the design; no task. ✅

## Open items confirmed during implementation
- No migration expected (all columns exist; `status` CHECK already admits all six states). If CODEX finds
  a missing column/constraint, it raises a BLOCKER rather than adding a migration silently.
- `conflict.capability_already_denied` code: reuse the existing error-code taxonomy; if no matching code
  exists, mirror `capability_already_granted`'s registration.
