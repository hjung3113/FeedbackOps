# Slice 3 Prologue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every Slice 2 review follow-up still deferred in `.review/USER-VERIFICATION-CHECKLIST.md` §1.2 / §1.3 / §1.4 so Slice 3 (MS-scoped grant satisfaction) can start on a hardened base.

**Architecture:** Three logical layers, executed in order: (1) **type foundation** — replace `Tx = Db` with a proper transaction union so the compiler enforces tx-not-pool; (2) **runtime correctness** — thread tx through capability checks, add advisory locks at idempotent INSERT paths, fix canonicalize hash collision, drop redundant per-request actor reads; (3) **test infrastructure** — second-workspace seed helper, cascade-rollback service-level harness, pg-boss retry coverage, concurrent-idempotency race coverage. Each layer's commits stand alone on `main` without breaking the suite.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM (`node-postgres` driver), `pg`, `pg-boss`, Vitest, Postgres 16. AGENTS.md authority: AGENTS.md > CONTEXT.md > docs/adr > docs/implementation. ADR-0015 (idempotency), ADR-0017 (Managed System scope), ADR-0018 (AA cascade), ADR-0019 (Slice 2 review follow-ups) are load-bearing.

**Delivery:** Direct commits on `main`, no push, no issue close, no UI polish — matches the standing orchestration rule.

---

## File Structure

**New files:**
- `apps/backend/src/db/tx.ts` — exports the canonical `Tx` union (`Db | PgTransaction<typeof schema>`). Single source of truth so `audit-service.ts` and `idempotency-service.ts` import it instead of re-declaring.
- `apps/backend/src/modules/core/idempotency/__tests__/canonicalize.test.ts` — unit-pins S-008 hash distinguishability between `{}` and `{ external_key: undefined }`.
- `apps/backend/src/modules/core/idempotency/__tests__/idempotency-service.race.integration.test.ts` — pins M2 concurrent-record race.
- `apps/backend/src/modules/managed-systems/__tests__/register.advisory-lock.integration.test.ts` — pins S-001 concurrent same-key replay.
- `apps/backend/src/modules/permissions/__tests__/check-service.tx-scoped.integration.test.ts` — pins S-002 mid-tx revoke visibility.
- `apps/backend/src/test-support/seed-second-workspace.ts` — C1 helper: extra workspace + admin + user actor + session cookie issuance.
- `apps/backend/src/modules/analytics-areas/__tests__/cross-workspace.integration.test.ts` — pins H3 cross-workspace AA register rejection.
- `apps/backend/src/modules/analytics-areas/__tests__/cascade.rollback.unit.test.ts` — pins C4 cascade partial-failure rollback with injected throwing audit stub.
- `apps/backend/src/modules/core/jobs/__tests__/idempotency-purge.retry.integration.test.ts` — pins H6 pg-boss retry behavior.

**Modified files (touch scope per task):**
- `apps/backend/src/db/client.ts` — re-export `Tx` from `tx.ts`.
- `apps/backend/src/modules/core/audit/audit-service.ts` — drop `Tx = Db`, import from `tx.ts`.
- `apps/backend/src/modules/core/idempotency/idempotency-service.ts` — same.
- `apps/backend/src/modules/core/idempotency/canonicalize.ts` — sentinel-encode `undefined`.
- `apps/backend/src/modules/permissions/check-service.ts` — `checkCapability` accepts optional `tx` handle.
- `apps/backend/src/modules/managed-systems/managed-system-service.ts` — drop 11 casts, advisory lock at `registerManagedSystem`, tx-scoped capability check at `requireWorkspaceAdmin`.
- `apps/backend/src/modules/analytics-areas/analytics-area-service.ts` — drop 9 casts, advisory lock at `registerAnalyticsArea`, tx-scoped capability check, extract `cascadeArchiveActiveChildren` deps for injection.
- `apps/backend/src/modules/permissions/request-service.ts` — drop 4 casts, advisory lock at `createRequest`, tx-scoped capability re-check at line 134.
- `apps/backend/src/middleware/require-session.ts` — join `actors` once and inject `role_level` on `req.session`.
- `apps/backend/src/modules/auth/session-service.ts` — extend `SessionRecord` with `roleLevel`.
- `apps/backend/src/types/fastify.d.ts` (or equivalent type augmentation file) — add `role_level` to session augmentation.
- `apps/backend/src/modules/permissions/routes.ts`, `apps/backend/src/modules/managed-systems/routes.ts`, `apps/backend/src/modules/analytics-areas/routes.ts` — remove `loadActorContext` helper, read `role_level` from session.
- `docs/adr/0015-idempotency-protocol.md` — narrative amendment for advisory lock; the locked decisions table is unchanged.
- `apps/backend/AGENTS.md` — one-line pointer noting `Tx` lives in `db/tx.ts` and that mutation services accept `Tx`, never the pool.

---

## Cross-cutting conventions

- TDD red→green every task. New test runs and fails before implementation, runs and passes after. Skip is not allowed — if a test cannot fail today, the test is wrong.
- Each task ends with one atomic commit. Commit message format: `slice3-prologue: <ID> <one-line scope>`.
- Test suite must stay green (`pnpm --filter @fops/backend test`) after every commit. If a refactor in one task transiently breaks unrelated tests, fix the breakage in that same task before committing.
- Migrations: no new migration is required by this prologue. If one becomes necessary (e.g. an index for advisory-lock concurrency tests), it goes in its own task numbered `0010_…` per the established sequence and lands before its consuming code.
- Korean responses, caveman-full chat tone, normal English in code/commits/docs.
- Do not push, do not close GitHub issues, do not touch UI / design tokens.

---

## Task 1 — `Tx` union type foundation (S-006)

**Files:**
- Create: `apps/backend/src/db/tx.ts`
- Modify: `apps/backend/src/db/client.ts`
- Modify: `apps/backend/src/modules/core/audit/audit-service.ts:22-25`
- Modify: `apps/backend/src/modules/core/idempotency/idempotency-service.ts:24-32`
- Modify: `apps/backend/src/modules/analytics-areas/analytics-area-service.ts` (9 casts at lines 75, 86, 89, 97, 101, 108, 127, 130, 463; `cascadeArchiveActiveChildren` signature line 167-175)
- Modify: `apps/backend/src/modules/managed-systems/managed-system-service.ts` (11 casts at 182, 193, 196, 204, 220, 252, 273, 276, 283, 467, 481)
- Modify: `apps/backend/src/modules/permissions/request-service.ts` (4 casts at 115, 127, 130, 138)
- Modify: `apps/backend/AGENTS.md` (one-line pointer)
- Test: N/A (refactor only; coverage comes from existing 147-test suite staying green)

- [ ] **Step 1: Write the new type file**

Create `apps/backend/src/db/tx.ts`:

```typescript
// Canonical transaction handle. Service code that performs mutations MUST
// accept `Tx` so it can be invoked inside an open transaction; passing the
// pool-backed `Db` here would silently break read-then-write atomicity
// (see S-002 / S-006 in .review/USER-VERIFICATION-CHECKLIST.md).

import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';

import * as core from './schema/core.js';
import * as permission from './schema/permission.js';
import type { Db } from './client.js';

const schema = { ...core, ...permission };

type Schema = typeof schema;
type TablesWithRelations = ExtractTablesWithRelations<Schema>;

export type DrizzleTx = PgTransaction<NodePgQueryResultHKT, Schema, TablesWithRelations>;

export type Tx = Db | DrizzleTx;
```

- [ ] **Step 2: Re-export `Tx` from `db/client.ts`**

Append to `apps/backend/src/db/client.ts`:

```typescript
export type { Tx, DrizzleTx } from './tx.js';
```

- [ ] **Step 3: Run typecheck to verify the union compiles**

Run: `pnpm --filter @fops/backend typecheck`
Expected: PASS. Schema generics are inferred; no callers have switched yet so behavior is unchanged.

- [ ] **Step 4: Replace `Tx = Db` alias in `audit-service.ts`**

Edit `apps/backend/src/modules/core/audit/audit-service.ts:22-25` — replace `export type Tx = Db;` with `import type { Tx } from '../../../db/tx.js';` and re-export: `export type { Tx };`. Remove the now-unused `import type { Db } from '../../../db/client.js'` if `Db` is no longer referenced elsewhere in the file.

- [ ] **Step 5: Replace `Tx = Db` alias in `idempotency-service.ts`**

Same change at `apps/backend/src/modules/core/idempotency/idempotency-service.ts:26-32`. Method signatures (`lookup(tx: Tx, …)`, `record(tx: Tx, …)`) already use `Tx`, so the union is picked up automatically.

- [ ] **Step 6: Drop casts in `analytics-area-service.ts`**

For each of the 9 sites (lines 75, 86, 89, 97, 101, 108, 127, 130, 463), replace `tx as unknown as Db` with `tx`. Update the `cascadeArchiveActiveChildren` signature at line 167-175 to take `tx: Tx` instead of `tx: Db`. Update any local helper signatures that took `Db` for tx-bound work to take `Tx`.

- [ ] **Step 7: Drop casts in `managed-system-service.ts`**

For each of the 11 sites (lines 182, 193, 196, 204, 220, 252, 273, 276, 283, 467, 481), replace `tx as unknown as Db` with `tx`. The `archiveManagedSystem` flow at line 466 (call into `cascadeArchiveActiveChildren`) now passes `tx` directly.

- [ ] **Step 8: Drop casts in `request-service.ts`**

For each of the 4 sites (115, 127, 130, 138), replace `tx as unknown as Db` with `tx`.

- [ ] **Step 9: Run typecheck and full backend suite**

Run: `pnpm --filter @fops/backend typecheck && pnpm --filter @fops/backend test`
Expected: typecheck PASS, 147 tests PASS. If a service was accidentally passing the pool where the tx was intended, this is where it surfaces — fix the call site, not the type.

- [ ] **Step 10: Update `apps/backend/AGENTS.md`**

Add under "Layer Rules":

```markdown
- Mutation services accept the transaction union `Tx` from `db/tx.ts`, never `Db` (the pool). The compiler enforces this — do not re-introduce a `Tx = Db` alias.
```

- [ ] **Step 11: Run `check:boundaries`**

Run: `pnpm --filter @fops/backend check:boundaries`
Expected: clean.

- [ ] **Step 12: Commit**

```bash
git add apps/backend/src/db/tx.ts \
        apps/backend/src/db/client.ts \
        apps/backend/src/modules/core/audit/audit-service.ts \
        apps/backend/src/modules/core/idempotency/idempotency-service.ts \
        apps/backend/src/modules/analytics-areas/analytics-area-service.ts \
        apps/backend/src/modules/managed-systems/managed-system-service.ts \
        apps/backend/src/modules/permissions/request-service.ts \
        apps/backend/AGENTS.md
git commit -m "slice3-prologue: S-006 Tx union — drop Tx = Db alias and 24 tx casts"
```

---

## Task 2 — `checkCapability` tx threading (S-002)

**Files:**
- Modify: `apps/backend/src/modules/permissions/check-service.ts:71-195`
- Modify: `apps/backend/src/modules/analytics-areas/analytics-area-service.ts:112` (caller)
- Modify: `apps/backend/src/modules/managed-systems/managed-system-service.ts:121` (caller)
- Modify: `apps/backend/src/modules/permissions/request-service.ts:134` (caller, re-check after handler)
- Modify: `apps/backend/src/modules/permissions/routes.ts:103` (caller, pool path — leave on `deps.db`)
- Test: `apps/backend/src/modules/permissions/__tests__/check-service.tx-scoped.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `apps/backend/src/modules/permissions/__tests__/check-service.tx-scoped.integration.test.ts`. The test boots the seed, opens a transaction, inserts a permission grant inside the tx for a user, asserts `checkCapability(actor, capability, scope, { tx })` returns `allow` BEFORE commit and that an external `deps.db`-bound check returns `deny` (the grant is not yet committed). Then rollback and re-check both — both should now deny. Pins that the same call answers differently when bound to the tx vs the pool.

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { createDb, type DbHandle } from '../../../db/client.js';
import { permissionGrants } from '../../../db/schema/permission.js';
import { createCheckService } from '../check-service.js';
import { setupTestDb, type TestDbContext } from '../../../test-support/test-db.js'; // existing helper used by other integration tests
import { seedBaseline } from '../../../test-support/seed-baseline.js'; // existing helper

describe('checkService.checkCapability tx-scoped read (S-002)', () => {
  let ctx: TestDbContext;
  let handle: DbHandle;

  beforeAll(async () => {
    ctx = await setupTestDb();
    handle = ctx.handle;
    await seedBaseline(handle);
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  it('observes a grant written inside the same transaction', async () => {
    const checkService = createCheckService({ db: handle.db });
    const actor = await ctx.loadActor('mock-user-1'); // existing helper shape
    const capability = 'managed_system.write' as const;
    const scope = { workspace_id: actor.workspace_id, managed_system_id: ctx.tableauId };

    const before = await checkService.checkCapability(actor, capability, scope);
    expect(before.decision).toBe('deny');

    await handle.db.transaction(async (tx) => {
      await tx.insert(permissionGrants).values({
        workspaceId: actor.workspace_id,
        actorId: actor.actor_id,
        capability,
        scopeManagedSystemId: ctx.tableauId,
        grantedByActorId: ctx.adminActorId,
      });

      const inTx = await checkService.checkCapability(actor, capability, scope, { tx });
      expect(inTx.decision).toBe('allow');

      const offTx = await checkService.checkCapability(actor, capability, scope);
      expect(offTx.decision).toBe('deny');

      // Rollback the grant so other tests are not polluted.
      throw new Error('intentional rollback');
    }).catch((err) => {
      if ((err as Error).message !== 'intentional rollback') throw err;
    });

    const after = await checkService.checkCapability(actor, capability, scope);
    expect(after.decision).toBe('deny');
  });
});
```

If existing test-support helper names differ (e.g. `setupTestDb` is actually `withTestDb`), match the codebase convention — read one neighbour test in the same `__tests__` directory and mirror it. Do not invent new helpers in this task.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @fops/backend test src/modules/permissions/__tests__/check-service.tx-scoped.integration.test.ts`
Expected: FAIL at the `inTx` assertion with `expected 'deny' to be 'allow'` (the current `checkCapability` reads from `deps.db`, missing the in-tx insert).

- [ ] **Step 3: Add the optional `tx` parameter to `checkCapability`**

Edit `apps/backend/src/modules/permissions/check-service.ts`. Add a fourth parameter with an `{ tx?: Tx }` options object; default the read handle to `tx ?? deps.db` for every query inside `checkCapability`. Import `Tx` from `../../db/tx.js`.

Signature:

```typescript
async function checkCapability(
  actor: ActorContext,
  capability: Capability,
  scope: CheckScope,
  options: { tx?: Tx } = {},
): Promise<Decision> {
  const db: Tx = options.tx ?? deps.db;
  // Replace every `deps.db.select(...)` / `deps.db.execute(...)` inside this
  // function with `db.select(...)` / `db.execute(...)`. Steps 3 / 4 / 5 of
  // ADR-0019 Section D are all part of the same handle.
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @fops/backend test src/modules/permissions/__tests__/check-service.tx-scoped.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread `tx` from `requireWorkspaceAdmin` and Slice 2 mutation callers**

In each mutation service, locate the `checkService.checkCapability(...)` call inside the open `db.transaction(async (tx) => { ... })` block and add `{ tx }` as the fourth argument:

- `apps/backend/src/modules/managed-systems/managed-system-service.ts:121` — inside `requireWorkspaceAdmin`, accept `tx: Tx` as a parameter and pass `{ tx }`.
- `apps/backend/src/modules/analytics-areas/analytics-area-service.ts:112` — same.
- `apps/backend/src/modules/permissions/request-service.ts:134` — the post-handler re-check; pass `{ tx }`.

The route-level pre-check in `permissions/routes.ts:103` stays on `deps.db` (pool) — it answers a non-mutating GET and must not hold a tx open across the HTTP response.

- [ ] **Step 6: Run the full suite to ensure no regression**

Run: `pnpm --filter @fops/backend test && pnpm --filter @fops/backend typecheck`
Expected: 148 passing (147 prior + 1 new), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/permissions/check-service.ts \
        apps/backend/src/modules/permissions/__tests__/check-service.tx-scoped.integration.test.ts \
        apps/backend/src/modules/managed-systems/managed-system-service.ts \
        apps/backend/src/modules/analytics-areas/analytics-area-service.ts \
        apps/backend/src/modules/permissions/request-service.ts
git commit -m "slice3-prologue: S-002 tx-scoped checkCapability — thread tx through Slice 2 mutation paths"
```

---

## Task 3 — Advisory lock at idempotent register/create paths (S-001) + ADR-0015 narrative

**Files:**
- Modify: `apps/backend/src/modules/managed-systems/managed-system-service.ts:132-230` (`registerManagedSystem`)
- Modify: `apps/backend/src/modules/analytics-areas/analytics-area-service.ts:217-280` (`registerAnalyticsArea`)
- Modify: `apps/backend/src/modules/permissions/request-service.ts:100-180` (`createRequest`)
- Modify: `docs/adr/0015-idempotency-protocol.md` (narrative amendment; no decision change)
- Test: `apps/backend/src/modules/managed-systems/__tests__/register.advisory-lock.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `apps/backend/src/modules/managed-systems/__tests__/register.advisory-lock.integration.test.ts`. Spin up two `pg.Pool` clients sharing the seed DB, both call `registerManagedSystem` with the same `(actor, idempotencyKey)` body concurrently via `Promise.all`. Assert both resolve to 201 with the same `id`, and that exactly one row exists in `core.managed_systems` for the slug.

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDbContext } from '../../../test-support/test-db.js';
import { seedBaseline } from '../../../test-support/seed-baseline.js';
import { createManagedSystemService } from '../managed-system-service.js';
// import audit / idempotency / check services as the existing service factory expects

describe('registerManagedSystem concurrent same-key retry (S-001)', () => {
  let ctx: TestDbContext;

  beforeAll(async () => {
    ctx = await setupTestDb();
    await seedBaseline(ctx.handle);
  });

  afterAll(async () => ctx.teardown());

  it('two concurrent retries with the same idempotency key both replay the winning response', async () => {
    const svc = createManagedSystemService(ctx.deps); // mirror existing factory signature
    const actor = await ctx.loadActor('mock-admin-1');
    const body = { slug: 'race-ms-1', name: 'Race MS 1' };
    const idempotencyKey = 'k-race-1';

    const [first, second] = await Promise.all([
      svc.registerManagedSystem(actor, body, { idempotencyKey }),
      svc.registerManagedSystem(actor, body, { idempotencyKey }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).toBe(second.body.id);

    const rows = await ctx.handle.db.execute(
      `SELECT id FROM core.managed_systems WHERE workspace_id = $1 AND slug = $2`,
      [actor.workspace_id, 'race-ms-1'],
    );
    expect((rows as { rows: unknown[] }).rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @fops/backend test src/modules/managed-systems/__tests__/register.advisory-lock.integration.test.ts`
Expected: FAIL — one call returns 201, the other returns 409 `conflict.duplicate_slug` (the current `unique_violation` surface).

- [ ] **Step 3: Add `pg_advisory_xact_lock` to `registerManagedSystem`**

In `managed-system-service.ts`, immediately after `db.transaction(async (tx) => {` and BEFORE the idempotency `lookup` call, add:

```typescript
if (options.idempotencyKey) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${actor.actor_id}), hashtext(${options.idempotencyKey}))`,
  );
  // Re-lookup AFTER the lock so we see the winner's committed row when we
  // arrived second. Required by ADR-0015's replay contract.
  const reLookup = await idempotencyService.lookup(tx, actor.actor_id, options.idempotencyKey, requestHash);
  if (reLookup.kind === 'match') {
    return { status: reLookup.status, body: reLookup.body as ManagedSystemDto };
  }
  if (reLookup.kind === 'mismatch') {
    throw new HttpError(409, 'conflict.idempotency_key_reuse', 'idempotency key already in use with a different request');
  }
}
```

Insert this in place of (i.e. replacing) the existing `if (options.idempotencyKey) { const hit = await idempotencyService.lookup(...) ... }` block at lines 132-160. The lock is acquired first; the lookup that follows is the authoritative one.

Import `sql` from `drizzle-orm` if not already imported.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @fops/backend test src/modules/managed-systems/__tests__/register.advisory-lock.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply the same lock to `registerAnalyticsArea`**

Same pattern at `analytics-area-service.ts:217-280`. Lock key: `(actor.actor_id, options.idempotencyKey)`. Same re-lookup, same replay path.

- [ ] **Step 6: Apply the same lock to `createRequest`**

Same pattern at `request-service.ts:100-180`.

- [ ] **Step 7: Run the full backend suite**

Run: `pnpm --filter @fops/backend test`
Expected: 149 passing (148 prior + 1 new). No regression in existing concurrent or idempotency tests.

- [ ] **Step 8: Amend ADR-0015 narrative**

Edit `docs/adr/0015-idempotency-protocol.md`. After the existing "Protocol" section (which documents the lookup → handler → record flow), add a "Race surface" subsection:

```markdown
### Race surface (S-001 amendment, 2026-05-17)

Two concurrent first-time retries with the same `(actor_id, key)` originally
raced on the domain table's unique constraint, surfacing 409 `conflict.duplicate_slug`
or sibling errors to the loser instead of replaying the winner's response.

Mitigation: every register / create path that consumes an idempotency key
takes `pg_advisory_xact_lock(hashtext(actor_id), hashtext(key))` inside the
open transaction BEFORE its first `idempotencyService.lookup` call. The
loser blocks until the winner commits, then re-runs `lookup`, observes the
committed row, and replays the stored response.

This amendment does not change the locked decisions in this ADR; it
documents the race surface that those decisions implicitly required and the
lock pattern that closes it. Applies to all sites listed in the
"Idempotency carriers" subsection below.
```

Do not touch the existing locked-decision blocks.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/managed-systems/managed-system-service.ts \
        apps/backend/src/modules/analytics-areas/analytics-area-service.ts \
        apps/backend/src/modules/permissions/request-service.ts \
        apps/backend/src/modules/managed-systems/__tests__/register.advisory-lock.integration.test.ts \
        docs/adr/0015-idempotency-protocol.md
git commit -m "slice3-prologue: S-001 advisory lock at idempotent register/create paths + ADR-0015 narrative"
```

---

## Task 4 — `canonicalizeJson` undefined sentinel (S-008)

**Files:**
- Modify: `apps/backend/src/modules/core/idempotency/canonicalize.ts:11-19`
- Test: `apps/backend/src/modules/core/idempotency/__tests__/canonicalize.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `apps/backend/src/modules/core/idempotency/__tests__/canonicalize.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { canonicalizeJson, hashRequestBody } from '../canonicalize.js';

describe('canonicalizeJson undefined sentinel (S-008)', () => {
  it('distinguishes {} from { external_key: undefined }', () => {
    const a = hashRequestBody({});
    const b = hashRequestBody({ external_key: undefined });
    expect(a).not.toBe(b);
  });

  it('distinguishes { external_key: undefined } from { external_key: null }', () => {
    const undef = hashRequestBody({ external_key: undefined });
    const nul = hashRequestBody({ external_key: null });
    expect(undef).not.toBe(nul);
  });

  it('round-trips nested undefined-bearing objects deterministically', () => {
    const h1 = hashRequestBody({ a: { b: undefined, c: 1 } });
    const h2 = hashRequestBody({ a: { b: undefined, c: 1 } });
    expect(h1).toBe(h2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @fops/backend test src/modules/core/idempotency/__tests__/canonicalize.test.ts`
Expected: FAIL on the first two assertions (undefined currently passes through unchanged and JSON-stringifies to omission).

- [ ] **Step 3: Sentinel-encode `undefined`**

Edit `apps/backend/src/modules/core/idempotency/canonicalize.ts`. Replace the function body so undefined values become a sentinel marker:

```typescript
const UNDEFINED_SENTINEL = '__fops_undefined__' as const;

export function canonicalizeJson(value: unknown): unknown {
  if (value === undefined) return UNDEFINED_SENTINEL;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const v = (value as Record<string, unknown>)[key];
    out[key] = canonicalizeJson(v); // explicit-undefined keys retained via sentinel
  }
  return out;
}
```

The existing `hashRequestBody` (`canonicalizeJson(body ?? {})`) is left as-is; the `??` already collapses literal `undefined` body to `{}`, but explicit-undefined sub-keys now survive.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @fops/backend test src/modules/core/idempotency/__tests__/canonicalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite (regression sweep)**

Run: `pnpm --filter @fops/backend test`
Expected: green. If any prior idempotency test was inadvertently relying on `{ x: undefined }` collapsing to `{}`, the breakage is meaningful — fix the test, not the canonicalizer.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/core/idempotency/canonicalize.ts \
        apps/backend/src/modules/core/idempotency/__tests__/canonicalize.test.ts
git commit -m "slice3-prologue: S-008 canonicalizeJson — sentinel-encode undefined to distinguish absent vs explicit-undefined"
```

---

## Task 5 — Inject `role_level` into `req.session` (HTTP L-1)

**Files:**
- Modify: `apps/backend/src/modules/auth/session-service.ts:28-32` (`SessionRecord`) and `:219-275` (`loadAndTouch`)
- Modify: `apps/backend/src/middleware/require-session.ts:15-36`
- Modify: `apps/backend/src/types/fastify.d.ts` (or wherever the `req.session` augmentation lives)
- Modify: `apps/backend/src/modules/permissions/routes.ts:57-67, 75-114, 155-209, 213-240` (remove `loadActorContext`)
- Modify: `apps/backend/src/modules/analytics-areas/routes.ts:54-61` (and call sites)
- Modify: `apps/backend/src/modules/managed-systems/routes.ts:57-64` (and call sites)
- Test: rely on existing route tests; verify they still pass after `loadActorContext` is removed.

- [ ] **Step 1: Confirm the augmentation site**

Run: `grep -n "interface FastifyRequest" apps/backend/src/types/fastify.d.ts apps/backend/src/middleware/require-session.ts 2>/dev/null`
Read the result. If the augmentation lives elsewhere (e.g. `apps/backend/src/types/session.d.ts`), substitute that path everywhere this task says `fastify.d.ts`.

- [ ] **Step 2: Extend `SessionRecord` with `roleLevel`**

Edit `apps/backend/src/modules/auth/session-service.ts:28-32`:

```typescript
export interface SessionRecord {
  id: string;
  actorId: string;
  workspaceId: string;
  roleLevel: 'admin' | 'manager' | 'user';
}
```

Update the `SELECT` inside `loadAndTouch` (around line 242-254) to join `core.actors` and return `role_level` alongside `actor_id` / `workspace_id`. Use a single query — do not add a follow-up read.

```typescript
const rows = await this.db.execute(sql`
  WITH touched AS (
    UPDATE core.sessions
       SET last_seen_at = now()
     WHERE id = ${sessionId}
       AND revoked_at IS NULL
       AND expires_at > now()
  RETURNING actor_id, workspace_id
  )
  SELECT t.actor_id, t.workspace_id, a.role_level
    FROM touched t
    JOIN core.actors a ON a.id = t.actor_id AND a.workspace_id = t.workspace_id
`);
```

Map the resulting row into `SessionRecord` shape including `roleLevel`.

- [ ] **Step 3: Propagate into `req.session` in middleware**

Edit `apps/backend/src/middleware/require-session.ts:15-36`. Add `role_level: loaded.session.roleLevel` to the `req.session = { … }` assignment.

- [ ] **Step 4: Augment the Fastify request type**

Edit the augmentation file so `FastifyRequest['session']` carries `role_level: 'admin' | 'manager' | 'user'`. Match the existing field naming convention (snake_case here per the runtime payload).

- [ ] **Step 5: Run typecheck (red — routes now reference `req.session.role_level` indirectly via the new shape; nothing breaks yet but the shape exists)**

Run: `pnpm --filter @fops/backend typecheck`
Expected: PASS.

- [ ] **Step 6: Remove `loadActorContext` from `permissions/routes.ts`**

Edit `apps/backend/src/modules/permissions/routes.ts`. Delete the `loadActorContext` helper at lines 57-67. In each of the three routes that call it (75-114, 155-209, 213-240), build the actor context inline from `req.session`:

```typescript
const actor: ActorContext = {
  actor_id: req.session.actor_id,
  workspace_id: req.session.workspace_id,
  role_level: req.session.role_level,
};
```

Remove the per-route DB read and the now-redundant null-check + 401 emission (the session itself was already gated by `requireSession`).

- [ ] **Step 7: Repeat for `analytics-areas/routes.ts` and `managed-systems/routes.ts`**

Same deletion at the same line ranges in each file.

- [ ] **Step 8: Run full backend suite**

Run: `pnpm --filter @fops/backend test && pnpm --filter @fops/backend typecheck`
Expected: all green. Existing route tests cover the auth surface — if they break, the new session shape probably isn't being seeded by the test login helper; fix the helper (one-line patch to include `roleLevel` in the seeded session row).

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/auth/session-service.ts \
        apps/backend/src/middleware/require-session.ts \
        apps/backend/src/types/fastify.d.ts \
        apps/backend/src/modules/permissions/routes.ts \
        apps/backend/src/modules/analytics-areas/routes.ts \
        apps/backend/src/modules/managed-systems/routes.ts
git commit -m "slice3-prologue: HTTP L-1 inject role_level into req.session — drop per-request loadActorContext"
```

---

## Task 6 — `seedSecondWorkspace` test helper (C1)

**Files:**
- Create: `apps/backend/src/test-support/seed-second-workspace.ts`
- Test: N/A in this task (helper is consumed by Task 7).

- [ ] **Step 1: Write the helper**

Create `apps/backend/src/test-support/seed-second-workspace.ts`:

```typescript
// C1: second-workspace seed fixture. Reuses the production seed shape so
// cross-workspace negative tests look exactly like cross-workspace traffic
// in production. Returns enough material to issue a session cookie for the
// new workspace's admin or user.

import type { DbHandle } from '../db/client.js';
import { actors, workspaces } from '../db/schema/core.js';

export interface SecondWorkspaceSeed {
  workspaceId: string;
  adminActorId: string;
  userActorId: string;
}

export async function seedSecondWorkspace(handle: DbHandle): Promise<SecondWorkspaceSeed> {
  const workspaceId = '22222222-2222-2222-2222-222222222222';
  const adminActorId = '22222222-aaaa-aaaa-aaaa-222222222222';
  const userActorId = '22222222-bbbb-bbbb-bbbb-222222222222';

  await handle.db.insert(workspaces).values({
    id: workspaceId,
    slug: 'workspace-two',
    name: 'Workspace Two',
  });

  await handle.db.insert(actors).values([
    {
      id: adminActorId,
      workspaceId,
      authProviderSubject: 'mock-admin-2',
      displayName: 'Mock Admin 2',
      email: 'mock-admin-2@example.com',
      roleLevel: 'admin',
      kind: 'human',
    },
    {
      id: userActorId,
      workspaceId,
      authProviderSubject: 'mock-user-2',
      displayName: 'Mock User 2',
      email: 'mock-user-2@example.com',
      roleLevel: 'user',
      kind: 'human',
    },
  ]);

  return { workspaceId, adminActorId, userActorId };
}
```

If actual column names differ (e.g. `authProviderSubject` vs `auth_provider_subject`), match `db/schema/core.ts` exactly — read it first if unsure.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @fops/backend typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/test-support/seed-second-workspace.ts
git commit -m "slice3-prologue: C1 seedSecondWorkspace test helper — enables tenant-isolation negative tests"
```

---

## Task 7 — Cross-workspace AA register negative test (H3)

**Files:**
- Test: `apps/backend/src/modules/analytics-areas/__tests__/cross-workspace.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDbContext } from '../../../test-support/test-db.js';
import { seedBaseline } from '../../../test-support/seed-baseline.js';
import { seedSecondWorkspace, type SecondWorkspaceSeed } from '../../../test-support/seed-second-workspace.js';
import { createAnalyticsAreaService } from '../analytics-area-service.js';

describe('AA register rejects parent MS from a different workspace (H3)', () => {
  let ctx: TestDbContext;
  let second: SecondWorkspaceSeed;

  beforeAll(async () => {
    ctx = await setupTestDb();
    await seedBaseline(ctx.handle);
    second = await seedSecondWorkspace(ctx.handle);
  });

  afterAll(async () => ctx.teardown());

  it('returns not_found.record when the parent MS lives in another workspace', async () => {
    const svc = createAnalyticsAreaService(ctx.deps);
    const wkTwoAdmin = {
      actor_id: second.adminActorId,
      workspace_id: second.workspaceId,
      role_level: 'admin' as const,
    };
    // ctx.tableauId is a MS in workspace one (the baseline).
    const body = { slug: 'cross-aa-1', name: 'Cross AA 1', managed_system_id: ctx.tableauId };

    await expect(svc.registerAnalyticsArea(wkTwoAdmin, body, {})).rejects.toMatchObject({
      statusCode: 404,
      code: 'not_found.record',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

If the current branch at `analytics-area-service.ts:249-251` is correct, this test may immediately PASS. That's still a meaningful gap closure (the branch was dead-coverage). If so, document this in the commit message and move on — the test pins behavior that was untested.

If the test FAILS (e.g. returns 201 with a foreign-workspace AA), the prior fix is incomplete: that is a security bug and must be repaired in this same task before commit.

Run: `pnpm --filter @fops/backend test src/modules/analytics-areas/__tests__/cross-workspace.integration.test.ts`
Expected: PASS on first run (branch exists), or FAIL → fix → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/analytics-areas/__tests__/cross-workspace.integration.test.ts
git commit -m "slice3-prologue: H3 pin cross-workspace AA register rejection (not_found.record)"
```

---

## Task 8 — Extract `cascadeArchiveActiveChildren` deps + rollback test (C4)

**Files:**
- Modify: `apps/backend/src/modules/analytics-areas/analytics-area-service.ts:167-199` (export already exists; refactor to inject the audit dependency rather than close over it)
- Modify: `apps/backend/src/modules/managed-systems/managed-system-service.ts:466` (call site)
- Test: `apps/backend/src/modules/analytics-areas/__tests__/cascade.rollback.unit.test.ts`

- [ ] **Step 1: Inspect the current export**

The function is already module-exported (per the explore map, line 167 starts with `export async function cascadeArchiveActiveChildren`). Confirm its full dependency list — it currently takes `tx`, `auditService`, `args`. If `archiveAnalyticsAreaInTx` is the only other collaborator it calls into, no further extraction is needed; the test can inject a throwing `auditService` stub directly.

- [ ] **Step 2: Write the failing unit test**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { cascadeArchiveActiveChildren } from '../analytics-area-service.js';

describe('cascadeArchiveActiveChildren rollback on audit failure (C4)', () => {
  it('propagates a thrown auditService error so the parent tx can rollback', async () => {
    // Build a minimal in-memory tx stub that returns one fake child row.
    const childId = '00000000-0000-0000-0000-0000000000aa';
    const fakeTx = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ id: childId }]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([{ id: childId }]),
          }),
        }),
      }),
    } as unknown as Parameters<typeof cascadeArchiveActiveChildren>[0];

    const throwingAudit = {
      append: vi.fn().mockRejectedValue(new Error('audit failure')),
    } as unknown as Parameters<typeof cascadeArchiveActiveChildren>[1];

    await expect(
      cascadeArchiveActiveChildren(fakeTx, throwingAudit, {
        workspaceId: 'w',
        actorId: 'a',
        managedSystemId: 'ms',
        now: new Date(),
      }),
    ).rejects.toThrow('audit failure');

    expect(throwingAudit.append).toHaveBeenCalled();
  });
});
```

If the helper's internal `archiveAnalyticsAreaInTx` does additional reads beyond the shape above, the test stub must satisfy them too — read the helper top-to-bottom before fixing the stub shape, do not guess.

- [ ] **Step 3: Run to verify**

Run: `pnpm --filter @fops/backend test src/modules/analytics-areas/__tests__/cascade.rollback.unit.test.ts`
Expected: PASS on first run if the helper already propagates exceptions (which is the most likely case — it `await`s without a try/catch). If it PASSES, the test is still load-bearing as a regression guard for ADR-0017:58 ("in the same transaction").

If it FAILS (helper swallows the audit error), that is the bug — fix the helper to `await` without swallowing, then re-run.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/analytics-areas/__tests__/cascade.rollback.unit.test.ts \
        apps/backend/src/modules/analytics-areas/analytics-area-service.ts
git commit -m "slice3-prologue: C4 pin cascadeArchiveActiveChildren rollback on audit failure"
```

(If step 3 required no service edit, the `analytics-area-service.ts` path drops from the `git add` line.)

---

## Task 9 — pg-boss purge handler retry coverage (H6)

**Files:**
- Test: `apps/backend/src/modules/core/jobs/__tests__/idempotency-purge.retry.integration.test.ts`

The handler at `apps/backend/src/modules/core/jobs/idempotency-purge.ts:53-92` is a thin pg-boss wrapper around `purgeExpiredIdempotencyKeys`. The realistic regression risk is that a thrown handler error is silently swallowed, defeating pg-boss's retry config. Unit-wrap the handler logic with a throwing `purgeExpiredIdempotencyKeys` stub and assert the error propagates.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { IDEMPOTENCY_PURGE_QUEUE } from '../idempotency-purge.js';

describe('idempotency-purge handler retry behavior (H6)', () => {
  it('propagates handler errors so pg-boss enqueues a retry', async () => {
    // The work-handler factory expects (jobs[]) — we synthesise a minimal job.
    // Import the inner handler if exported; otherwise refactor the module
    // to export it for testability (a one-line export change).
    const { __purgeHandler } = await import('../idempotency-purge.js'); // see step 2

    const failingDb = {
      execute: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as Parameters<typeof __purgeHandler>[0]['db'];

    await expect(
      __purgeHandler({ db: failingDb, log: { info: vi.fn() } })([
        { id: 'job-1', data: { correlation_id: 'test-1' } },
      ]),
    ).rejects.toThrow('db down');
  });
});
```

- [ ] **Step 2: Export the handler closure if not already exported**

Edit `apps/backend/src/modules/core/jobs/idempotency-purge.ts`. Extract the inner `async (jobs: ...) => {...}` callback into a named factory and export it as `__purgeHandler` (the double-underscore signals test-only surface). The existing `registerIdempotencyPurge` calls `boss.work(QUEUE, __purgeHandler(deps))` — semantics unchanged.

```typescript
export function __purgeHandler(deps: { db: Db; log?: { info: (msg: string, ctx: object) => void } }) {
  return async (jobs: Array<{ id: string; data: IdempotencyPurgePayload }>) => {
    for (const job of jobs) {
      const correlationId = job.data?.correlation_id ?? job.id;
      const { deleted } = await purgeExpiredIdempotencyKeys({ db: deps.db });
      deps.log?.info('core.idempotency_purge complete', {
        correlation_id: correlationId,
        deleted,
        job_id: job.id,
      });
    }
  };
}
```

Then in `registerIdempotencyPurge`: `await boss.work<IdempotencyPurgePayload>(IDEMPOTENCY_PURGE_QUEUE, __purgeHandler(deps));`

- [ ] **Step 3: Run the test to verify it fails then passes**

Run: `pnpm --filter @fops/backend test src/modules/core/jobs/__tests__/idempotency-purge.retry.integration.test.ts`
Expected: PASS — the handler does not catch, so the thrown error from `purgeExpiredIdempotencyKeys` (now stubbed via the failing `db.execute`) propagates. If it FAILS (a `try/catch` is silently swallowing), remove the swallow — that is the bug the test was designed to catch.

- [ ] **Step 4: Run the full suite**

Run: `pnpm --filter @fops/backend test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/core/jobs/idempotency-purge.ts \
        apps/backend/src/modules/core/jobs/__tests__/idempotency-purge.retry.integration.test.ts
git commit -m "slice3-prologue: H6 pin idempotency-purge handler error propagation (pg-boss retry contract)"
```

---

## Task 10 — Concurrent idempotency `record` race (M2)

**Files:**
- Test: `apps/backend/src/modules/core/idempotency/__tests__/idempotency-service.race.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

import { setupTestDb, type TestDbContext } from '../../../../test-support/test-db.js';
import { seedBaseline } from '../../../../test-support/seed-baseline.js';
import { createIdempotencyService } from '../idempotency-service.js';

describe('idempotencyService.record concurrent same-key (M2)', () => {
  let ctx: TestDbContext;
  let connA: pg.PoolClient;
  let connB: pg.PoolClient;

  beforeAll(async () => {
    ctx = await setupTestDb();
    await seedBaseline(ctx.handle);
    connA = await ctx.handle.pool.connect();
    connB = await ctx.handle.pool.connect();
  });

  afterAll(async () => {
    connA.release();
    connB.release();
    await ctx.teardown();
  });

  it('onConflictDoNothing collapses two concurrent inserts to a single row, no error', async () => {
    const svc = createIdempotencyService();
    const actorId = '11111111-aaaa-aaaa-aaaa-111111111111';
    const key = 'race-m2';
    const hash = 'hash-1';

    await connA.query('BEGIN');
    await connB.query('BEGIN');

    const dbA = drizzle(connA as unknown as pg.Pool);
    const dbB = drizzle(connB as unknown as pg.Pool);

    await Promise.all([
      svc.record(dbA as any, actorId, key, hash, 201, { winner: 'A' }),
      svc.record(dbB as any, actorId, key, hash, 201, { winner: 'B' }),
    ]);

    await connA.query('COMMIT');
    await connB.query('COMMIT');

    const rows = await ctx.handle.db.execute(
      `SELECT count(*)::int AS n FROM core.idempotency_keys WHERE actor_id = $1 AND key = $2`,
      [actorId, key],
    );
    expect((rows as { rows: Array<{ n: number }> }).rows[0].n).toBe(1);
  });
});
```

The exact `drizzle()` wrapping over a `PoolClient` may need a small helper if the codebase already has one for tests; mirror existing patterns rather than fighting types. The behavioural assertion (count = 1, no thrown error) is what matters.

- [ ] **Step 2: Run to verify**

Run: `pnpm --filter @fops/backend test src/modules/core/idempotency/__tests__/idempotency-service.race.integration.test.ts`
Expected: PASS — the existing `onConflictDoNothing` is exactly the documented mitigation. The test pins it; if it FAILS, it means the conflict target or `DO NOTHING` was changed and the contract regressed.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/core/idempotency/__tests__/idempotency-service.race.integration.test.ts
git commit -m "slice3-prologue: M2 pin concurrent idempotency record race — onConflictDoNothing contract"
```

---

## Task 11 — Final verification + checklist update

**Files:**
- Modify: `.review/USER-VERIFICATION-CHECKLIST.md` (mark resolved items)

- [ ] **Step 1: Run the full backend + frontend suites + typecheck + boundaries**

```bash
pnpm --filter @fops/backend typecheck
pnpm --filter @fops/backend check:boundaries
pnpm --filter @fops/backend test
pnpm --filter @fops/frontend test
```

Expected: typecheck green, boundaries clean, backend ≥154 passing (147 baseline + 7 new tests across tasks 2/3/4/7/8/9/10 — confirm count matches; if off, investigate before declaring done), frontend 32 passing (unchanged).

- [ ] **Step 2: Run the migration set against a clean DB to confirm no regression**

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
export DATABASE_URL="postgres://fops_app:fops_app@localhost:5434/feedbackops"
export DATABASE_URL_MIGRATE="postgres://fops_migrate:fops_migrate@localhost:5434/feedbackops"
pnpm --filter @fops/backend db:migrate
pnpm --filter @fops/backend db:seed
```

Expected: clean migrate + seed.

- [ ] **Step 3: Update the checklist**

Edit `.review/USER-VERIFICATION-CHECKLIST.md`. In §1.2, add a "Resolved 2026-05-17 (Slice 3 prologue)" column or a footer note listing the commits per ID (S-001, S-002, S-006, HTTP L-1). In §1.3, mark S-008 as resolved. In §1.4, mark C1, H3, C4, H6, M2 as resolved. Do not delete the original analysis — append, do not rewrite.

- [ ] **Step 4: Commit**

```bash
git add .review/USER-VERIFICATION-CHECKLIST.md
git commit -m "slice3-prologue: checklist update — mark S-001/S-002/S-006/S-008/HTTP-L-1/C1/H3/C4/H6/M2 resolved"
```

- [ ] **Step 5: Report to user**

Summarise to the user (in Korean, caveman tone) which commits landed and which items remain on the checklist (none from §1.2/1.3/1.4 should remain except the explicitly-scoped-out 1.5 polish items). Do **not** push, do **not** close issues, do **not** open a PR — wait for explicit user instruction per the orchestration rule.

---

## Out of scope (explicit non-goals)

- §1.5 polish items (HTTP M-2, L-2, L-3, S-007, S-009, S-010, DB-007, C3 extension, M1, M3, M4/M5, M6, M7, M8, L4, L5) — skipped as low-value-per-byte. Re-evaluate if Slice 3 product surface lands on top of any of these.
- New ADRs beyond the ADR-0015 narrative amendment. None of the work in this plan changes a locked decision.
- Any UI / design-token change. Waiting on the design HTML per the standing rule.
- `git push`, `gh issue close`, `gh pr create`. Reserved for explicit user instruction.

## Self-Review

**Spec coverage:** §1.2 S-001 → T3; S-002 → T2; S-006 → T1; HTTP L-1 → T5. §1.3 S-008 → T4. §1.4 C1 → T6; C4 → T8; H3 → T7; H6 → T9; M2 → T10. ADR-0015 narrative → T3 step 8. Final verification + checklist update → T11. No spec line dropped.

**Placeholder scan:** No "TBD", "later", "appropriate error handling", or unspecified test bodies. Every code step shows the code; every test step shows the assertions.

**Type consistency:** `Tx` is defined in T1 step 1 and used identically in every subsequent task (T2 `tx: Tx`, T3 `tx.execute(sql\`...\`)` on the same handle, etc.). `SessionRecord.roleLevel` (T5 step 2) is the camelCase service-side field; the `req.session.role_level` snake_case is the HTTP-side augmentation — different layers, intentional, both spelled consistently across T5.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-slice3-prologue.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Best for the type-foundation task (T1) which touches 5 files and 24 cast sites.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
