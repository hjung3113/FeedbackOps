---
paths:
  - "apps/backend/src/**/*.test.ts"
  - "apps/backend/src/**/__tests__/**"
  - "apps/backend/src/test-support/**"
---

# Backend integration test traps

The gate, env, reset contract, and teardown rules are in `apps/backend/AGENTS.md` → Verification. These are the additional measured traps.

## What a test must do to prove anything

- Go through the route (`buildServer` + `app.inject`). Calling the service directly does not prove the HTTP contract.
- Use actors that actually differ in the scope under test. Same-scope actors make a leak test vacuous.
- For mutations, assert the audit row, not only the HTTP response.
- For each case, ask: if this behavior regressed, would this test fail?
- Error bodies are flat `{ code, message, detail }`. Copy the assertion idiom from a sibling suite instead of asserting a nested `{ error: { code } }` envelope.

## Rate limits

- A `429 rate_limited.actor` in a test is a per-actor route-group limit (`apps/backend/src/lib/rate-limit-tiers.ts`; usually the `mutation` group, 10 per minute), not the global limit. Find the route's tier first. The window is stored in Postgres, so an immediate rerun keeps the current count.
- Seed fixtures through SQL (see `seed()` in `survey-results.integration.test.ts`) and use HTTP only for the mutation under test. If that is not enough, give each mutating test its own actor.
- Never change, stub, sleep around, or retry around the limiter.

## Fixtures and teardown

- Session rows are not per-test garbage: deleting `core.sessions` in `beforeEach` revokes cookies minted in `beforeAll`, and later requests return `401 auth.session_invalid`. Clean sessions in `afterAll` only.
- Tear down children before parents: grant → managed system → session → actor, and vocs/managed systems/actors before workspaces. Audit-log and permission-request rows go first; see `apps/backend/AGENTS.md` → Verification.
- `db.execute` returns `timestamptz` as text, not `Date`. Normalize with `v instanceof Date ? v : new Date(v)`; an empty-result test never exercises the mapping.

## Authorization is two layers

`roleSatisfies` is only the bottom layer; the admin-bypass layer on top is described in `apps/backend/src/modules/permissions/AGENTS.md`. To decide whether an actor has a capability, read the enforcement path the route actually calls. Persona grants for `SEED_MODE=personas` are pinned in `apps/backend/src/db/__tests__/persona-seed.integration.test.ts`.
