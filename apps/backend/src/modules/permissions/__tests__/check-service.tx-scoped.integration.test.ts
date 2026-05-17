// Tx-scoped checkCapability integration test (S-002, Slice 3 prologue Task 2).
//
// Asserts that `checkCapability(..., { tx })` observes uncommitted writes
// made within the same transaction, while a concurrent `deps.db`-bound
// check does NOT. Confirms ADR-0019 Section D step 5 / S-002 invariant:
// every SELECT inside checkCapability runs on the supplied tx handle.
//
// Mirrors the skip-pattern + actor-lookup conventions of
// check-service.test.ts and check-route.integration.test.ts.

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { actors } from '../../../db/schema/core.js';
import { permissionGrants } from '../../../db/schema/permission.js';
import { type ActorContext, createCheckService } from '../check-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('checkService.checkCapability tx-scoped read (S-002)', () => {
  let handle: DbHandle;
  let svc: ReturnType<typeof createCheckService>;
  let adminActor: ActorContext;
  // Temp `user`-role actor — role 'user' does NOT satisfy 'workspace.admin'
  // via role, so a grant is required to flip deny → allow.
  let tempActorId: string;
  const tempExternalId = `test-permcheck-tx-${randomUUID()}`;

  beforeAll(async () => {
    handle = createDb(APP_URL);
    svc = createCheckService({ db: handle.db });

    const adminRows = await handle.db
      .select({ id: actors.id, roleLevel: actors.roleLevel })
      .from(actors)
      .where(and(eq(actors.workspaceId, WORKSPACE_ID), eq(actors.externalId, 'mock-admin-1')))
      .limit(1);
    const admin = adminRows[0];
    if (!admin) {
      throw new Error('Seed missing: run `pnpm --filter @fops/backend db:seed`.');
    }
    adminActor = {
      actor_id: admin.id,
      workspace_id: WORKSPACE_ID,
      role_level: admin.roleLevel,
    };

    const inserted = await handle.db
      .insert(actors)
      .values({
        workspaceId: WORKSPACE_ID,
        externalId: tempExternalId,
        email: `${tempExternalId}@feedbackops.local`,
        displayName: 'Permcheck Tx Test User',
        roleLevel: 'user',
        actorType: 'internal_member',
      })
      .returning({ id: actors.id });
    const row = inserted[0];
    if (!row) throw new Error('failed to insert temp actor');
    tempActorId = row.id;
  });

  afterEach(async () => {
    await handle.pool.query('delete from permission.permission_grants where actor_id = $1', [
      tempActorId,
    ]);
  });

  afterAll(async () => {
    await handle.pool.query('delete from permission.permission_grants where actor_id = $1', [
      tempActorId,
    ]);
    await handle.pool.query('delete from core.actors where id = $1', [tempActorId]);
    await handle?.close();
  });

  it('observes a workspace-wide grant written inside the same transaction', async () => {
    const userActor: ActorContext = {
      actor_id: tempActorId,
      workspace_id: WORKSPACE_ID,
      role_level: 'user',
    };
    const capability = 'workspace.admin' as const;
    const scope = { workspace_id: WORKSPACE_ID };

    const before = await svc.checkCapability(userActor, capability, scope);
    expect(before.allow).toBe(false);

    await handle.db
      .transaction(async (tx) => {
        await tx.insert(permissionGrants).values({
          workspaceId: WORKSPACE_ID,
          actorId: tempActorId,
          capability,
          grantedByActorId: adminActor.actor_id,
        });

        const inTx = await svc.checkCapability(userActor, capability, scope, { tx });
        expect(inTx.allow).toBe(true);
        if (inTx.allow === true) {
          expect(inTx.via).toBe('direct_grant');
        }

        const offTx = await svc.checkCapability(userActor, capability, scope);
        expect(offTx.allow).toBe(false);

        throw new Error('intentional rollback');
      })
      .catch((err: unknown) => {
        if ((err as Error).message !== 'intentional rollback') throw err;
      });

    const after = await svc.checkCapability(userActor, capability, scope);
    expect(after.allow).toBe(false);
  });
});
