// Task Requests application seam (#391) — lockTaskRequestForUpdate and
// markTaskRequestConverted — exercised inside db.transaction directly (not
// via HTTP).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The migrate role
// is required for fixture cleanup.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { insertDevActor, insertMsDirectly, uid } from '../../voc/__tests__/_seed-helpers.js';
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
      `delete from task_request.task_requests
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.managed_systems where workspace_id = $1 and slug like $2`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.actors where workspace_id = $1 and external_id like $2`,
      [WORKSPACE_ID, `mock-dev-read-${ACTOR_SUFFIX}%`],
    );
  }

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
