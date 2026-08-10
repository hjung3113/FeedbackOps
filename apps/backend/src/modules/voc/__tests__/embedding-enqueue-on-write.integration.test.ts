// #168 step 3 — enqueue-on-write (ADR-0034 D6) through the real HTTP routes.
//
// The load-bearing assertion is the *failure* one: a throwing `boss.send` must
// not cost the user their VOC. Everything else here pins which writes enqueue.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { VOC_EMBED_QUEUE } from '../jobs/embed-voc.js';
import { loginAs } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-embed-enq';

interface SentJob {
  queue: string;
  data: { voc_id: string };
  options: { startAfter?: number } | undefined;
}

function recordingBoss(): { boss: PgBoss; sent: SentJob[] } {
  const sent: SentJob[] = [];
  const boss = {
    async send(queue: string, data: SentJob['data'], options?: SentJob['options']) {
      sent.push({ queue, data, options });
      return 'job-id';
    },
  } as unknown as PgBoss;
  return { boss, sent };
}

function throwingBoss(): PgBoss {
  return {
    async send() {
      throw new Error('pg-boss is down');
    },
  } as unknown as PgBoss;
}

const paragraphDoc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe.skipIf(!runIntegration)('VOC embedding enqueue-on-write (#168)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
  });

  beforeEach(async () => cleanup());

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
      `delete from core.audit_log where workspace_id = $1 and subject_id in (
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
    // Every test here registers a Managed System as the same seed admin, and
    // that route is rate limited per actor. Without this the suite passes once
    // and then fails for ~a minute on any rerun — see the same reset in
    // analytics-areas and tasks. `fileParallelism: false` keeps it local.
    await migrateHandle.pool.query(`delete from core.rate_limits`);
  }

  async function build(opts: {
    boss: PgBoss;
    provider: 'fake' | 'disabled';
  }): Promise<FastifyInstance> {
    return buildServer({
      config: { ...loadConfig(), EMBEDDING_PROVIDER: opts.provider, EMBEDDING_VERSION: 1 },
      dbHandle: appHandle,
      boss: opts.boss,
    });
  }

  async function createMs(app: FastifyInstance, cookie: string): Promise<string> {
    const slug = `${SLUG_PREFIX}-${randomUUID().slice(0, 8)}`;
    const res = await app.inject({
      method: 'POST',
      url: '/managed-systems',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { slug, name: 'Enqueue target' },
    });
    if (res.statusCode !== 201) throw new Error(`createMs failed: ${res.body}`);
    return res.json().id as string;
  }

  async function postVoc(
    app: FastifyInstance,
    cookie: string,
    msId: string,
    title: string,
  ): Promise<{ statusCode: number; body: { id?: string; updated_at?: string } }> {
    const res = await app.inject({
      method: 'POST',
      url: '/vocs',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: {
        primary_managed_system_id: msId,
        title,
        description_rich_content: paragraphDoc('original body'),
      },
    });
    return { statusCode: res.statusCode, body: res.statusCode === 201 ? res.json() : {} };
  }

  async function vocExists(vocId: string): Promise<boolean> {
    const res = await appHandle.pool.query(`select 1 from voc.vocs where id = $1`, [vocId]);
    return res.rowCount === 1;
  }

  it('enqueues one delayed embedding job when a VOC is created', async () => {
    const { boss, sent } = recordingBoss();
    const app = await build({ boss, provider: 'fake' });
    try {
      const admin = await loginAs(app, 'mock-admin-1');
      const msId = await createMs(app, admin);
      const reporter = await loginAs(app, 'mock-user-1');

      const created = await postVoc(app, reporter, msId, 'enqueue me');
      expect(created.statusCode).toBe(201);

      const mine = sent.filter((job) => job.data.voc_id === created.body.id);
      expect(mine).toHaveLength(1);
      expect(mine[0]?.queue).toBe(VOC_EMBED_QUEUE);
      // Delayed so the worker cannot beat the writing transaction's commit.
      expect(mine[0]?.options?.startAfter).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('does NOT lose the VOC when the enqueue throws', async () => {
    const app = await build({ boss: throwingBoss(), provider: 'fake' });
    try {
      const admin = await loginAs(app, 'mock-admin-1');
      const msId = await createMs(app, admin);
      const reporter = await loginAs(app, 'mock-user-1');

      const created = await postVoc(app, reporter, msId, 'survives a dead queue');
      // The whole boundary in one assertion: queue down, VOC still created.
      expect(created.statusCode).toBe(201);
      expect(created.body.id).toBeTruthy();
      expect(await vocExists(created.body.id as string)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('enqueues nothing when the provider is disabled (ADR-0034 D2)', async () => {
    const { boss, sent } = recordingBoss();
    const app = await build({ boss, provider: 'disabled' });
    try {
      const admin = await loginAs(app, 'mock-admin-1');
      const msId = await createMs(app, admin);
      const reporter = await loginAs(app, 'mock-user-1');

      const created = await postVoc(app, reporter, msId, 'no embedding here');
      expect(created.statusCode).toBe(201);
      expect(sent.filter((job) => job.queue === VOC_EMBED_QUEUE)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('enqueues again when a description edit changes the title', async () => {
    const { boss, sent } = recordingBoss();
    const app = await build({ boss, provider: 'fake' });
    try {
      const admin = await loginAs(app, 'mock-admin-1');
      const msId = await createMs(app, admin);
      const reporter = await loginAs(app, 'mock-user-1');

      const created = await postVoc(app, reporter, msId, 'before edit');
      const vocId = created.body.id as string;
      expect(sent.filter((job) => job.data.voc_id === vocId)).toHaveLength(1);

      const edit = await app.inject({
        method: 'PATCH',
        url: `/vocs/${vocId}/description`,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${reporter}`,
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
          'if-match': created.body.updated_at as string,
        },
        payload: { title: 'after edit' },
      });
      expect(edit.statusCode).toBe(200);
      expect(sent.filter((job) => job.data.voc_id === vocId)).toHaveLength(2);
    } finally {
      await app.close();
    }
  });
});
