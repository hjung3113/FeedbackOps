import { lockRecoveryCommand } from '../../../db/recovery-command-lock.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
// Task Requests application seam (#391) — lockTaskRequestForUpdate and
// markTaskRequestConverted — exercised inside db.transaction directly (not
// via HTTP).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The migrate role
// is required for fixture cleanup.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sql } from 'drizzle-orm';
import { type DbHandle, createDb } from '../../../db/client.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { recoveryIdentity } from '../../dashboard/identity.js';
import { createOwnerRecoveryRecorder } from '../../dashboard/truth.js';
import { createEntityLink } from '../../entity-links/commands.js';
import { lockTaskRequestForUpdate, markTaskRequestConverted } from '../commands.js';
import { insertTaskRequestRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-tr-cmd';
const ACTOR_SUFFIX = 'trcmd';

describe.skipIf(!runIntegration)('task-requests command seam (#391)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let actorId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    await cleanupFixtures();
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, ACTOR_SUFFIX);
    actorId = actor.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    // FK-safe order: children before parents.
    await migrateHandle.pool.query(
      `DELETE FROM core.entity_links WHERE workspace_id=$1::uuid AND managed_system_id IN (SELECT id FROM core.managed_systems WHERE workspace_id=$1::uuid AND slug LIKE $2::text)`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `DELETE FROM finding.findings WHERE workspace_id=$1::uuid AND primary_managed_system_id IN (SELECT id FROM core.managed_systems WHERE workspace_id=$1::uuid AND slug LIKE $2::text)`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task_request.task_requests
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await deleteRecoveryFixtureParents(
      migrateHandle,
      `delete from core.managed_systems where workspace_id = $1 and slug like $2`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.actors where workspace_id = $1 and external_id like $2`,
      [WORKSPACE_ID, `mock-dev-read-${ACTOR_SUFFIX}%`],
    );
  }

  it('does not reopen a Finding solely because a linked Task Request changes status', async () => {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Requested execution MS',
    );
    const finding = await insertFindingRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      sourceId: randomUUID(),
      status: 'active',
      createdBy: actorId,
    });
    const request = await insertTaskRequestRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      sourceId: finding.id,
      requesterActorId: actorId,
      status: 'approved',
      decided: true,
    });
    const token = recoveryIdentity('actionable-finding-no-execution', finding.id);
    const recorder = createOwnerRecoveryRecorder();
    await expect(
      dbHandle.db.transaction(async (tx) => {
        await lockRecoveryCommand(tx, WORKSPACE_ID);
        const captured = await recorder.capture(tx, WORKSPACE_ID, [
          { type: 'finding', id: finding.id },
        ]);
        await createEntityLink(tx, {
          workspaceId: WORKSPACE_ID,
          sourceType: 'finding',
          sourceId: finding.id,
          targetType: 'task_request',
          targetId: request.id,
          relationType: 'requested_task',
          managedSystemId: msId,
          createdBy: actorId,
          visibility: 'internal_only',
        });
        await recorder.finish(tx, captured, actorId, 'createFromFinding');
        const beforeStatus = await recorder.capture(tx, WORKSPACE_ID, [
          { type: 'task_request', id: request.id },
        ]);
        await markTaskRequestConverted(tx, {
          workspaceId: WORKSPACE_ID,
          taskRequestId: request.id,
        });
        await recorder.finish(tx, beforeStatus, actorId, 'markTaskRequestConverted');
        expect(
          (
            await tx.execute(
              sql`SELECT occurrence,state FROM dashboard.recovery_identities WHERE workspace_id=${WORKSPACE_ID}::uuid AND recovery_item_id=${token}`,
            )
          ).rows,
        ).toEqual([{ occurrence: 1, state: 'resolved' }]);
        expect(
          (
            await tx.execute(
              sql`SELECT occurrence FROM dashboard.recovery_history WHERE workspace_id=${WORKSPACE_ID}::uuid AND recovery_item_id=${token}`,
            )
          ).rows,
        ).toEqual([{ occurrence: 1 }]);
        throw new Error('recovery rollback');
      }),
    ).rejects.toThrow('recovery rollback');
    expect(
      (
        await dbHandle.pool.query(
          'SELECT occurrence FROM dashboard.recovery_history WHERE workspace_id=$1::uuid AND recovery_item_id=$2',
          [WORKSPACE_ID, token],
        )
      ).rows,
    ).toEqual([]);
  });

  async function seedTaskRequest(): Promise<{ id: string }> {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Seam MS');
    const row = await insertTaskRequestRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      sourceId: randomUUID(),
      primaryManagedSystemId: msId,
      requesterActorId: actorId,
      status: 'approved',
      decided: true,
    });
    return { id: row.id };
  }

  interface RequestState {
    status: string;
    updated_at: string;
  }

  async function readStates(ids: string[]): Promise<Record<string, RequestState>> {
    const res = await dbHandle.pool.query<{ id: string; status: string; updated_at: string }>(
      `select id::text, status, updated_at::text
         from task_request.task_requests
        where id = any($1::uuid[])`,
      [ids],
    );
    const states: Record<string, RequestState> = {};
    for (const row of res.rows) {
      states[row.id] = { status: row.status, updated_at: row.updated_at };
    }
    return states;
  }

  it('lockTaskRequestForUpdate returns the row and null for a missing id', async () => {
    const seeded = await seedTaskRequest();

    await dbHandle.db.transaction(async (tx) => {
      const locked = await lockTaskRequestForUpdate(tx, {
        workspaceId: WORKSPACE_ID,
        taskRequestId: seeded.id,
      });
      expect(locked?.id).toBe(seeded.id);
      expect(locked?.status).toBe('approved');

      const missing = await lockTaskRequestForUpdate(tx, {
        workspaceId: WORKSPACE_ID,
        taskRequestId: randomUUID(),
      });
      expect(missing).toBeNull();
    });
  });

  it('markTaskRequestConverted flips status for the owning workspace only', async () => {
    const right = await seedTaskRequest();
    const other = await seedTaskRequest();
    const ids = [right.id, other.id];

    const before = await readStates(ids);
    expect(before[right.id]?.status).toBe('approved');
    expect(before[other.id]?.status).toBe('approved');

    await dbHandle.db.transaction(async (tx) => {
      await markTaskRequestConverted(tx, {
        workspaceId: WORKSPACE_ID,
        taskRequestId: right.id,
      });
    });

    const afterRight = await readStates(ids);
    expect(afterRight[right.id]?.status).toBe('converted');
    expect(afterRight[right.id]?.updated_at).not.toBe(before[right.id]?.updated_at);
    expect(afterRight[other.id]?.status).toBe('approved');
    expect(afterRight[other.id]?.updated_at).toBe(before[other.id]?.updated_at);

    // A different workspace id must not touch the row.
    await dbHandle.db.transaction(async (tx) => {
      await markTaskRequestConverted(tx, {
        workspaceId: randomUUID(),
        taskRequestId: other.id,
      });
    });

    const afterOther = await readStates(ids);
    expect(afterOther[other.id]?.status).toBe('approved');
    expect(afterOther[other.id]?.updated_at).toBe(before[other.id]?.updated_at);
  });
});
