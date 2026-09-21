# ADR-0047: Entity-link VOC visibility requires voc.read, not voc.triage

Date: 2026-08-30

## Status

Accepted.

## Context

Issue #394 flagged a contract collision. `assertVocReadScope`
(`apps/backend/src/modules/entity-links/service.ts:218-235`) grants full
entity-link visibility (`canRead`) to an actor holding `voc.triage` on the
subject's Managed System even when that actor lacks `voc.read` and is not the
VOC's reporter:

```ts
async function assertVocReadScope(...) {
  if (subject.reporter_id && actor.actor_id === subject.reporter_id) return true;
  const readDecision = await checkCapability(actor, 'voc.read', ...);
  if (readDecision.allow) return true;
  const triageDecision = await checkCapability(actor, 'voc.triage', ...);
  return triageDecision.allow;   // <- the fallback in question
}
```

This same function gates **both** read visibility of existing links
(`entityLinkProviders.voc.canRead`) and creation of new voc→voc links
(`createLink` calls `sourceProvider.canRead` for the source-VOC check —
`service.ts:743-746`), since the `voc` provider defines no separate
`canCreateTarget`.

Two things in the codebase disagree with this fallback:

1. **The written contract.** `docs/implementation/06-entity-linking-contract.md`
   states plainly, in three places, that VOC entity-link read and create authz
   require `voc.read` — it never mentions `voc.triage` as a qualifying
   capability:
   - Slice 4.1 tracer: "create authz: actor must have `voc.read`... / read
     authz: focused endpoint must be readable"
   - Slice 4.3 workspace inventory: "every row checks `voc.read` on both
     endpoints' Managed Systems"
   - Slice 5 Finding provider: "create authz: actor needs `voc.read` on the
     source VOC's MS"

2. **The established triage-visibility pattern elsewhere.** The VOC detail and
   conversation endpoints treat `voc.triage`-only (no `voc.read`, not
   reporter) as a **summary-only** territory, never full access:
   - `get-voc.integration.test.ts` AC10: triage-only → `200` but a reduced
     SUMMARY envelope (`id`, `display_id`, `primary_managed_system_id`,
     `reporter_facing_status`, `created_at`, `permission_decisions` — no body
     content).
   - `get-conversation.integration.test.ts` AC7: triage-only → `403
     permission.denied` on the conversation endpoint outright.

Only `entity-links.integration.test.ts:845-884` ("GET by VOC source accepts
managed-system scoped voc.triage without voc.read") asserts the opposite: a
triage-only actor gets the **full** `visibility_state: 'allowed'` link,
including `source_id` and `target_id` — the same result a `voc.read` holder
gets. That test currently passes because it was written to match the
undocumented fallback, not the contract.

## Decision

**Option A.** Link metadata is part of source readability. Entity-link read
and create authz for a `voc` endpoint require `voc.read` on that endpoint's
Managed System, or reporter identity (`actor_id === subject.reporter_id`).
`voc.triage` alone is **not sufficient** for either read or create — it must
be dropped from `assertVocReadScope`.

This is Option A, not B, because:
- It is what the contract already says in three places; nothing needs to be
  redefined, only the implementation aligned.
- It matches the precedent already set for the *source record itself*
  (VOC detail/conversation): `voc.triage` without `voc.read` is summary
  territory, not full territory, everywhere else in this codebase. Option B
  (a narrower explicit triage-only link-metadata capability) would introduce
  a second, entity-links-specific meaning for `voc.triage` that the rest of
  the system doesn't have, for no requested product reason — nobody has asked
  for triagers to see cross-VOC link topology, and inventing a bespoke field
  allowlist for that now (per the issue's Option B framing: "define exactly
  which fields and mutations it permits") would be speculative design with no
  concrete requirement driving it.

## Read and create behavior (specified separately)

- **Read** (`GET /entity-links?...` endpoint-scoped or workspace-inventory
  mode, and the VOC-detail Links tab payload): a `voc` endpoint is readable
  only via `voc.read` on its Managed System or reporter identity. A
  `voc.triage`-only actor sees the row as `visibility_state: 'hidden'` (or
  `'denied'`, per existing decision logic), like any other non-readable
  endpoint — never `'allowed'`.
- **Create** (`POST /entity-links`, voc→voc `related_to`): the source-VOC
  check in `createLink` uses the same `canRead` gate, so it inherits the same
  fix automatically — a `voc.triage`-only actor cannot create a link from a
  VOC they can't fully read. No separate code path needs to change beyond
  `assertVocReadScope` itself.

## Existence/summary leakage

No new leakage surface: `hidden` rows already carry the existing contract
invariant ("hidden inventory rows expose audit metadata but never source_id,
target_id, or synthesized endpoint summaries" —
`06-entity-linking-contract.md`, Slice 4.3). Moving triage-only actors from
`allowed` to `hidden` **removes** a leakage path (they currently see
`source_id`/`target_id` they shouldn't); it does not open one.

## Follow-up implementation

Issue #423 tracks the code change: drop the `voc.triage` fallback from
`assertVocReadScope`, and rewrite
`entity-links.integration.test.ts:845-884` to assert the corrected behavior.

## Non-goals

- This ADR does not introduce a summary-visible tier for VOC entity links
  (paralleling `visibility_state: 'summary_visible'` used elsewhere for task
  reporter summaries). If a future product requirement wants triagers to see
  *something* about cross-VOC links without full read, that is new scope
  requiring its own design, not a re-litigation of this decision.
- This ADR does not touch `finding`, `task`, `task_request`, or
  `survey_response` entity-link providers — their `canRead`/`canCreateTarget`
  gates are unrelated to `voc.triage` and are out of scope.
