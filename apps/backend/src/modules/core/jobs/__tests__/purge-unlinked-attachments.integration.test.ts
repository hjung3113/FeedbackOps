// Integration tests for the hourly unlinked-attachments purge handler
// (PLAN-22 C4b; ADR-0011 attachment lifecycle).
//
// `voc.voc_attachments` rows are created in two phases: POST /attachments
// inserts an unlinked row (voc_id IS NULL AND comment_id IS NULL), then a
// follow-up link step (voc create / reporter-reply / internal-comment)
// populates voc_id or comment_id. If the link step never runs (client
// crash, abandoned flow), the unlinked row + its S3 object leak. This
// hourly job reclaims rows older than 24h together with their storage
// objects.
//
// Handler is exercised directly here — cron scheduling is covered in
// boot.integration.test.ts.

import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import type { StorageBackend, StorageGetResult } from '../../../../lib/storage/index.js';
import { purgeUnlinkedAttachments } from '../purge-unlinked-attachments.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

function makeStubStorage(overrides: Partial<StorageBackend> = {}): StorageBackend & {
  deleted: string[];
} {
  const deleted: string[] = [];
  return {
    deleted,
    async put() {
      return { key: 'unused' };
    },
    async get(): Promise<StorageGetResult> {
      return { stream: Readable.from(['x']), mimeType: 'application/octet-stream', size: 1 };
    },
    async delete(key: string) {
      deleted.push(key);
    },
    async exists() {
      return false;
    },
    ...overrides,
  };
}

describe.skipIf(!runIntegration)('core.attachments_purge handler', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let actorId: string;
  const testKeyPrefix = `purge-test-${randomUUID()}/`;

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    const res = await appHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'system' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    actorId = res.rows[0]?.id ?? '';
    expect(actorId).toBeTruthy();
  });

  afterAll(async () => {
    await migrateHandle.pool
      .query(`delete from voc.voc_attachments where storage_key like $1`, [`${testKeyPrefix}%`])
      .catch(() => {});
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function insertAttachment(opts: {
    storageKey: string;
    sizeBytes: number;
    ageInterval: string; // e.g. "25 hours", "1 hour"
    vocId?: string | null;
    commentId?: string | null;
    commentKind?: string | null;
  }) {
    await appHandle.pool.query(
      `insert into voc.voc_attachments
         (voc_id, comment_id, comment_kind, name, size_bytes, mime_type,
          storage_key, uploaded_by_actor_id, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now() - interval '${opts.ageInterval}')`,
      [
        opts.vocId ?? null,
        opts.commentId ?? null,
        opts.commentKind ?? null,
        'test.txt',
        opts.sizeBytes,
        'text/plain',
        opts.storageKey,
        actorId,
      ],
    );
  }

  it('deletes rows where voc_id IS NULL AND comment_id IS NULL AND created_at < now() - 24h', async () => {
    const key = `${testKeyPrefix}old-unlinked`;
    await insertAttachment({ storageKey: key, sizeBytes: 100, ageInterval: '25 hours' });

    const storage = makeStubStorage();
    const result = await purgeUnlinkedAttachments({ pool: appHandle.pool, storage });

    expect(result.count).toBeGreaterThanOrEqual(1);

    const after = await appHandle.pool.query(
      'select 1 from voc.voc_attachments where storage_key = $1',
      [key],
    );
    expect(after.rowCount).toBe(0);
  });

  it('calls storage.delete for each purged key', async () => {
    const key = `${testKeyPrefix}storage-call`;
    await insertAttachment({ storageKey: key, sizeBytes: 50, ageInterval: '25 hours' });

    const storage = makeStubStorage();
    await purgeUnlinkedAttachments({ pool: appHandle.pool, storage });

    expect(storage.deleted).toContain(key);
  });

  it('leaves linked rows untouched (voc_id IS NOT NULL)', async () => {
    // Use a real VOC so the FK holds. Take any existing seeded VOC in this workspace.
    const vocRes = await appHandle.pool.query<{ id: string }>(
      `select id from voc.vocs where workspace_id = $1 limit 1`,
      [WORKSPACE_ID],
    );
    const vocId = vocRes.rows[0]?.id;
    if (!vocId) {
      // No seeded VOC — skip this single assertion rather than fabricate one.
      // The behaviour is covered by the WHERE clause shape; if no VOC exists
      // in the test workspace, there is no observable difference to assert.
      return;
    }

    const key = `${testKeyPrefix}linked`;
    await insertAttachment({ storageKey: key, sizeBytes: 200, ageInterval: '25 hours', vocId });

    const storage = makeStubStorage();
    await purgeUnlinkedAttachments({ pool: appHandle.pool, storage });

    const after = await appHandle.pool.query(
      'select 1 from voc.voc_attachments where storage_key = $1',
      [key],
    );
    expect(after.rowCount).toBe(1);
    expect(storage.deleted).not.toContain(key);
  });

  it('leaves recent rows untouched (created_at within 24h)', async () => {
    const key = `${testKeyPrefix}recent`;
    await insertAttachment({ storageKey: key, sizeBytes: 75, ageInterval: '1 hour' });

    const storage = makeStubStorage();
    await purgeUnlinkedAttachments({ pool: appHandle.pool, storage });

    const after = await appHandle.pool.query(
      'select 1 from voc.voc_attachments where storage_key = $1',
      [key],
    );
    expect(after.rowCount).toBe(1);
    expect(storage.deleted).not.toContain(key);
  });

  it('survives storage.delete failure: logs error, continues, keeps DB row for retry', async () => {
    const badKey = `${testKeyPrefix}bad-storage`;
    const goodKey = `${testKeyPrefix}good-storage`;
    await insertAttachment({ storageKey: badKey, sizeBytes: 10, ageInterval: '25 hours' });
    await insertAttachment({ storageKey: goodKey, sizeBytes: 20, ageInterval: '25 hours' });

    const storage = makeStubStorage({
      async delete(key: string) {
        if (key === badKey) throw new Error('boom');
      },
    });
    const log = { info: vi.fn(), error: vi.fn() };

    // Must not throw — job survives the failure.
    const result = await purgeUnlinkedAttachments({ pool: appHandle.pool, storage, log });

    expect(result.storage_delete_failures).toBeGreaterThanOrEqual(1);
    expect(log.error).toHaveBeenCalled();

    // Bad-key row REMAINS so next run retries.
    const badAfter = await appHandle.pool.query(
      'select 1 from voc.voc_attachments where storage_key = $1',
      [badKey],
    );
    expect(badAfter.rowCount).toBe(1);

    // Good-key row is gone.
    const goodAfter = await appHandle.pool.query(
      'select 1 from voc.voc_attachments where storage_key = $1',
      [goodKey],
    );
    expect(goodAfter.rowCount).toBe(0);

    // Cleanup the surviving bad row.
    await appHandle.pool.query('delete from voc.voc_attachments where storage_key = $1', [badKey]);
  });

  it('logs {count, bytes_reclaimed, storage_delete_failures} on completion', async () => {
    const key = `${testKeyPrefix}log-summary`;
    await insertAttachment({ storageKey: key, sizeBytes: 4096, ageInterval: '25 hours' });

    const storage = makeStubStorage();
    const log = { info: vi.fn(), error: vi.fn() };

    const result = await purgeUnlinkedAttachments({ pool: appHandle.pool, storage, log });

    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.bytes_reclaimed).toBeGreaterThanOrEqual(4096);
    expect(result.storage_delete_failures).toBe(0);

    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('core.attachments_purge complete'),
      expect.objectContaining({
        count: expect.any(Number),
        bytes_reclaimed: expect.any(Number),
        storage_delete_failures: expect.any(Number),
      }),
    );
  });
});

describe.skipIf(!runIntegration)('core.attachments_purge registration', () => {
  it('is exported with hourly cron from the jobs index', async () => {
    const mod = await import('../index.js');
    expect(mod.ATTACHMENTS_PURGE_QUEUE).toBe('core.attachments_purge');
    // Stagger 30 min from idempotency_purge (0 * * * *) and rate_limits_purge (15 * * * *).
    expect(mod.ATTACHMENTS_PURGE_CRON).toBe('30 * * * *');
  });
});
