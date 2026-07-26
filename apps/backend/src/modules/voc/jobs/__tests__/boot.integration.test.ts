// #168 step 3 — VOC job boot wiring. Mirrors
// modules/core/jobs/__tests__/boot.integration.test.ts: the "is this real?"
// check is that the backfill cron actually lands in pgboss.schedule and that
// both queues were pre-created by migration 0043 with ADR-0009 retry config.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import { initBoss, shutdownBoss } from '../../../../lib/jobs.js';
import { createFakeEmbeddingProvider } from '../../embedding/fake.js';
import { registerVocJobs } from '../index.js';
import { VOC_EMBED_QUEUE } from '../embed-voc.js';
import {
  VOC_EMBEDDING_BACKFILL_CRON,
  VOC_EMBEDDING_BACKFILL_QUEUE,
} from '../embedding-backfill.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('VOC embedding job boot wiring (#168)', () => {
  let dbHandle: DbHandle;
  let boss: Awaited<ReturnType<typeof initBoss>>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    boss = await initBoss({ connectionString: APP_URL });
    // pgboss.schedule is durable shared state: a row left by an earlier run
    // would make this suite pass even if registration stopped scheduling
    // anything. Clear it first so the assertion is about *this* boot.
    await boss.unschedule(VOC_EMBEDDING_BACKFILL_QUEUE).catch(() => {});
    await registerVocJobs(boss, {
      db: dbHandle.db,
      provider: createFakeEmbeddingProvider({ dimensions: 8, embeddingVersion: 1 }),
      embeddingVersion: 1,
      // Registration must not depend on the provider being enabled: enabling a
      // provider is a config change, never a queue-registration change.
      embeddingEnabled: false,
    });
  });

  afterAll(async () => {
    await shutdownBoss(boss).catch(() => {});
    await dbHandle?.close();
  });

  it('registers the backfill cron in pgboss.schedule', async () => {
    const schedules = await boss.getSchedules(VOC_EMBEDDING_BACKFILL_QUEUE);
    const ours = schedules.find(
      (s: { name: string }) => s.name === VOC_EMBEDDING_BACKFILL_QUEUE,
    );
    expect(ours).toBeDefined();
    expect(ours?.cron).toBe(VOC_EMBEDDING_BACKFILL_CRON);
  });

  for (const queue of [VOC_EMBED_QUEUE, VOC_EMBEDDING_BACKFILL_QUEUE]) {
    it(`records ${queue} in pgboss.queue with ADR-0009 retry config`, async () => {
      const row = await dbHandle.pool.query<{
        retry_limit: number;
        retry_delay: number;
        retry_backoff: boolean;
      }>(
        `select retry_limit, retry_delay, retry_backoff from pgboss.queue where name = $1`,
        [queue],
      );
      expect(row.rowCount).toBe(1);
      expect(row.rows[0]?.retry_limit).toBe(5);
      expect(row.rows[0]?.retry_delay).toBe(30);
      expect(row.rows[0]?.retry_backoff).toBe(true);
    });
  }
});
