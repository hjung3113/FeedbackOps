# Research 3 — Permission request cancel / edit

Read-only survey of ADR-0044, the permissions module, and the permission-request lifecycle. No code was changed. There is no `service.ts` or `repo.ts` in this module. Requester commands live in `request-service.ts`, admin decisions in `decision-service.ts`, and both talk to Drizzle directly.

## Verdict

This is not one gap.

| Capability | Status | Ship in the first issue? |
|---|---|---|
| Requester **supplements** a `needs_more_info` request and returns the **same row** to `pending` | Already decided. Endpoint is missing. Technical completion. | Yes |
| Requester **rewrites a still-`pending` request** before any admin action | Not decided. ADR-0044's word "edit" does not specify it. | No |
| Requester or admin **cancel** | Not decided. No status, no audit verb, no actor rule. ADR-0044 only names the hole. | No, until the status decision below is locked |

Do not fold cancel, or in-place edit of `pending`, into the supplement endpoint. They are different state transitions, and only one of them is specified.

## 1. What ADR-0044 actually says

Accepted 2026-08-03 for #274 and #278. The decision it locks is frontend composition (confirm capability and scope, require a reason, always send `return_route_intent`, show the created request) and Managed System owner selection. It is not a cancel/edit design.

Two sentences are the entire cancel/edit record:

- Context: "The current permission routes expose create and read operations for requesters and decision operations for administrators. They expose no requester cancel or edit endpoint."
- Decision: "Request cancellation and modification are excluded because implementing them without a corresponding backend endpoint would invent a frontend-only lifecycle."

That is a gap note plus a prohibition on a fake frontend lifecycle. It does not say who may cancel, from which statuses, whether edit mutates the row or creates a new one, what the body is, or what is audited. An ADR supersedes other docs only on the decision it made. Here that decision is "do not invent this on the client." Behavior has to come from the permission contracts below, and those contracts only cover one of the two verbs.

## 2. Module conventions the new endpoint must copy

### Surfaces that exist today

`apps/backend/src/modules/permissions/routes.ts`:

| Method and path | Who | Rate-limit tier | Idempotency |
|---|---|---|---|
| `POST /permission-requests` | Any session in the workspace | `mutation` | Optional `Idempotency-Key`, UUIDv4. Manual lookup + `pg_advisory_xact_lock` + `record` inside the create transaction. |
| `GET /permission-requests/mine` | Session. Own open rows only. | (none; GET) | n/a |
| `GET /permission-requests` and `GET /permissions/requests` | `workspace.admin` via `checkCapability` | (none; GET) | n/a |
| `POST /permissions/requests/:id/approve` | `workspace.admin` | `sensitive` | Optional key, delegated to `idempotencyService.runIdempotent` |
| `POST /permissions/requests/:id/reject` | same | `sensitive` | same |
| `POST /permissions/requests/:id/need-more-info` | same | `sensitive` | same |
| `POST /permissions/requests/:id/deny` | same | `sensitive` | same |

Requester commands stay on the hyphenated collection `/permission-requests`. Admin item commands stay on `/permissions/requests/:id/<verb>`. A requester mutation must not be mounted on the admin path. That path's handlers assume `workspace.admin` and run it **before** idempotent replay (`decision-service.ts` `decide`).

Every route uses `requireSession` + `requireWorkspace`. The handler bails with `internal.unexpected` if `req.session` is missing after that middleware. Unknown `Idempotency-Key` shape is `validation.malformed_idempotency_key` (422) before the service runs. Body schema failure is `validation.failed` (422) with `fields` from Zod. Domain rules (empty trimmed reason, self-approval envelope) are **not** Zod: the service throws `validation.*` after trim. Decision body schemas are `.strict()` in `packages/shared/src/permissions/decisions.ts`. The create body schema is local to `routes.ts` and is not strict.

There is no `expected_version` / `last_seen_at` on any permission mutation. `03-api-contracts.md` says permission approval and rejection must carry an optimistic-concurrency token. The shipped sibling does not. It locks the row and treats a non-decidable status as a conflict:

```text
SELECT ... FROM permission_requests WHERE id = $id AND workspace_id = $workspace FOR UPDATE
missing row                         → not_found.record (404)
status not in (pending, needs_more_info) → conflict.stale_write (409)
```

(`decision-service.ts`, the `run` closure inside `decide`.) Copy the lock and the `conflict.stale_write` status check, and copy where they sit: inside the handler `runIdempotent` calls only on a miss. `decide` runs `workspace.admin` before `runIdempotent` because that capability can be revoked between a success and a same-key retry. The requester relationship cannot change, so supplement has no equivalent gate to hoist. A trivial ownership read in front of the handler would not break replay, and nothing else may stand there — not the row lock, not the status check. Do not add a version column for this endpoint. The request table has `updated_at` and no version (`apps/backend/src/db/schema/permission.ts`).

Idempotency for a command on an existing id copies `decide`, not `createRequest`. `createRequest` hand-rolls the ADR-0015 sequence because it predates the helper. `decide` calls `idempotencyService.runIdempotent` (`apps/backend/src/modules/core/idempotency/idempotency-service.ts`): advisory lock on `(actor_id, key)`, replay on hash match, `conflict.idempotency_key_reuse` on hash mismatch, otherwise run the handler and `record` the status+body in the same transaction. The request hash for decisions is `hashRequestBody({ request_id, action, ...body })`.

Audit write is `auditService.record` in the same transaction as the row change (ADR-0008). Subject is `subject_type: 'permission_request'`, `subject_id` = request id. Event names come from `docs/implementation/05-permission-policy.md` and are registered in `packages/shared/src/audit/permission.ts`. The four decision detail schemas are `.strict()`. `permissionRequestedDetailSchema` is not — it is a plain `z.object`. The supplement detail schema must be `.strict()`, like the decision schemas, not like `permission_requested`. A new string is not added directly in `packages/shared/src/enums/audit-events.ts`.

Postgres `23505` on the active-request unique index becomes `conflict.permission_request_duplicate`. On grant/deny insert it becomes `conflict.capability_already_granted` or `conflict.capability_already_denied`. No other SQLSTATE is mapped. On create, an unknown managed-system id fails the FK from `0006_permission_managed_system_fks.sql` as an unmapped error. That FK is not workspace-scoped, so another workspace's id passes it. Supplement must not copy either failure: pre-validate the id against this workspace's `managed_systems` rows and return the existing `validation.failed` on the field. Do not add a new error code, and do not leave that 500 in place.

### Lifecycle that is actually enforced

CHECK constraint `permission_requests_status_check` (`apps/backend/migrations/0000_familiar_centennial.sql`):

```text
pending | needs_more_info | approved | rejected | expired | revoked
```

There is no `cancelled` / `withdrawn`. Partial unique index `permission_requests_active_uq` covers only `status in ('pending','needs_more_info')`, on workspace + requester + capability + coalesced managed system, object type/id, and source object/action. Leaving that set frees the slot so `POST /permission-requests` can insert again.

`05-permission-policy.md` "Permission Request Lifecycle":

```text
pending
-> needs_more_info -> pending
-> approved | rejected | expired | revoked
```

"`needs_more_info` keeps the same Permission Request identity. Requester supplementation moves the same request back to `pending`; it must not create a new request for the same source object, source action, and requested scope."

Admin decisions (`05`, "Admin decision lifecycle"): only `pending` and `needs_more_info` are decidable. Approve copies capability, managed-system scope, and expiration verbatim into `permission_grants` and sets `approved`. Reject sets `rejected` and mints nothing. Need-more-info sets `needs_more_info`; the note is audit detail only — there is no `more_info_request` column. Deny mints `permission_denies` and sets `rejected`. Reviewers cannot change requested scope or expiry. Approve does not run the blocked action.

`needs_more_info` therefore **is** the partial-review state. The admin has written a question (`permission_needs_more_info` detail `note`). The grant has not been minted. The row is still inside the active unique index.

Open-queue reads treat both active statuses as open: `GET /permission-requests/mine`, the default admin list, `findOpenRequestSummary`, and the dashboard queue `permission-requests-pending` (it calls `listAllActive` with no status, so `pending | needs_more_info`). `toFrontendState` maps both to the UI state `pending_request`. A return to `pending` does not change that UI state and does not change the dashboard count. A leave from the active set drops the row out of mine, the default admin queue, and the dashboard count on the next summary read. Nothing writes the dashboard directly.

### What the create audit does and does not remember

`permission_requested` detail (`packages/shared/src/audit/permission.ts`) stores capability, managed_system_id, reason, sensitive, and source object/action. It does **not** store `requested_expiration`, `requested_object_type`, or `requested_object_id`. Those live only on the row. An in-place update that does not snapshot them deletes the pre-edit values from history. The supplement audit below exists to prevent that. The original `permission_requested` row and the admin's `permission_needs_more_info` row stay append-only either way.

Planned event names in `05`, not in the registry and not emitted:

```text
permission_more_info_submitted
permission_revoked
permission_expired
```

`permission_more_info_submitted` is the reserved name for supplementation. Promoting it into `PERMISSION_AUDIT_EVENT_TYPES` plus a detail schema is part of the technical completion, not a new product noun. `permission_revoked` is the grant-revoke verb, not a requester cancel.

## 3. What "cancel" should mean

No contract answers this. Searched: ADR-0044, `05-permission-policy.md`, `CONTEXT.md` (Permission Request invariants), `docs/design/09-permission-access.md` FR-PERM-001/002, `docs/frontend/interaction-patterns.md` "Permission Request State Machine", `docs/design/15-data-contracts.md` Permission Request, `docs/design-prototype/screen-permissions.jsx`. None define a cancel transition. The prototype state strip is the same six statuses as the CHECK constraint. Admin "revoke" in FR-PERM-002 is revoke of an existing grant, which is the unimplemented `permission_revoked` path, not withdrawal of an open ask.

Do not overload an existing status:

- `rejected` is an admin decision. `05` says a rejected request must not be immediately resubmitted for the same source object, source action, and scope unless the rejection allows appeal, asks for more information, or sets `retry_after`. The code does not enforce that ban today (the unique index ignores `rejected`), but writing cancel as `permission_rejected` with the requester as `actor_id` would still lie in the audit log and in the admin console.
- `revoked` is grant revocation. The check service maps `grant_revoked` to the frontend state `revoked`. The request status `revoked` is legal in the CHECK and is not an open status.
- `expired` is time, not intent.

Admin already closes an open request with `reject` (no grant) or `deny` (explicit deny, both require a non-empty reason). A second admin "cancel" would duplicate reject without the reason rule. Recommendation if cancel is ever built: **requester only**, no admin bypass. A non-owner, an unknown id, and another workspace's id all return `not_found.record` (404). Collapse them to one lookup predicate: `id` + `workspace_id` + `requester_actor_id`. Do not return `403 permission.denied` for "not yours". `listAllActive` returns 403, but that is a collection capability gate with no id, and it sets no precedent for an item lookup. A 403 here would tell any workspace member that the request id exists.

Source statuses, if cancel is built: `pending` and `needs_more_info` only. Not `approved` (a grant already exists; closing that is revoke). Not `rejected`, `expired`, or `revoked` (`conflict.stale_write`, same as a second decision).

Effect, if built: set a **new** status, bump `updated_at`, mint nothing, write a new audit verb, free `permission_requests_active_uq`. The requester can then `POST /permission-requests` again for the same tuple. `GET /me/permissions/check` goes back to `request_access` when the capability is still denied and still requestable, because `findOpenRequestSummary` only sees the two active statuses.

That new status is a vocabulary change. `CONTEXT.md` owns the Permission Request invariant ("a decision may be `approved`, `rejected`, or `needs_more_info`"). The CHECK constraint, `05`, `09`, and the prototype would all have to grow the same word in one chunk. That is the product decision. It is not implied by ADR-0044.

Recommended lock, if the user wants cancel at all:

- Status word: `cancelled` (one L, not `canceled`, not `withdrawn`).
- Actor: `requester_actor_id` only.
- From: `pending` | `needs_more_info`.
- Body: `{ "reason"?: string }` max 2000, optional, trimmed; omit rather than require. Withdrawing your own ask is not an admin decision. Store the trimmed reason on the audit detail, null when omitted.
- Audit verb: `permission_request_cancelled`. Not in the planned list. It would be added to `05`'s canonical list in the same chunk. Do not reuse `permission_rejected` or `permission_revoked`.
- Path, if built: `POST /permission-requests/:id/cancel`, mutation tier, `runIdempotent`, `SELECT … FOR UPDATE`. Response `200 { "id", "status": "cancelled" }`.

Until that lock exists, do not implement the route, the CHECK change, or the verb.

Skipping cancel is a product choice with a concrete consequence, not an empty gap. Without it, a requester who no longer needs access has no way to clear an open request themselves. The row keeps occupying `permission_requests_active_uq` and the admin queue until an admin rejects or denies it. That is acceptable for the first issue. It is not "nothing is blocked."

## 4. What "edit" should mean

The decided edit is not a general PATCH and it is not cancel-plus-create.

`docs/design/09-permission-access.md` FR-PERM-002:

> Requester can update reason, requested scope, or requested expiration and resubmit to pending.

`docs/frontend/interaction-patterns.md`:

> Needs More Info requests show the Admin question and let the requester update reason, scope, or duration before resubmitting.

`05` and `CONTEXT.md`: same request id, back to `pending`, do not insert a second row for the same source object, source action, and requested scope.

So:

- **Same row.** Inserting a new request while the old one is still `needs_more_info` either hits `permission_requests_active_uq` (409 `conflict.permission_request_duplicate`) or, if the scope tuple changed, leaves the admin staring at an abandoned open request. Both are the outcome the policy forbids.
- **Only from `needs_more_info`.** That is the state in which an admin has asked for a revision and has not minted a grant. A still-`pending` request has not been partially reviewed. Rewriting it under an admin who has the queue open is a different product. The create audit would also stop matching the row, and no contract authorizes the rewrite. `POST` below must `409 conflict.stale_write` when status is `pending` (or any terminal status).
- **After this partial review, edit is safe only because the trail is append-only and the row is locked.** `permission_requested` keeps the original submission. `permission_needs_more_info` keeps the admin note. The new event keeps the pre-image of the fields the older events do not store (expiration and object scope) plus the post-image. `SELECT … FOR UPDATE` serializes with `decide`: the loser sees a status that is no longer `needs_more_info` and gets `conflict.stale_write`. No merge.
- **Capability and source identity stay put.** The unique index and the "same source object, source action" sentence treat those as the request's identity. Changing `requested_capability`, `source_object_*`, `source_action_id`, `return_route_intent`, or the requester is a different request. They are not fields of this command. `.strict()` rejects a body that tries to send them.
- **Scope and expiration may change.** FR-PERM-002 says so. "Requested scope" in this schema is `requested_managed_system_id` + `requested_object_type` + `requested_object_id` (see the active unique index and the create body). Changing them moves the index entry. A collision with another open row is `conflict.permission_request_duplicate`, and the transaction rolls back. That is the same mapping `createRequest` uses for `23505`. When that scope tuple differs from the locked row, re-run create's in-transaction `checkCapability` against the resolved managed-system id and return `409 conflict.capability_already_granted` if the actor already holds the capability. A non-null `requested_managed_system_id` must be a `managed_systems` row in this workspace before the UPDATE; an unknown or cross-workspace id is `validation.failed` on that field, not an unmapped FK 500. `05` (the paragraph after the lifecycle field list) and ADR-0044 say the client may submit only server-provided scope candidates. Create does not enforce that server-side. This endpoint does not add that check either — same gap, restated so a scope rewrite is not a silent second door. A past `requested_expiration` is also not rejected, same as create. `decide` copies it verbatim onto the grant, so approve can mint an already-expired grant. Note it; do not add a new check in this issue.
- **Resubmit without a field change is valid.** `{}` moves `needs_more_info` → `pending` and still audits. The admin asked a question; confirming the existing reason is an answer. Do not require a diff.
- **Do not mint a grant, a deny, or an entity link.** Create does not, and approve is a separate command. Dashboard queues are not written; the row stays inside the open set, so `permission-requests-pending` count is unchanged. A `?status=needs_more_info` admin query loses the row; `?status=pending` gains it.

Editing `pending` in place, or cancelling and creating a new id, both fail the audit requirement this question is about. The first destroys expiration and object scope without a pre-image and changes the body under an undecided review. The second breaks the same-identity rule and, while the first row is still active, usually 409s.

### Read gap (do not block the mutation on it)

The admin question is only in the `permission_needs_more_info` audit detail. `GET /permission-requests/mine` (`listMine`) already returns `requested_managed_system_id`, `requested_object_type`, `requested_object_id`, and all three `source_*` fields. It does not return `requested_expiration`, `updated_at`, or the admin `note`. The read gap is the note and the expiration, not object scope. Interaction-patterns says the requester UI shows that question. No module reads audit rows back today (`auditService.record` only). Showing the question is a separate read-model change (either denormalize `more_info_request` onto the row, which `09` lists and the table does not have, or teach the mine query to surface the latest note). Adding `requested_expiration` belongs on that read issue, not on this mutation's response. `updated_at` is absent from `listMine` too, but the mutation response below returns it. The mutation contract does not depend on the read gap. Call it out in the issue; do not silently widen this endpoint into a read API.

## 5. Draft endpoint contract — submit more info

Normative home, when implemented: `docs/implementation/api/permissions.md`. This draft follows the template in `docs/implementation/03-api-contracts.md` ("Endpoint Contract Template"). Sibling for the command shape: `POST /permissions/requests/:id/need-more-info` (`routes.ts` decision route table + `decision-service.ts` `decide`). Sibling for who is allowed to call: `POST /permission-requests` (session, not `workspace.admin`, mutation tier).

```text
- requirement_id
    FR-PERM-002 resubmit clause
    05-permission-policy.md "Permission Request Lifecycle" (same id, needs_more_info → pending)
    CONTEXT.md: needs_more_info preserves identity for resubmission
    Reserved audit verb: permission_more_info_submitted (05, planned list — promote it)

- method and path
    POST /permission-requests/:id/submit-more-info
    Not PATCH. This module has no PATCH. Item commands are POST + verb.
    Not under /permissions/requests/:id/. That tree is the admin decision surface.

- request body
    Strict object. All fields optional. Unknown keys → 422 validation.failed.
    Omitted field = keep the stored value.
    JSON null clears a field ONLY when that column is nullable.
    permission_requests.reason is NOT NULL (schema + 0000 migration).
    ADR-0044 requires a non-empty reason before submission. reason is
    never null. Null clears only:
      requested_managed_system_id
      requested_object_type
      requested_object_id
      requested_expiration
    No existing permission body schema uses .nullable(). Null-vs-omit on
    those four columns is a new convention the frontend must follow.
    canonicalize.ts hashes undefined and null differently
    (UNDEFINED_SENTINEL), so a replay of null is not a replay of omit.
    {
      reason?: string                 // z.string().min(1).max(2000).optional()
                                      // no null. "" fails Zod. " " passes Zod
                                      // and fails the service trim check below.
      requested_managed_system_id?: uuid | null
      requested_object_type?: string | null     // string branch min(1), as create
      requested_object_id?: uuid | null
      requested_expiration?: iso-8601 datetime | null
    }
    Not accepted (rejected by .strict(), not silently ignored):
      requested_capability, source_object_type, source_object_id,
      source_action_id, return_route_intent, status, requester_actor_id
    Schema lives in packages/shared next to the decision schemas
    (packages/shared/src/permissions/decisions.ts), .strict().
    reason max length matches create (2000) and the decision reason schemas.
    Transport schema does not enforce "non-empty after trim". The service does.
    That split is the approve/reject comment in decisions.ts.
    Trimming a submitted reason is new for requester writes. create stores
    body.reason untrimmed (request-service.ts). Only decide trims today.
    When reason is present, save the trimmed string. When omitted, keep the
    stored string as-is. The emptiness check uses whichever value would be
    saved: reject when that value trims to empty.
    A past requested_expiration is not rejected. create does not reject it
    either, and decide copies requestedExpiration verbatim onto the grant,
    so approve can mint an already-expired grant. Pre-existing. Note it in
    the issue. Do not add a new validation here.

- response body
    200
    {
      id: uuid
      status: "pending"
      updated_at: iso-8601
    }
    New strict schema in packages/shared/src/permissions/. Do not reuse
    permissionDecisionResultSchema. That result is
    { id, status, grant_id?, deny_id? } and its status enum is
    approved | rejected | needs_more_info — it cannot hold "pending".
    Do not claim this matches decide's envelope. The sibling shape is
    create's acknowledgement { id, status, created_at }: a small result,
    not an echo of the row. The route still does
    reply.code(result.status).send(result.body).
    status is the literal "pending". Do not echo capability, reason, or
    scope. listMine already returns object scope (requested_managed_system_id,
    requested_object_type, requested_object_id) and the three source_* fields.
    The real read gap on mine is requested_expiration and the admin note,
    not object scope. updated_at is also absent from listMine; this body
    returns it. If the screen needs the expiration, add it to listMine in
    the separate read issue.

- auth and permission
    requireSession + requireWorkspace, same as every permissions route.
    No capability check. Any authenticated member may call it on a request
    whose requester_actor_id equals the session actor, in the session workspace.
    An Admin who is the requester uses this same rule. An Admin who is not
    the requester does not get a bypass; they already have reject / deny /
    need-more-info.
    One lookup predicate, inside run (below), after FOR UPDATE:
      id + workspace_id + requester_actor_id
      no row → 404 not_found.record
    That single 404 covers an unknown id, another workspace, and a row in
    this workspace whose requester is someone else. Do not return 403.
    listAllActive's 403 is a collection capability gate with no id. It is
    not a precedent for this lookup. A 403 would disclose that the id exists.
    The requester relationship cannot change between calls the way
    workspace.admin can, so it does not need decide's pre-replay gate.
    A trivial relationship read in front of runIdempotent is safe and is
    not required. Do not put the row lock or the status check there.
    On idempotent replay, runIdempotent returns the stored body without
    calling run, so it never locks the row and never sees status = pending.
    The key is bound to actor_id, so another actor cannot replay it.

- validation errors
    422 validation.malformed_idempotency_key
        Idempotency-Key present and not a UUIDv4.
        Route check, copied from the decision route loop.
    422 validation.failed
        Zod failure, including extra keys, reason: null, a reason over
        2000, and a non-UUID :id.
        detail.fields from fieldsFromZodIssues, as the decision route does.
        Also the service throws, same envelope decide uses for an empty
        reject/deny reason:
          fields: [{ path: ['reason'], code: 'too_small' }]
        when the resolved reason trims to empty and the stored capability
        is not sensitive. Whitespace (" ") is min(1) at Zod and fails here.
        This applies to every capability, not only sensitive ones. An
        omitted reason whose stored value is only whitespace fails the
        same way: the client must send a non-empty reason.
        Also when resolved requested_managed_system_id is non-null and is
        not a managed_systems row in this workspace (unknown id, or an id
        from another workspace):
          fields: [{ path: ['requested_managed_system_id'], code: 'custom' }]
        The 0006 FK is not workspace-scoped and 23503 is unmapped. Do not
        wait for the FK and do not surface a 500. Null needs no lookup.
    422 validation.sensitive_reason_required
        ONLY when the stored capability is sensitive (isSensitiveCapability)
        AND the reason that would be saved trims to empty. Same code create
        and sensitive approve already throw. Do not use this code for a
        non-sensitive capability.
    422 validation.unknown_capability
        Stored requested_capability is no longer in the capability vocab.
        decide throws this on the same condition. Do not write.
    404 not_found.record
        The combined predicate missed: unknown id, id in another workspace,
        or caller is not requester_actor_id. One code. No 403 branch.
    409 conflict.stale_write
        Status is anything other than needs_more_info, including pending,
        approved, rejected, expired, revoked. Message should say the
        request is not awaiting requester supplementation. Same code
        decide uses for a non-decidable row. Concurrent approve/reject/
        deny/need-more-info wins or loses the row lock; the loser 409s.
        No auto-merge. This check runs inside run, so a same-key replay
        never reaches it.
    409 conflict.capability_already_granted
        Resolved scope tuple differs from the locked row, and
        checkCapability in this transaction returns allow === true.
        Same code and same call shape createRequest uses
        (workspace_id, plus managed_system_id only when the resolved id
        is non-null). Do not insert a redundant open request for a scope
        the actor already holds. Unchanged scope does not re-run the check.
    409 conflict.permission_request_duplicate
        The updated scope tuple collides with another active
        (pending | needs_more_info) request for this requester. Map
        SQLSTATE 23505 the way createRequest maps the same index.
        Transaction rolls back; the needs_more_info row is unchanged.
    409 conflict.idempotency_key_reuse
        Same actor, same Idempotency-Key, different body hash.
    Params: validate :id with z.string().uuid() before the service.
        Decision routes do not. A non-UUID reaches Postgres as a uuid
        comparison, and nothing in apps/backend/src maps SQLSTATE 22P02,
        so it most likely surfaces as 500. Do not copy that gap.
        Failure is validation.failed, not a new code.
    Do not add a new error code.
    Server-provided scope candidates (05, the paragraph after the lifecycle
    field list; ADR-0044): the client may submit only those candidates.
    Create does not enforce this server-side. This command does not add a
    requestable check either. Same gap. Restate it on the issue so a scope
    rewrite is not treated as permission to invent a broader scope.

- side effects
    One transaction, matching decide's shape. The row lock, the status
    check, resolution, the UPDATE, and the audit write all live in run,
    the closure runIdempotent calls only on a miss. Do not run them first.
      Open the transaction.
      Nothing capability-shaped runs before the handler. The requester
      relationship is unchanging, unlike workspace.admin, so there is no
      decide-style gate to hoist. Fold ownership into the predicate below.
      Hash, when a key was sent:
        hashRequestBody({ request_id, action: "submit_more_info", ...body })
      No key → call run() directly, still inside the transaction
        (decide: if (!options.idempotencyKey) return run()).
      Key present → idempotencyService.runIdempotent(tx, actor_id, key,
        hash, run). On a hash match it returns the stored 200 and does
        not call run. On a miss it calls run, then records the 200 in
        the same transaction. The advisory lock stays inside runIdempotent,
        before lookup, as the helper already does.
      run():
        1. SELECT ... FOR UPDATE
             WHERE id = $id
               AND workspace_id = $workspace
               AND requester_actor_id = $actor
           no row → 404 not_found.record
        2. status !== needs_more_info → 409 conflict.stale_write
        3. stored capability not in the vocab → 422 validation.unknown_capability
        4. Resolve fields. Omit keeps the stored value. Null clears only
           the four nullable columns above. Trim reason only when the
           body sent it. Reject an empty resolved reason (validation
           errors above) for every capability.
        5. If resolved requested_managed_system_id is non-null and is not
           a managed_systems row in this workspace → 422 validation.failed
           on that field. Do this before the UPDATE.
        6. If resolved (requested_managed_system_id, requested_object_type,
           requested_object_id) differs from the locked row, call
           checkCapability in this transaction the way createRequest does.
           allow === true → 409 conflict.capability_already_granted.
        7. UPDATE permission_requests SET
             reason, requested_managed_system_id, requested_object_type,
             requested_object_id, requested_expiration (resolved values),
             status = 'pending',
             updated_at = now()
           WHERE id = the locked id.
           23505 → 409 conflict.permission_request_duplicate; the
           transaction rolls back and the row is unchanged.
        8. auditService.record permission_more_info_submitted (below).
        9. return { status: 200, body: { id, status: 'pending', updated_at } }
    No insert into permission_grants or permission_denies.
    No change to source_* , return_route_intent, requested_capability,
    requester_actor_id, workspace_id, created_at.
    Service function belongs on request-service.ts (requester command,
    no grant minting), not decision-service.ts.
    Rate limit: mutation tier, the tier on POST /permission-requests.
    Not the sensitive tier. Sensitive is the admin decision quartet.

- audit events
    permission_more_info_submitted
    actor_id = the requester (the session actor)
    subject_type = permission_request
    subject_id = request id
    summary = "Permission request more info submitted"
    Pin that literal. It follows decide's
    `Permission request ${action}` form
    (decision-service.ts writes `Permission request ${action.replaceAll('_', ' ')}`),
    not create's `Permission requested: ${capability}`. A test should
    assert this string.
    detail schema is .strict() — like the four decision detail schemas,
    not like permissionRequestedDetailSchema, which is not strict.
    Post-image in the same flat shape as the other permission details,
    plus a previous object because expiration and object scope are not
    on permission_requested:
      {
        capability: string                 // min(1)
        managed_system_id: uuid | null     // post
        requester_actor_id: uuid
        reason: string                     // min(1). The saved value.
                                           // Not nullable. Empty is rejected
                                           // before the audit write.
        sensitive: boolean
        requested_object_type: string | null    // post
        requested_object_id: uuid | null        // post
        requested_expiration: iso-8601 | null   // post
        previous: {
          reason: string                   // min(1). Stored pre-image,
                                           // including a create-time value
                                           // that was never trimmed.
          managed_system_id: uuid | null
          requested_object_type: string | null
          requested_object_id: uuid | null
          requested_expiration: iso-8601 | null
        }
      }
    previous is .strict() as well. Register the verb and this schema in
    packages/shared/src/audit/permission.ts and move the name from 05's
    "planned" list into the canonical audit-event list in the same chunk.
    Do not put the admin's note on this event. It already sits on
    permission_needs_more_info.

- entity_links created, updated, detached, or revoked
    None. Create and decide do not write entity_links for a permission request.

- dashboard queues affected
    None directly. The row stays in (pending | needs_more_info), so
    permission-requests-pending count does not change. It moves from the
    needs_more_info filter to the pending filter on
    GET /permissions/requests.

- managed_system scope and default owner/reviewer resolution
    Not applicable as an owner or reviewer assignment.
    requested_managed_system_id is the scope being asked for, not a
    default-owner lookup. When the resolved id is non-null, pre-validate
    it against this workspace's managed_systems and return
    validation.failed on the field (see validation errors). Do not rely
    on the 0006 FK. That FK is not workspace-scoped, and 23503 is unmapped,
    so an unknown id on create is a 500 today. Supplement must not copy that.

- idempotency behavior
    Optional Idempotency-Key, UUIDv4, ADR-0015 via runIdempotent.
    Replay of the same actor + key + body returns the stored 200 and
    does not write a second audit row. Replay does not lock the row.
    A committed supplement leaves status = pending; seeing that status
    and returning conflict.stale_write is the bug this order avoids.
    Same key, different body → 409 conflict.idempotency_key_reuse.
    No key → every call attempts the transition. A second call after
    success finds status pending inside run and returns
    409 conflict.stale_write. That is what a second reject does today.
```

### Route test matrix

The issue's route tests must cover at least:

- Replay after success. Same actor, same `Idempotency-Key`, same body, after the first call committed. The second call returns the stored 200 and does not write a second audit row. It must not return `409 conflict.stale_write`. This is the test that catches the lock-before-`runIdempotent` bug.
- Non-owner. The row is in the caller's workspace and `requester_actor_id` is someone else. Response is `404 not_found.record`, not `403 permission.denied`.
- Whitespace reason on a non-sensitive capability. Body `reason` is `" "` (or the stored reason is only whitespace and the field is omitted). Response is `422 validation.failed` with `fields: [{ path: ['reason'], code: 'too_small' }]`. Not `validation.sensitive_reason_required`. Nothing is written.
- Scope collision. The resolved scope tuple matches another active request for this requester. Response is `409 conflict.permission_request_duplicate`. The `needs_more_info` row is unchanged.
- Concurrent approve vs submit-more-info on the same id. Both take `FOR UPDATE` inside their own handlers. The loser gets `409 conflict.stale_write`. No merge, and the loser does not mint a grant from a body it did not read.

### Concurrency note (why this is enough after partial review)

`need-more-info` has already committed. The requester's command and a later `approve` / `reject` / `deny` / second `need-more-info` both take `FOR UPDATE` on the same row. Exactly one sees `needs_more_info`. The other gets `conflict.stale_write` and does not mint a grant from a body it did not read. The audit log then contains, in order, `permission_requested`, `permission_needs_more_info`, `permission_more_info_submitted`, and only then a decision event whose detail was copied from the row **after** the supplement. `decide` reads the locked row and copies capability, managed system, and `requestedExpiration` into the grant. It does not trust the client's original create body.

## 6. Draft endpoint contract — cancel (do not implement yet)

Included so the issue can paste it after the status lock. It is not authorized by a current contract. The template fields that differ from supplement:

```text
- requirement_id
    NONE. ADR-0044 names the missing endpoint and specifies no behavior.
    Blocked on a user decision to add status `cancelled` (see §3).

- method and path
    POST /permission-requests/:id/cancel

- request body
    { reason?: string }  max 2000, strict. Optional. Service trims;
    empty after trim is treated as omitted.

- response body
    200 { id: uuid, status: "cancelled", updated_at: iso-8601 }

- auth and permission
    Same session rule as submit-more-info. No admin bypass.
    Same one-predicate 404: id + workspace_id + requester_actor_id.
    Not 403. Do not inherit listAllActive's collection gate.

- validation errors
    Same header/body/404/idempotency codes as submit-more-info.
    Non-owner is 404 not_found.record, not 403.
    409 conflict.stale_write unless status is pending or needs_more_info.
    That status check sits inside run, not before runIdempotent.
    No duplicate-index error: the row is leaving the partial index, not
    moving inside it.
    No sensitive-reason check: cancel does not grant anything.

- side effects
    Same transaction shape as submit-more-info. Do not lock the row or
    read its status before runIdempotent. A same-key retry after success
    must replay the stored 200. It must not lock the row, see status
    cancelled, and return conflict.stale_write.
    No key → run() directly inside the transaction.
    Key present → runIdempotent calls run only on a miss, then records
    the 200 in the same transaction. Hash action: "cancel".
    run():
      1. SELECT ... FOR UPDATE
           WHERE id AND workspace_id AND requester_actor_id
         no row → 404 not_found.record
      2. status not in (pending, needs_more_info) → 409 conflict.stale_write
      3. UPDATE status = 'cancelled', updated_at = now().
         No grant, no deny.
      4. auditService.record permission_request_cancelled
      5. return 200 { id, status: 'cancelled', updated_at }
    Frees permission_requests_active_uq for this tuple.
    Drops the row out of mine, the default admin open list, and the
    derived permission-requests-pending dashboard count.
    CHECK constraint migration is required in the same chunk
    (permission_requests_status_check). Drizzle comment on status in
    apps/backend/src/db/schema/permission.ts must list the new value;
    the CHECK itself stays in SQL, which is how this table already
    works.

- audit events
    permission_request_cancelled
    detail (strict):
      {
        capability: string
        managed_system_id: uuid | null
        requester_actor_id: uuid
        reason: string | null
      }
    New canonical verb in 05. Not permission_rejected, not permission_revoked.

- entity_links
    None.

- dashboard queues affected
    Derived only. permission-requests-pending loses one open row.
    No queue write.

- managed_system scope and default owner/reviewer resolution
    Not applicable.

- idempotency behavior
    Same runIdempotent pattern as submit-more-info, including the
    run-closure order above. action in the hash: "cancel".
    Replay after success returns the stored 200 and does not re-enter run.
```

Also required in that same chunk, and nowhere sooner: `CONTEXT.md` Permission Request invariant, `05` lifecycle diagram, `09` status list, interaction-patterns state machine, prototype status meta if the UI starts rendering it, and `docs/design/15-data-contracts.md` (see drift below). Frontend state mapper does not need a new state: a non-open request is "no open request", so a still-denied requestable capability returns `request_access`.

## 7. Product decisions to ask

Ask these. Do not guess them in implementation.

1. **Cancel status.** Add requester-only `cancelled` from `pending | needs_more_info`, with the contract in §6? Or leave cancel unimplemented and ship only supplement? Recommendation: ship only supplement. Cancel is a new lifecycle word. No product doc names a cancel transition, and ADR-0044 forbade a frontend button, which is satisfied by not having the button. Skipping it has a concrete consequence: a requester has no way to clear an open request themselves. The row stays on `permission_requests_active_uq` and in the admin queue until an admin rejects or denies it. That is acceptable for the first issue. It is not "nothing is blocked."
2. **Edit while `pending`.** Allow the same body to rewrite a request that no admin has touched yet? Recommendation: no. `409` unless status is `needs_more_info`. A pending rewrite is a new decision (audit pre-image, race with a reviewer who has not even asked a question, and no FR sentence covers it).
3. **Only if (1) is yes:** is cancel `reason` optional? Recommendation: optional.

No other product fork is required for `POST /permission-requests/:id/submit-more-info`. Path, null-vs-omit on the four nullable columns only, and the `previous` audit block are technical completions of FR-PERM-002 plus the shape of the existing audit schemas. `reason` is not nullable. They are called out above so the issue does not relitigate them.

## 8. Doc drift the implementation chunk will meet

These are pre-existing. Do not "resolve" them by picking a winner inside the supplement PR beyond the files that chunk already has to touch.

- `docs/implementation/api/permissions.md` still says `POST /permission-requests/:id/approve|reject|revoke` are unimplemented as of Slice 6, and it does not mention `/permissions/requests/:id/approve|reject|need-more-info|deny`. The normative catalog is stale relative to `routes.ts`. The supplement issue should add its own route here. The file is partly Korean (`미구현`); keep that language when adding the line rather than mixing English into the existing list. Fixing the stale decision lines is in-scope only because this file is the route's normative home and is already wrong; do not expand into a general docs sweep.
- `docs/design/15-data-contracts.md` Permission Request status enum is `pending, approved, rejected, expired, revoked`. It omits `needs_more_info`. `05`, the CHECK constraint, `09`, interaction-patterns, `CONTEXT.md`, and the services include it. That is a design-vs-implementation disagreement on the enum. Shipped behavior and `05` are what this endpoint follows. The document that must be reopened is `15-data-contracts.md`, to add `needs_more_info`. Do not implement against 15's shorter list. Adding `cancelled` later reopens `15` again; that is part of decision (1), not part of supplement.
- `09` lists `more_info_request`, `approver_id`, and `decided_at` on the request. The table has none of them. The note is audit-only. Supplement must not add those columns just to match `09`. The read gap in §4 is the honest statement of that drift.

## 9. Out of scope for the supplement issue

- Cancel, `cancelled`, `permission_request_cancelled`.
- PATCH of a `pending` request, and any "edit by cancel + create".
- Changing capability, source identity, or `return_route_intent`.
- Grant revoke and request expiry (`permission_revoked`, `permission_expired`). Still unimplemented, still a different issue.
- Admin editing scope or expiration on approve. `05` already forbids it.
- Returning the admin question on `GET /permission-requests/mine`. Separate read issue unless the user pulls it in.
- `expected_version`. Siblings do not have it; this command should not be the one that introduces it.
- Frontend button. ADR-0044 says not to build the control until the endpoint exists. The endpoint issue can land without a screen. The screen copies interaction-patterns once the route is real.
- New error codes.
- Server-side enforcement that the client submitted only an API-provided scope candidate. Same gap as create. The `05` frontend constraint still applies; this issue does not add a `requestable` check.
- Rejecting a past `requested_expiration`. Same gap as create. Noted in §4 and §5. Not a new validation here.

<!-- RESEARCH-3-DONE -->

## Revision (opus review addressed)

Independent review: `.review/RESEARCH-3-permission-cancel-edit-OPUS-REVIEW.md`. The recommendation is unchanged: ship `submit-more-info` only, and do not implement cancel. The corrections below are already applied in the sections above.

1. **Idempotency order.** The row lock, the combined ownership lookup, the status check, field resolution, the UPDATE, and the audit write sit inside `run`, the closure `runIdempotent` calls only on a miss. That is `decide`'s pattern (`decision-service.ts`). A same-key retry after commit replays the stored 200. It does not lock the row, see `status = pending`, and return `conflict.stale_write`. The requester relationship cannot change the way `workspace.admin` can, so it is not hoisted in front of the handler. A trivial relationship read there would be safe; the draft does not require one. Nothing else may stand there. §6 cancel uses the same order.
2. **`reason` is not nullable.** `permission_requests.reason` is `NOT NULL`. The body field is `z.string().min(1).max(2000).optional()`. An empty resolved reason is `validation.failed` with `fields: [{ path: ['reason'], code: 'too_small' }]` for every capability — the shape `decide` uses for an empty reject or deny reason. `validation.sensitive_reason_required` is only for a sensitive capability. JSON null clears only `requested_managed_system_id`, `requested_object_type`, `requested_object_id`, and `requested_expiration`. Trimming a submitted reason is new for requester writes. Create stores `body.reason` untrimmed.
3. **Scope change re-checks the grant.** When the resolved scope tuple differs from the locked row, `run` calls `checkCapability` in the same transaction `createRequest` uses and returns `409 conflict.capability_already_granted` when `allow === true`.
4. **Managed-system id is pre-validated.** An unknown id, or an id from another workspace, is `validation.failed` on `requested_managed_system_id`. The `0006` FK is not workspace-scoped, and `23503` is unmapped. Supplement does not ship that 500.
5. **Response body** is `{ id, status: 'pending', updated_at }`. That is a new strict schema. It is not `permissionDecisionResultSchema` (`{ id, status, grant_id?, deny_id? }`, and that status enum cannot be `pending`) and it is not create's `{ id, status, created_at }`, beyond both being small acknowledgements. `listMine` already returns object scope and the three `source_*` fields. The read gap is `requested_expiration` and the admin `note`, not object scope.
6. **Non-owner is 404**, not 403. One predicate: `id` + `workspace_id` + `requester_actor_id`. `listAllActive`'s 403 is a collection gate and is not the precedent. §3 and §6 use the same rule.
7. **Detail strictness.** `permissionRequestedDetailSchema` is not `.strict()`. Only the four decision detail schemas are. The supplement detail schema is `.strict()`.
8. **§6** states the `run`-closure order explicitly, so a later cancel issue cannot copy the lock-before-replay bug.
9. **Skipping cancel** leaves the requester with no way to clear an open row. It stays on the active unique index and in the admin queue until an admin rejects or denies it. Stated in §3 and in question 1. The ship-supplement recommendation stands.
10. **Route test matrix** under §5: replay after success returns 200; a non-owner gets 404; a whitespace reason on a non-sensitive capability is rejected; a scope collision returns `conflict.permission_request_duplicate`; on a concurrent approve vs supplement, the loser gets `conflict.stale_write`.

Also recorded, without changing the recommendation: server-provided scope candidates stay a frontend constraint (no new `requestable` check, same gap as create); a past `requested_expiration` is not rejected (same gap as create); `:id` is a UUID at the route so a non-UUID is not an unmapped `22P02`; the audit summary is the literal `Permission request more info submitted`; an edit to `docs/implementation/api/permissions.md` keeps that file's language.

<!-- RESEARCH-3-REVISED-DONE -->
