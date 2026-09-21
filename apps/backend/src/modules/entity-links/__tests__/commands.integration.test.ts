// Entity Links application seam (#391) — createEntityLink, findActiveEntityLink,
// detachEntityLink — exercised inside db.transaction directly (not via HTTP).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The migrate role is
// required because core.entity_links is append-only to fops_app. Domain rows
// are written inside a rolled-back transaction, so only seed rows (MS, actor)
// need cleanup.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import { insertDevActor, insertMsDirectly, uid } from '../../voc/__tests__/_seed-helpers.js';
import { createEntityLink, detachEntityLink, findActiveEntityLink } from '../commands.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-el-cmd';
const ACTOR_SUFFIX = 'elcmd';

class Rollback extends Error {}

describe.skipIf(!runIntegration)('entity-links command seam (#391)', () => {
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
      `delete from core.entity_links
        where workspace_id = $1
          and managed_system_id in (
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

  async function inRolledBackTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
    await expect(
      dbHandle.db.transaction(async (tx) => {
        await fn(tx);
        throw new Rollback('rollback');
      }),
    ).rejects.toThrow(Rollback);
  }

  it('create/find/detach round trip; detached link is no longer active', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Seam MS');
    const sourceId = randomUUID();
    const targetId = randomUUID();

    await inRolledBackTx(async (tx) => {
      const input = {
        workspaceId: WORKSPACE_ID,
        sourceType: 'voc_cluster' as const,
        sourceId,
        targetType: 'finding' as const,
        targetId,
        relationType: 'evidence_of' as const,
        managedSystemId: msId,
        createdBy: actorId,
        visibility: 'internal_only' as const,
      };

      const created = await createEntityLink(tx, input);
      expect(created.inserted).toBe(true);

      const duplicate = await createEntityLink(tx, input);
      expect(duplicate.inserted).toBe(false);
      expect(duplicate.row.id).toBe(created.row.id);

      const found = await findActiveEntityLink(tx, input);
      expect(found?.id).toBe(created.row.id);

      const detached = await detachEntityLink(tx, {
        workspaceId: WORKSPACE_ID,
        linkId: created.row.id,
        actorId,
        reason: 'seam test detach',
      });
      expect(detached?.status).toBe('detached');

      expect(await findActiveEntityLink(tx, input)).toBeNull();

      // The partial unique index only covers active links, so re-creating
      // after detach yields a fresh active row.
      const recreated = await createEntityLink(tx, input);
      expect(recreated.inserted).toBe(true);
      expect(recreated.row.id).not.toBe(created.row.id);
    });

    const persisted = await dbHandle.pool.query<{ count: string }>(
      `select count(*)::text as count
         from core.entity_links
        where workspace_id = $1 and source_id = $2::uuid`,
      [WORKSPACE_ID, sourceId],
    );
    expect(persisted.rows[0]?.count).toBe('0');
  });
});
