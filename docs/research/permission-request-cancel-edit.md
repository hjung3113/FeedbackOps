# Permission request — requester cancel / edit of a pending request (open)

## Status

The `needs_more_info` supplement shipped in Issue #511 at
`POST /permission-requests/:id/submit-more-info`. The 2026-09-26 research below
predates that route. ADR-0044 still governs request-creation UX; requester
cancellation and edits to a `pending` request remain undecided.

The full original research, including the shipped supplement contract (§2, §5), is in git history at `docs/superpowers/specs/2026-09-26-permission-request-supplement-design.md`; section numbers below keep their original values.

Read-only survey of ADR-0044, the permissions module, and the permission-request lifecycle. No code was changed. There is no `service.ts` or `repo.ts` in this module. Requester commands live in `request-service.ts`, admin decisions in `decision-service.ts`, and both talk to Drizzle directly.

## Verdict

This is not one gap.

| Capability | Status | Ship in the first issue? |
|---|---|---|
| Requester **supplements** a `needs_more_info` request and returns the **same row** to `pending` | Shipped (#511, `POST /permission-requests/:id/submit-more-info`). | Done |
| Requester **rewrites a still-`pending` request** before any admin action | Not decided. ADR-0044's word "edit" does not specify it. | No |
| Requester or admin **cancel** | Not decided. No status, no audit verb, no actor rule. ADR-0044 only names the hole. | No, until the status decision below is locked |

Do not fold cancel, or in-place edit of `pending`, into the supplement endpoint. They are different state transitions, and only one of them is specified.

## 1. What ADR-0044 actually says

Accepted 2026-08-03 for #274 and #278. The decision it locks is frontend composition (confirm capability and scope, require a reason, always send `return_route_intent`, show the created request) and Managed System owner selection. It is not a cancel/edit design.

Two sentences are the entire cancel/edit record:

- Context: "The current permission routes expose create and read operations for requesters and decision operations for administrators. They expose no requester cancel or edit endpoint."
- Decision: "Request cancellation and modification are excluded because implementing them without a corresponding backend endpoint would invent a frontend-only lifecycle."

That is a gap note plus a prohibition on a fake frontend lifecycle. It does not say who may cancel, from which statuses, whether edit mutates the row or creates a new one, what the body is, or what is audited. An ADR supersedes other docs only on the decision it made. Here that decision is "do not invent this on the client." Behavior has to come from the permission contracts below, and those contracts only cover one of the two verbs.

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
- **Only from `needs_more_info`.** That is the state in which an admin has asked for a revision and has not minted a grant. A still-`pending` request has not been partially reviewed. Rewriting it under an admin who has the queue open is a different product. The create audit would also stop matching the row, and no contract authorizes the rewrite. `POST` in the shipped `submit-more-info` contract (`docs/implementation/api/permissions.md`) must `409 conflict.stale_write` when status is `pending` (or any terminal status).
- **After this partial review, edit is safe only because the trail is append-only and the row is locked.** `permission_requested` keeps the original submission. `permission_needs_more_info` keeps the admin note. The new event keeps the pre-image of the fields the older events do not store (expiration and object scope) plus the post-image. `SELECT … FOR UPDATE` serializes with `decide`. If approve, reject, or deny commits first, a later supplement sees a status that is no longer `needs_more_info` and gets `conflict.stale_write`. A second `need-more-info` leaves the status `needs_more_info`, so a later supplement can still succeed. If supplement commits first, a later approve can accept the now-`pending` row and grant from its supplemented values. No merge; approve reads the locked row rather than an earlier body.
- **Capability and source identity stay put.** The unique index and the "same source object, source action" sentence treat those as the request's identity. Changing `requested_capability`, `source_object_*`, `source_action_id`, `return_route_intent`, or the requester is a different request. They are not fields of this command. `.strict()` rejects a body that tries to send them.
- **Scope and expiration may change.** FR-PERM-002 says so. "Requested scope" in this schema is `requested_managed_system_id` + `requested_object_type` + `requested_object_id` (see the active unique index and the create body). Changing them moves the index entry. A collision with another open row is `conflict.permission_request_duplicate`, and the transaction rolls back. That is the same mapping `createRequest` uses for `23505`. When that scope tuple differs from the locked row, re-run create's in-transaction `checkCapability` against the resolved managed-system id and return `409 conflict.capability_already_granted` if the actor already holds the capability. A non-null `requested_managed_system_id` must be a `managed_systems` row in this workspace before the UPDATE; an unknown or cross-workspace id is `validation.failed` on that field, not an unmapped FK 500. `05` (the paragraph after the lifecycle field list) and ADR-0044 say the client may submit only server-provided scope candidates. Create does not enforce that server-side. This endpoint does not add that check either — same gap, restated so a scope rewrite is not a silent second door. A past `requested_expiration` is also not rejected, same as create. `decide` copies it verbatim onto the grant, so approve can mint an already-expired grant. Note it; do not add a new check in this issue.
- **Resubmit without a field change is valid.** `{}` moves `needs_more_info` → `pending` and still audits. The admin asked a question; confirming the existing reason is an answer. Do not require a diff.
- **Do not mint a grant, a deny, or an entity link.** Create does not, and approve is a separate command. Dashboard queues are not written; the row stays inside the open set, so `permission-requests-pending` count is unchanged. A `?status=needs_more_info` admin query loses the row; `?status=pending` gains it.

Editing `pending` in place, or cancelling and creating a new id, both fail the audit requirement this question is about. The first destroys expiration and object scope without a pre-image and changes the body under an undecided review. The second breaks the same-identity rule and, while the first row is still active, usually 409s.

### Read gap (do not block the mutation on it)

The admin question is only in the `permission_needs_more_info` audit detail. `GET /permission-requests/mine` (`listMine`) already returns `requested_managed_system_id`, `requested_object_type`, `requested_object_id`, and all three `source_*` fields. It does not return `requested_expiration`, `updated_at`, or the admin `note`. The read gap is the note and the expiration, not object scope. Interaction-patterns says the requester UI shows that question. No module reads audit rows back today (`auditService.record` only). Showing the question is a separate read-model change (either denormalize `more_info_request` onto the row, which `09` lists and the table does not have, or teach the mine query to surface the latest note). Adding `requested_expiration` belongs on that read issue, not on this mutation's response. `updated_at` is absent from `listMine` too, but the mutation response in the shipped `submit-more-info` contract (`docs/implementation/api/permissions.md`) returns it. The mutation contract does not depend on the read gap. Call it out in the issue; do not silently widen this endpoint into a read API.

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
