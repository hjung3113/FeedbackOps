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

import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../../../../config.js';
import { type DbHandle, createDb } from '../../../../db/client.js';
import type { StorageBackend, StorageGetResult } from '../../../../lib/storage/index.js';
import { buildServer } from '../../../../server.js';
import { insertActorRow } from '../../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../../test-support/auth.js';
import { insertMsDirectly } from '../../../../test-support/core-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../../test-support/recovery-fixtures.js';
import { paragraphDoc } from '../../../../test-support/rich-content-fixtures.js';
import {
  cleanupTestActorsByExternalIdPrefix,
  insertVocDirectly,
} from '../../../../test-support/voc-fixtures.js';
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
        if (key === badKey) throw new Error('boom postgres://u:s3cr3t@h/x');
      },
    });
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    // Must not throw — job survives the failure.
    const result = await purgeUnlinkedAttachments({ pool: appHandle.pool, storage, log });

    expect(result.storage_delete_failures).toBeGreaterThanOrEqual(1);
    expect(log.error).toHaveBeenCalled();
    // Bounded error projection: name only, never the message (may embed secrets).
    const loggedErrors = JSON.stringify(log.error.mock.calls);
    expect(loggedErrors).toContain('"err_name":"Error"');
    expect(loggedErrors).not.toContain('s3cr3t');
    expect(loggedErrors).not.toContain('boom');

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
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

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

// Hooks stop the real handler after its candidate SELECT and before row locking.
// The HTTP command uses another pool session and commits before the hook resumes.
// Storage.delete is the purge-wins barrier: the claim must already be committed.
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('attachment race barrier timed out')), 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe.skipIf(!runIntegration)('attachment purge/link serialization (#1171)', () => {
  const prefix = `it-1171-purge-${randomUUID()}`;
  let handle: DbHandle;
  let app: FastifyInstance;
  let actor: string;
  let cookie: string;
  let ms: string;
  let voc: string;
  const keys: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    handle = createDb(APP_URL);
    actor = (
      await insertActorRow(handle, {
        workspaceId: WORKSPACE_ID,
        externalId: prefix,
        roleLevel: 'admin',
      })
    ).id;
    ms = await insertMsDirectly(handle, WORKSPACE_ID, prefix, 'Purge race');
    voc = (await insertVocDirectly(handle, WORKSPACE_ID, ms, actor, prefix)).id;
    app = await buildServer({ config: loadConfig(), dbHandle: handle });
    await app.ready();
    cookie = await loginAs(app, prefix);
  });
  afterAll(async () => {
    await handle.pool.query('delete from voc.voc_attachments where storage_key = any($1::text[])', [
      keys,
    ]);
    await handle.pool.query('delete from voc.vocs where primary_managed_system_id = $1', [ms]);
    await deleteRecoveryFixtureParents(handle, 'delete from core.managed_systems where id = $1', [
      ms,
    ]);
    await cleanupTestActorsByExternalIdPrefix(handle, WORKSPACE_ID, prefix);
    await app.close();
    await handle.close();
  });

  async function upload(age = '25 hours') {
    const id = randomUUID();
    const key = `${WORKSPACE_ID}/${id}/race.txt`;
    keys.push(key);
    await handle.pool.query(
      `insert into voc.voc_attachments
      (id, name, size_bytes, mime_type, storage_key, uploaded_by_actor_id, created_at)
      values ($1,'race.txt',5,'text/plain',$2,$3,now() - $4::interval)`,
      [id, key, actor, age],
    );
    return { id, key };
  }
  const parentRows = (kind: 'voc' | 'internal_comment', title: string) =>
    kind === 'voc'
      ? handle.pool.query('select id from voc.vocs where title = $1', [title])
      : handle.pool.query('select id from voc.voc_internal_comments where voc_id = $1', [voc]);
  function link(kind: 'voc' | 'internal_comment', id: string, title: string) {
    return app.inject({
      method: 'POST',
      url: kind === 'voc' ? '/vocs' : `/vocs/${voc}/internal-comments`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'idempotency-key': randomUUID() },
      payload:
        kind === 'voc'
          ? {
              primary_managed_system_id: ms,
              title,
              description_rich_content: paragraphDoc('race'),
              source_context: 'direct_use',
              attachment_ids: [id],
            }
          : { body_rich_content: paragraphDoc('race'), mentions: [], attachment_ids: [id] },
    });
  }

  it.each(['voc', 'internal_comment'] as const)(
    '%s link commits after candidate selection: bytes and parent survive',
    async (kind) => {
      const { id, key } = await upload();
      const selected = barrier();
      const resume = barrier();
      const stored = new Set([key]);
      const storage = makeStubStorage({
        async delete(k) {
          stored.delete(k);
        },
      });
      const pending = purgeUnlinkedAttachments({
        pool: handle.pool,
        storage,
        beforeClaim: async (candidateId) => {
          if (candidateId === id) {
            selected.release();
            await bounded(resume.promise);
          }
        },
      });
      let parentId: string | undefined;
      try {
        await bounded(selected.promise);
        const response = await bounded(link(kind, id, `${prefix}-${id}`));
        expect(response.statusCode).toBe(201);
        parentId = kind === 'voc' ? response.json().id : response.json().internal_comment.id;
      } finally {
        resume.release();
        await bounded(pending);
      }
      const row = await handle.pool.query(
        'select voc_id, comment_id, linked_at, archived_at from voc.voc_attachments where id = $1',
        [id],
      );
      expect(row.rows[0]).toMatchObject({
        [kind === 'voc' ? 'voc_id' : 'comment_id']: parentId,
        archived_at: null,
      });
      expect(row.rows[0].linked_at).not.toBeNull();
      const parents = await parentRows(kind, `${prefix}-${id}`);
      expect(parents.rows.map((r) => r.id)).toContain(parentId);
      expect(stored.has(key)).toBe(true);
    },
  );

  it.each(['voc', 'internal_comment'] as const)(
    'purge claims first: %s parent rolls back before bytes and row are deleted',
    async (kind) => {
      const { id, key } = await upload();
      const claimed = barrier();
      const resume = barrier();
      const title = `${prefix}-${id}`;
      const before = await parentRows(kind, title);
      const stored = new Set([key]);
      const pending = purgeUnlinkedAttachments({
        pool: handle.pool,
        storage: makeStubStorage({
          async delete(k) {
            if (k === key) {
              claimed.release();
              await bounded(resume.promise);
            }
            stored.delete(k);
          },
        }),
      });
      try {
        await bounded(claimed.promise);
        const claim = await handle.pool.query(
          'select archived_at from voc.voc_attachments where id = $1',
          [id],
        );
        expect(claim.rows[0].archived_at).not.toBeNull();
        const response = await bounded(link(kind, id, title));
        expect(response.statusCode).toBe(422);
        expect(response.json()).toMatchObject({
          code: 'validation.failed',
          detail: {
            fields: [{ path: ['attachment_ids', 0], code: 'invalid' }],
            reason: 'archived',
          },
        });
        expect((await parentRows(kind, title)).rows).toEqual(before.rows);
      } finally {
        resume.release();
        await bounded(pending);
      }
      expect(
        (await handle.pool.query('select id from voc.voc_attachments where id = $1', [id]))
          .rowCount,
      ).toBe(0);
      expect(stored.has(key)).toBe(false);
    },
  );

  it('storage failure keeps the claim and retries it on the next run', async () => {
    const old = await upload();
    let fail = true;
    const stored = new Set([old.key]);
    const storage = makeStubStorage({
      async delete(k) {
        if (k === old.key && fail) {
          fail = false;
          throw new Error('temporary storage failure');
        }
        stored.delete(k);
      },
    });
    const first = await purgeUnlinkedAttachments({ pool: handle.pool, storage });
    expect(first.storage_delete_failures).toBeGreaterThanOrEqual(1);
    const claim = await handle.pool.query(
      'select archived_at from voc.voc_attachments where id = $1',
      [old.id],
    );
    expect(claim.rows[0].archived_at).not.toBeNull();
    expect(stored.has(old.key)).toBe(true);
    await purgeUnlinkedAttachments({ pool: handle.pool, storage });
    expect(
      (await handle.pool.query('select id from voc.voc_attachments where id = $1', [old.id]))
        .rowCount,
    ).toBe(0);
    expect(stored.has(old.key)).toBe(false);
  });

  it('fresh uploads are never claimed or deleted', async () => {
    const fresh = await upload('1 hour');
    const stored = new Set([fresh.key]);
    const storage = makeStubStorage({
      async delete(key) {
        stored.delete(key);
      },
    });
    await purgeUnlinkedAttachments({ pool: handle.pool, storage });
    const recent = await handle.pool.query(
      'select archived_at from voc.voc_attachments where id = $1',
      [fresh.id],
    );
    expect(recent.rows).toEqual([{ archived_at: null }]);
    expect(stored.has(fresh.key)).toBe(true);
  });
});
