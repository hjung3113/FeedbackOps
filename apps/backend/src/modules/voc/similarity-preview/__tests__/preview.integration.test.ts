import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type AppConfig, loadConfig } from '../../../../config.js';
import { type DbHandle, createDb } from '../../../../db/client.js';
import { buildServer } from '../../../../server.js';
import { insertDevActor } from '../../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../../test-support/auth.js';
import { insertMsDirectly } from '../../../../test-support/core-fixtures.js';
import {
  grantCapability,
  revokeCapabilityGrant,
} from '../../../../test-support/permissions-fixtures.js';
import { cleanupReadTestTables, insertVocDirectly } from '../../../../test-support/voc-fixtures.js';
import type { EmbeddingProvider } from '../../embedding/port.js';
import { cleanupPreview } from '../repo.js';

const workspaceId = process.env.WORKSPACE_ID ?? '';
const appUrl = process.env.DATABASE_URL ?? '';
const migrateUrl = process.env.DATABASE_URL_MIGRATE ?? '';
const version = 109900;
const prefix = 'it-preview-1099';
const identity = { provider: 'test', model: 'hand-built', dimensions: 3 };
const doc = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe.skipIf(!workspaceId || !appUrl || !migrateUrl)('paid draft preview route', () => {
  let db: DbHandle;
  let ops: DbHandle;
  let app: FastifyInstance;
  let config: AppConfig;
  let ms: string;
  let otherMs: string;
  let foreignMs: string;
  const foreignWorkspace = randomUUID();
  let adminId: string;
  let cookie: string;
  let calls: number;
  let candidate: string;
  let provider: EmbeddingProvider;
  let clock: Date;
  const rebuild = async (deadlineMs = 10000) => {
    await app?.close();
    app = await buildServer({
      config,
      dbHandle: db,
      embeddingProvider: provider,
      similarityPreviewDeadlineMs: deadlineMs,
      similarityPreviewClock: () => clock,
    });
  };

  async function cleanup() {
    await ops.pool.query(
      'delete from voc.voc_similarity_preview_requests where workspace_id = $1',
      [workspaceId],
    );
    await ops.pool.query('delete from voc.voc_similarity_preview_budgets where workspace_id = $1', [
      workspaceId,
    ]);
    await cleanupReadTestTables(db, workspaceId, prefix);
  }
  beforeAll(async () => {
    db = createDb(appUrl);
    ops = createDb(migrateUrl);
    await ops.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      foreignWorkspace,
      'Foreign preview fixture',
    ]);
    foreignMs = await insertMsDirectly(
      ops,
      foreignWorkspace,
      `${prefix}-${randomUUID()}`,
      'Foreign preview',
    );
    adminId = (
      await db.pool.query(
        "select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'",
        [workspaceId],
      )
    ).rows[0].id;
  });
  beforeEach(async () => {
    await app?.close();
    await cleanup();
    await db.pool.query('delete from core.rate_limits');
    ms = await insertMsDirectly(db, workspaceId, `${prefix}-${randomUUID()}`, 'Preview');
    otherMs = await insertMsDirectly(db, workspaceId, `${prefix}-${randomUUID()}`, 'Other');
    config = {
      ...loadConfig(),
      EMBEDDING_PROVIDER: 'fake',
      EMBEDDING_VERSION: version,
      VOC_SIMILARITY_PREVIEW: 'enabled',
    };
    clock = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000 + 86_400_000 + 43_215_000);
    calls = 0;
    provider = {
      identity: () => identity,
      embed: async (texts) => {
        calls++;
        expect(texts).toEqual(['Draft\n\nDescription']);
        return { ...identity, embeddingVersion: version, vectors: [[1, 0, 0]] };
      },
    };
    await rebuild();
    cookie = await loginAs(app, 'mock-admin-1');
    candidate = await seed(ms, adminId, [1, 0, 0]);
  });
  afterAll(async () => {
    await app?.close();
    await cleanup();
    await ops.pool.query('delete from core.managed_systems where id=$1', [foreignMs]);
    await ops.pool.query('delete from core.workspaces where id=$1', [foreignWorkspace]);
    await db?.close();
    await ops?.close();
  });
  async function seed(system: string, reporter: string, vector: number[]) {
    const voc = await insertVocDirectly(db, workspaceId, system, reporter, 'Older duplicate');
    await db.pool.query(
      `insert into voc.voc_embeddings (voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding, source_hash, updated_at)
      select id, workspace_id, $2::integer, 'test', 'hand-built', 3, $3::vector, 'fixture', updated_at from voc.vocs where id = $1::uuid`,
      [voc.id, version, JSON.stringify(vector)],
    );
    return voc.id;
  }
  const body = () => ({
    primary_managed_system_id: ms,
    title: 'Draft',
    description_rich_content: doc('Description'),
  });
  function request(
    key: string = randomUUID(),
    payload: Record<string, unknown> = body(),
    session: string | null = cookie,
  ) {
    return app.inject({
      method: 'POST',
      url: '/vocs/similarity-preview',
      headers: {
        ...(session ? { cookie: `${SESSION_COOKIE_NAME}=${session}` } : {}),
        ...(key ? { 'idempotency-key': key } : {}),
      },
      payload,
    });
  }
  async function paidState() {
    const rows = await ops.pool.query(
      `select
      (select count(*)::int from voc.voc_similarity_preview_requests where workspace_id=$1) as requests,
      (select coalesce(sum(used_attempts),0)::int from voc.voc_similarity_preview_budgets where workspace_id=$1) as attempts`,
      [workspaceId],
    );
    return rows.rows[0];
  }
  it.each(['Admin', 'Developer', 'User'])(
    'availability is enabled for %s without provider calls or paid writes',
    async (role) => {
      const externalId =
        role === 'Developer'
          ? (await insertDevActor(ops, workspaceId, `preview-${randomUUID()}`)).externalId
          : role === 'Admin'
            ? 'mock-admin-1'
            : 'mock-user-1';
      const session = await loginAs(app, externalId);
      const before = await paidState();
      const res = await app.inject({
        method: 'GET',
        url: '/vocs/similarity-preview/availability',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${session}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ available: true });
      expect(res.headers['cache-control']).toBe('private, no-cache');
      expect(calls).toBe(0);
      expect(await paidState()).toEqual(before);
    },
  );
  it.each(['preview disabled', 'provider disabled'])(
    'availability reports %s without provider calls or paid writes',
    async (kind) => {
      if (kind === 'preview disabled') config.VOC_SIMILARITY_PREVIEW = 'disabled';
      else config.EMBEDDING_PROVIDER = 'disabled';
      const before = await paidState();
      const res = await app.inject({
        method: 'GET',
        url: '/vocs/similarity-preview/availability',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ available: false, reason: 'provider_disabled' });
      expect(calls).toBe(0);
      expect(await paidState()).toEqual(before);
    },
  );
  it('availability requires a session without provider calls or paid writes', async () => {
    const res = await app.inject({ method: 'GET', url: '/vocs/similarity-preview/availability' });
    expect(res.statusCode).toBe(401);
    expect(calls).toBe(0);
    expect(await paidState()).toEqual({ requests: 0, attempts: 0 });
  });

  it('finds an older readable duplicate with one paid request', async () => {
    const res = await request();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: true, items: [{ id: candidate }] });
    expect(Object.keys(res.json().items[0]).sort()).toEqual([
      'created_at',
      'display_id',
      'id',
      'title',
    ]);
    expect(calls).toBe(1);
    expect(await paidState()).toEqual({ requests: 1, attempts: 4 });
  });

  it('lets a default User preview their own readable VOC without a triage grant', async () => {
    const userId = (
      await db.pool.query(
        "select id from core.actors where workspace_id=$1 and external_id='mock-user-1'",
        [workspaceId],
      )
    ).rows[0].id;
    const own = await seed(ms, userId, [0.8, 0.6, 0]);
    const session = await loginAs(app, 'mock-user-1');
    const res = await request(randomUUID(), body(), session);
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((item: { id: string }) => item.id)).toEqual([own]);
    expect(calls).toBe(1);
  });

  it.each([
    ['malformed body', 422],
    ['extra field', 422],
    ['missing key', 422],
    ['non-v4 key', 422],
    ['unauthenticated', 401],
    ['foreign MS', 404],
    ['missing MS', 404],
    ['disallowed rich content', 422],
    ['archived MS', 409],
    ['oversized derived prose', 422],
    ['preview disabled', 200],
    ['provider disabled', 200],
    ['no readable candidate', 200],
    ['stale-only corpus', 200],
  ] as const)('zero spend for %s', async (kind, status) => {
    let payload: Record<string, unknown> = body();
    let key: string = randomUUID();
    let session: string | null = cookie;
    if (kind === 'malformed body') payload = { title: 3 };
    if (kind === 'extra field') payload = { ...payload, extra: true };
    if (kind === 'missing key') key = '';
    if (kind === 'non-v4 key') key = '11111111-1111-1111-8111-111111111111';
    if (kind === 'unauthenticated') session = null;
    if (kind === 'foreign MS') payload.primary_managed_system_id = foreignMs;
    if (kind === 'missing MS') payload.primary_managed_system_id = randomUUID();
    if (kind === 'disallowed rich content')
      payload.description_rich_content = { type: 'doc', content: [{ type: 'script' }] };
    if (kind === 'archived MS')
      await ops.pool.query('update core.managed_systems set archived_at=now() where id=$1', [ms]);
    if (kind === 'oversized derived prose')
      payload.description_rich_content = doc('가'.repeat(6000));
    if (kind === 'preview disabled') config.VOC_SIMILARITY_PREVIEW = 'disabled';
    if (kind === 'provider disabled') config.EMBEDDING_PROVIDER = 'disabled';
    if (kind === 'no readable candidate') {
      const dev = await insertDevActor(ops, workspaceId, `preview-${randomUUID()}`);
      session = await loginAs(app, dev.externalId);
    }
    if (kind === 'stale-only corpus')
      await ops.pool.query(
        "update voc.voc_embeddings set updated_at=updated_at-interval '1 second' where voc_id=$1",
        [candidate],
      );
    const res = await request(key, payload, session);
    expect(res.statusCode).toBe(status);
    if (kind === 'oversized derived prose')
      expect(res.json().detail.fields).toEqual([
        { path: ['description_rich_content'], code: 'too_big' },
      ]);
    if (kind === 'stale-only corpus' || kind === 'no readable candidate')
      expect(res.json()).toEqual({ available: true, items: [] });
    if (kind === 'preview disabled' || kind === 'provider disabled')
      expect(res.json().reason).toBe('provider_disabled');
    expect(calls).toBe(0);
    expect(await paidState()).toEqual({ requests: 0, attempts: 0 });
  });

  async function bucket(
    scope: 'actor' | 'workspace',
    period: 'minute' | 'day',
    used: number,
    actor = adminId,
  ) {
    const start = new Date(
      Math.floor(clock.getTime() / (period === 'minute' ? 60000 : 86400000)) *
        (period === 'minute' ? 60000 : 86400000),
    );
    await ops.pool.query(
      `insert into voc.voc_similarity_preview_budgets
      (workspace_id, scope, actor_id, scope_key, period, window_start, used_attempts)
      values ($1::uuid, $2, $3::uuid, $4, $5, $6::timestamptz, $7)
      on conflict (workspace_id, scope_key, period, window_start) do update set used_attempts=excluded.used_attempts`,
      [
        workspaceId,
        scope,
        scope === 'actor' ? actor : null,
        scope === 'actor' ? actor : 'workspace',
        period,
        start,
        used,
      ],
    );
  }
  it('limits Admin on the third actor minute attempt without partial increments', async () => {
    expect((await request()).statusCode).toBe(200);
    expect((await request()).statusCode).toBe(200);
    const before = await paidState();
    const res = await request();
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({
      code: 'rate_limited.actor',
      detail: { budget_period: 'minute', retry_after_seconds: 45 },
    });
    expect(res.headers['retry-after']).toBe('45');
    expect(calls).toBe(2);
    expect(await paidState()).toEqual(before);
    clock = new Date(clock.getTime() + 60000);
    expect((await request()).statusCode).toBe(200);
    expect(calls).toBe(3);
  });
  it('limits the workspace at eleven attempts across distinct scoped actors', async () => {
    const sessions: string[] = [];
    for (let i = 0; i < 11; i++) {
      const actor = await insertDevActor(ops, workspaceId, `preview-${randomUUID()}`);
      await grantCapability(ops, workspaceId, actor.id, 'voc.read', ms, adminId);
      sessions.push(await loginAs(app, actor.externalId));
    }
    for (const session of sessions.slice(0, 10))
      expect((await request(randomUUID(), body(), session)).statusCode).toBe(200);
    const before = await paidState();
    const res = await request(randomUUID(), body(), sessions[10]);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({
      code: 'rate_limited.workspace',
      detail: { budget_period: 'minute' },
    });
    expect(calls).toBe(10);
    expect(await paidState()).toEqual(before);
  });
  it.each([
    ['actor', 20],
    ['workspace', 100],
  ] as const)('enforces %s UTC day cap and resets next day', async (scope, cap) => {
    await bucket(scope, 'day', cap);
    const before = await paidState();
    const res = await request();
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({
      code: `rate_limited.${scope}`,
      detail: { budget_period: 'day', retry_after_seconds: 43185 },
    });
    expect(calls).toBe(0);
    expect(await paidState()).toEqual(before);
    clock = new Date(Math.floor(clock.getTime() / 86_400_000) * 86_400_000 + 86_400_000);
    expect((await request()).statusCode).toBe(200);
    expect(calls).toBe(1);
  });
  it.each(['actor', 'workspace'] as const)(
    'admits one parallel dispatch at the last %s slot',
    async (scope) => {
      await bucket(scope, 'minute', scope === 'actor' ? 1 : 9);
      const replies = await Promise.all(Array.from({ length: 5 }, () => request()));
      expect(replies.filter((r) => r.statusCode === 200)).toHaveLength(1);
      expect(replies.filter((r) => r.statusCode === 429)).toHaveLength(4);
      expect(calls).toBe(1);
    },
  );
  it('fails reservation storage with zero egress and rollback', async () => {
    // Test-only failing INSERT trigger, scoped to this workspace; no production seam or grant change.
    await ops.pool.query(`create function voc.preview_1099_test_failure() returns trigger language plpgsql as $$
      begin if NEW.workspace_id = '${workspaceId}'::uuid then raise exception 'forced reservation failure'; end if; return NEW; end; $$`);
    await ops.pool.query(
      'create trigger preview_1099_test_failure before insert on voc.voc_similarity_preview_budgets for each row execute function voc.preview_1099_test_failure()',
    );
    try {
      const res = await request();
      expect(res.statusCode).toBe(500);
      expect(res.json().code).toBe('internal.unexpected');
      expect(calls).toBe(0);
      expect(await paidState()).toEqual({ requests: 0, attempts: 0 });
    } finally {
      await ops.pool.query(
        'drop trigger preview_1099_test_failure on voc.voc_similarity_preview_budgets',
      );
      await ops.pool.query('drop function voc.preview_1099_test_failure()');
    }
  });
  it('concurrent identical keys dispatch once and replay with exhausted budgets', async () => {
    const key = randomUUID();
    const replies = await Promise.all(Array.from({ length: 5 }, () => request(key)));
    expect(replies.every((r) => r.statusCode === 200)).toBe(true);
    expect(calls).toBe(1);
    expect(await paidState()).toEqual({ requests: 1, attempts: 4 });
    await bucket('actor', 'minute', 2);
    await bucket('workspace', 'minute', 10);
    const before = await paidState();
    expect((await request(key)).json()).toMatchObject({
      available: true,
      items: [{ id: candidate }],
    });
    expect(calls).toBe(1);
    expect(await paidState()).toEqual(before);
    await ops.pool.query('delete from voc.voc_embeddings where voc_id=$1', [candidate]);
    expect((await request(key, { ...body(), title: 'Changed' })).statusCode).toBe(409);
  });
  it.each(['reserved', 'outcome_unknown', 'incompatible', 'expired', 'disabled'] as const)(
    'replays %s without another dispatch or spend',
    async (kind) => {
      const key = randomUUID();
      await request(key);
      if (kind === 'reserved' || kind === 'outcome_unknown')
        await ops.pool.query(
          'update voc.voc_similarity_preview_requests set outcome=$1 where idempotency_key=$2',
          [kind, key],
        );
      if (kind === 'incompatible')
        await ops.pool.query(
          "update voc.voc_similarity_preview_requests set model='old' where idempotency_key=$1",
          [key],
        );
      if (kind === 'expired') clock = new Date(clock.getTime() + 600001);
      if (kind === 'disabled') config.VOC_SIMILARITY_PREVIEW = 'disabled';
      const before = await paidState();
      expect((await request(key)).json()).toEqual({
        available: false,
        reason:
          kind === 'expired'
            ? 'preview_expired'
            : kind === 'disabled'
              ? 'provider_disabled'
              : 'provider_outcome_unknown',
        items: [],
      });
      expect(calls).toBe(1);
      expect(await paidState()).toEqual(before);
      if (kind === 'disabled')
        expect((await request(key, { ...body(), title: 'Changed' })).statusCode).toBe(409);
    },
  );
  it('reauthorizes stored-vector replay after a sole MS grant is revoked', async () => {
    const actor = await insertDevActor(ops, workspaceId, `preview-${randomUUID()}`);
    const grant = await grantCapability(ops, workspaceId, actor.id, 'voc.read', ms, adminId);
    const session = await loginAs(app, actor.externalId);
    const own = await seed(ms, actor.id, [0.8, 0.6, 0]);
    const key = randomUUID();
    expect(
      (await request(key, body(), session)).json().items.map((i: { id: string }) => i.id),
    ).toContain(candidate);
    await revokeCapabilityGrant(ops, grant, adminId);
    const before = await paidState();
    const replay = await request(key, body(), session);
    expect(replay.json().items.map((i: { id: string }) => i.id)).toEqual([own]);
    expect(calls).toBe(1);
    expect(await paidState()).toEqual(before);
  });
  it.each(['timeout', 'failure', 'identity mismatch', 'config change'] as const)(
    'consumes one attempt for %s with no retry',
    async (kind) => {
      provider = {
        identity: () => identity,
        embed: async (_texts, options) => {
          calls++;
          if (kind === 'timeout')
            return new Promise((_resolve, reject) => {
              options?.signal?.addEventListener('abort', () => reject(new Error('wrapped abort')), {
                once: true,
              });
            });
          if (kind === 'failure') throw new Error('normal provider rejection');
          if (kind === 'config change') config.EMBEDDING_VERSION++;
          return {
            ...identity,
            model: kind === 'identity mismatch' ? 'other' : identity.model,
            embeddingVersion: version,
            vectors: [[1, 0, 0]],
          };
        },
      };
      await rebuild(5);
      cookie = await loginAs(app, 'mock-admin-1');
      const key = randomUUID();
      const res = await request(key);
      const reason =
        kind === 'timeout'
          ? 'provider_timeout'
          : kind === 'failure'
            ? 'provider_failed'
            : 'provider_outcome_unknown';
      expect(res.json()).toEqual({ available: false, reason, items: [] });
      expect(calls).toBe(1);
      expect(await paidState()).toEqual({ requests: 1, attempts: 4 });
      expect((await request(key)).json().reason).toBe(reason);
      expect(calls).toBe(1);
    },
  );
  it.each(['below-cut', 'archived', 'stale watermark', 'other-MS'] as const)(
    'excludes %s candidates before the top-three cap',
    async (kind) => {
      const excluded = await seed(
        kind === 'other-MS' ? otherMs : ms,
        adminId,
        kind === 'below-cut' ? [0.6, 0.8, 0] : [1, 0, 0],
      );
      if (kind === 'archived') {
        await ops.pool.query('update voc.vocs set archived_at=now() where id=$1', [excluded]);
        // Archiving touches the VOC watermark; refresh the embedding so archive is the only disqualifier.
        await ops.pool.query(
          'update voc.voc_embeddings e set updated_at=v.updated_at from voc.vocs v where v.id=e.voc_id and e.voc_id=$1',
          [excluded],
        );
      }
      if (kind === 'stale watermark')
        await ops.pool.query(
          "update voc.voc_embeddings set updated_at=updated_at-interval '1 second' where voc_id=$1",
          [excluded],
        );
      const res = await request();
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ available: true });
      expect(res.json().items.map((i: { id: string }) => i.id)).toEqual([candidate]);
      expect(calls).toBe(1);
    },
  );
  it('ranks distinct scores descending ahead of UUID order', async () => {
    const ids = [
      candidate,
      await seed(ms, adminId, [1, 0, 0]),
      await seed(ms, adminId, [1, 0, 0]),
    ].sort();
    // UUID ASC is the reverse of score DESC (0.8, 0.9, 1.0).
    const vectors = [
      [0.8, 0.6, 0],
      [0.9, Math.sqrt(0.19), 0],
      [1, 0, 0],
    ];
    for (const [index, id] of ids.entries()) {
      await db.pool.query('update voc.voc_embeddings set embedding=$2::vector where voc_id=$1', [
        id,
        JSON.stringify(vectors[index]),
      ]);
    }
    const res = await request();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: true });
    expect(res.json().items.map((i: { id: string }) => i.id)).toEqual([ids[2], ids[1], ids[0]]);
    expect(calls).toBe(1);
  });
  it('orders equal scores by UUID ASC and returns only the top three', async () => {
    const ties = [
      candidate,
      await seed(ms, adminId, [1, 0, 0]),
      await seed(ms, adminId, [1, 0, 0]),
      await seed(ms, adminId, [1, 0, 0]),
    ].sort();
    const res = await request();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: true });
    expect(res.json().items.map((i: { id: string }) => i.id)).toEqual(ties.slice(0, 3));
    expect(calls).toBe(1);
  });
  it('hides same-MS non-reporter duplicates while retaining a reporter-owned control', async () => {
    const actor = await insertDevActor(ops, workspaceId, `preview-${randomUUID()}`);
    await grantCapability(ops, workspaceId, actor.id, 'voc.read', otherMs, adminId);
    const session = await loginAs(app, actor.externalId);
    const own = await seed(ms, actor.id, [0.8, 0.6, 0]);
    expect(
      (await request(randomUUID(), body(), session)).json().items.map((i: { id: string }) => i.id),
    ).toEqual([own]);
    expect(calls).toBe(1);
  });
  it('writes no domain rows and leaves heuristic peers free of provider calls', async () => {
    async function counts() {
      const out: Record<string, number> = {};
      for (const table of [
        'voc.vocs',
        'voc_cluster.voc_clusters',
        'voc_cluster.voc_cluster_members',
        'voc.voc_recommendation_decisions',
        'core.entity_links',
        'core.audit_log',
      ]) {
        out[table] = (
          await ops.pool.query(`select count(*)::int as count from ${table}`)
        ).rows[0].count;
      }
      return out;
    }
    const before = await counts();
    const peers = await app.inject({
      method: 'GET',
      url: `/vocs/pre-submit-peers?managed_system_id=${ms}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(peers.statusCode).toBe(200);
    expect(calls).toBe(0);
    await request();
    expect(calls).toBe(1);
    expect(await counts()).toEqual(before);
  });
  it('cleans expired vectors and tombstones and ended buckets while retention guards protect live rows', async () => {
    const key = randomUUID();
    await request(key);
    await expect(
      db.pool.query('delete from voc.voc_similarity_preview_requests where idempotency_key=$1', [
        key,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.pool.query('delete from voc.voc_similarity_preview_budgets where workspace_id=$1', [
        workspaceId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await ops.pool.query(
      `update voc.voc_similarity_preview_requests set reserved_at=now()-interval '20 minutes',
      expires_at=now()+interval '23 hours', vector_expires_at=now()-interval '10 minutes' where idempotency_key=$1`,
      [key],
    );
    await ops.pool.query(
      `insert into voc.voc_similarity_preview_requests (workspace_id, actor_id, idempotency_key, request_hash, primary_managed_system_id, provider, model, dimensions, embedding_version, reserved_at, expires_at)
      values ($1,$2,$3,'old',$4,'test','hand-built',3,$5,now()-interval '25 hours',now()-interval '1 hour')`,
      [workspaceId, adminId, randomUUID(), ms, version],
    );
    await ops.pool.query(
      `insert into voc.voc_similarity_preview_budgets (workspace_id,scope,actor_id,scope_key,period,window_start,used_attempts)
      values ($1,'workspace',NULL,'workspace','minute',now()-interval '2 minutes',1)`,
      [workspaceId],
    );
    await cleanupPreview(db.db);
    const rows = await ops.pool.query(
      'select vector::text, vector_expires_at from voc.voc_similarity_preview_requests where workspace_id=$1',
      [workspaceId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].vector).toBeNull();
    expect(rows.rows[0].vector_expires_at).not.toBeNull();
    // Ten-minute vector expiry does not authorize deletion of a still-live 24h tombstone.
    await expect(
      db.pool.query('delete from voc.voc_similarity_preview_requests where idempotency_key=$1', [
        key,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    const budgets = await ops.pool.query(
      'select count(*)::int as count from voc.voc_similarity_preview_budgets where workspace_id=$1',
      [workspaceId],
    );
    expect(budgets.rows[0].count).toBe(4);
    expect((await request(key)).json().reason).toBe('preview_expired');
    expect(calls).toBe(1);
  });
});
