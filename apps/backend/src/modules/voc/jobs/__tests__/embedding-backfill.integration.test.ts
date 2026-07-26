// #168 step 3 — cron backfill (ADR-0034 D6) against the real corpus query.
//
// pg-boss is stubbed with a send-recorder: what matters here is *which* VOCs
// are selected and *how many* are enqueued, not that pg-boss can insert a row
// (migration 0043 + the boot test cover that).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PgBoss } from 'pg-boss';

import { type DbHandle, createDb } from '../../../../db/client.js';
import { createFakeEmbeddingProvider } from '../../embedding/fake.js';
import { insertMsDirectly, insertVocDirectly, uid } from '../../__tests__/_seed-helpers.js';
import { embedVoc } from '../embed-voc.js';
import {
  VOC_EMBEDDING_BACKFILL_BATCH_SIZE,
  backfillVocEmbeddings,
} from '../embedding-backfill.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-embed-backfill';
const ACTIVE_VERSION = 1;

interface SentJob {
  queue: string;
  data: { voc_id: string; workspace_id: string };
}

function recordingBoss(): { boss: PgBoss; sent: SentJob[] } {
  const sent: SentJob[] = [];
  const boss = {
    async send(queue: string, data: SentJob['data']) {
      sent.push({ queue, data });
      return 'job-id';
    },
  } as unknown as PgBoss;
  return { boss, sent };
}

describe.skipIf(!runIntegration)('voc.embedding_backfill (#168)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let actorId: string;
  let msId: string;

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    const actors = await appHandle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    actorId = actors.rows[0]?.id ?? '';
    if (!actorId) throw new Error('seed admin actor not found');
  });

  beforeEach(async () => {
    await cleanup();
    msId = await insertMsDirectly(appHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Backfill target');
  });

  afterAll(async () => {
    await cleanup();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  // Children before parents: voc_embeddings → vocs → managed_systems.
  async function cleanup(): Promise<void> {
    if (!migrateHandle) return;
    const scope = `(select id from core.managed_systems where workspace_id = $1 and slug like $2)`;
    await migrateHandle.pool.query(
      `delete from voc.voc_embeddings where voc_id in (
         select id from voc.vocs where workspace_id = $1 and primary_managed_system_id in ${scope}
       )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from voc.vocs where workspace_id = $1 and primary_managed_system_id in ${scope}`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.managed_systems where workspace_id = $1 and slug like $2`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
  }

  async function seedVocs(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const voc = await insertVocDirectly(appHandle, WORKSPACE_ID, msId, actorId, `Backfill ${i}`);
      ids.push(voc.id);
    }
    return ids;
  }

  /** Restrict assertions to this test's VOCs — the dev DB is shared. */
  function ours(sent: SentJob[], ids: string[]): SentJob[] {
    return sent.filter((job) => ids.includes(job.data.voc_id));
  }

  it('enqueues VOCs that have no row at the active version', async () => {
    const ids = await seedVocs(3);
    const { boss, sent } = recordingBoss();

    const result = await backfillVocEmbeddings(
      {
        db: appHandle.db,
        boss,
        embeddingVersion: ACTIVE_VERSION,
        embeddingEnabled: true,
      },
      { correlation_id: 'test' },
    );

    expect(result.skipped).toBe(false);
    const mine = ours(sent, ids);
    expect(mine.map((job) => job.data.voc_id).sort()).toEqual([...ids].sort());
    expect(new Set(mine.map((job) => job.queue))).toEqual(new Set(['voc.embed_voc']));
    expect(mine[0]?.data.workspace_id).toBe(WORKSPACE_ID);
  });

  it('skips VOCs already embedded at the active version', async () => {
    const ids = await seedVocs(2);
    const embedded = ids[0] as string;
    await embedVoc(
      {
        db: appHandle.db,
        provider: createFakeEmbeddingProvider({ dimensions: 8, embeddingVersion: ACTIVE_VERSION }),
        embeddingVersion: ACTIVE_VERSION,
        embeddingEnabled: true,
      },
      { workspace_id: WORKSPACE_ID, voc_id: embedded, correlation_id: 'test' },
    );

    const { boss, sent } = recordingBoss();
    await backfillVocEmbeddings(
      { db: appHandle.db, boss, embeddingVersion: ACTIVE_VERSION, embeddingEnabled: true },
      { correlation_id: 'test' },
    );

    expect(ours(sent, ids).map((job) => job.data.voc_id)).toEqual([ids[1]]);
  });

  it('re-enqueues everything after an embedding-version bump (ADR-0034 D2)', async () => {
    const ids = await seedVocs(2);
    for (const id of ids) {
      await embedVoc(
        {
          db: appHandle.db,
          provider: createFakeEmbeddingProvider({
            dimensions: 8,
            embeddingVersion: ACTIVE_VERSION,
          }),
          embeddingVersion: ACTIVE_VERSION,
          embeddingEnabled: true,
        },
        { workspace_id: WORKSPACE_ID, voc_id: id, correlation_id: 'test' },
      );
    }

    const { boss, sent } = recordingBoss();
    await backfillVocEmbeddings(
      { db: appHandle.db, boss, embeddingVersion: 2, embeddingEnabled: true },
      { correlation_id: 'test' },
    );

    expect(ours(sent, ids).map((job) => job.data.voc_id).sort()).toEqual([...ids].sort());
  });

  it('bounds the batch and reports what it left for the next run', async () => {
    const ids = await seedVocs(3);
    const { boss, sent } = recordingBoss();

    const result = await backfillVocEmbeddings(
      {
        db: appHandle.db,
        boss,
        embeddingVersion: ACTIVE_VERSION,
        embeddingEnabled: true,
        batchSize: 2,
      },
      { correlation_id: 'test' },
    );

    expect(result.enqueued).toBe(2);
    // Bounded, not truncated: the surplus is reported, not dropped. `remaining`
    // counts every outstanding VOC in the workspace, so assert the floor our
    // own three seeded rows guarantee.
    expect(result.remaining).toBeGreaterThanOrEqual(1);
    expect(ours(sent, ids).length).toBeLessThanOrEqual(2);
  });

  it('excludes archived VOCs', async () => {
    const ids = await seedVocs(2);
    await appHandle.pool.query(`update voc.vocs set archived_at = now() where id = $1`, [ids[0]]);

    const { boss, sent } = recordingBoss();
    await backfillVocEmbeddings(
      { db: appHandle.db, boss, embeddingVersion: ACTIVE_VERSION, embeddingEnabled: true },
      { correlation_id: 'test' },
    );

    expect(ours(sent, ids).map((job) => job.data.voc_id)).toEqual([ids[1]]);
  });

  it('enqueues nothing when the provider is disabled (ADR-0034 D2)', async () => {
    const ids = await seedVocs(2);
    const { boss, sent } = recordingBoss();

    const result = await backfillVocEmbeddings(
      { db: appHandle.db, boss, embeddingVersion: ACTIVE_VERSION, embeddingEnabled: false },
      { correlation_id: 'test' },
    );

    expect(result).toEqual({ enqueued: 0, remaining: 0, skipped: true });
    expect(ours(sent, ids)).toEqual([]);
  });

  it('ships a bounded default batch size', () => {
    expect(VOC_EMBEDDING_BACKFILL_BATCH_SIZE).toBe(200);
  });
});
