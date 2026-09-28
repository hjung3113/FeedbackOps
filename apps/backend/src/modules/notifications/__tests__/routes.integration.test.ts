import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TEST_PREFIX = `notification-routes-${randomUUID()}`;

interface ActorSession {
  id: string;
  cookie: string;
  workspaceId: string;
}

interface NotificationSeed {
  id: string;
}

describe.skipIf(!runIntegration)('notification inbox routes', () => {
  let appDb: DbHandle;
  let migrateDb: DbHandle;
  let app: FastifyInstance;
  let actorA: ActorSession;
  let actorB: ActorSession;
  let actorC: ActorSession;
  const actorIds: string[] = [];
  const sessionIds: string[] = [];
  const rateLimitKeys: string[] = [];
  const workspaceIds: string[] = [];
  const notificationIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appDb = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appDb });
    await app.ready();
    actorA = await createActorSession(WORKSPACE_ID, 'a');
    actorB = await createActorSession(WORKSPACE_ID, 'b');
    const otherWorkspaceId = await createWorkspace();
    actorC = await createActorSession(otherWorkspaceId, 'c');
  });

  async function cleanupNotifications(): Promise<void> {
    if (notificationIds.length > 0) {
      await migrateDb.pool.query('delete from core.notifications where id = any($1::uuid[])', [
        notificationIds,
      ]);
      notificationIds.length = 0;
    }
  }

  afterEach(cleanupNotifications);

  afterAll(async () => {
    await cleanupNotifications();
    await app?.close();
    if (actorIds.length > 0) {
      await migrateDb.pool.query('delete from core.sessions where id = any($1::text[])', [
        sessionIds,
      ]);
      await migrateDb.pool.query(
        `delete from core.rate_limits
          where key = any($1::text[])`,
        [rateLimitKeys],
      );
      await migrateDb.pool.query('delete from core.actors where id = any($1::uuid[])', [actorIds]);
    }
    if (workspaceIds.length > 0) {
      await migrateDb?.pool.query('delete from core.workspaces where id = any($1::uuid[])', [
        workspaceIds,
      ]);
    }
    await appDb?.close();
    await migrateDb?.close();
  });

  async function createWorkspace(): Promise<string> {
    const result = await migrateDb.pool.query<{ id: string }>(
      'insert into core.workspaces (name) values ($1) returning id',
      [`${TEST_PREFIX}-${randomUUID()}`],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('notification test workspace insert returned no id');
    workspaceIds.push(id);
    return id;
  }

  async function createActorSession(workspaceId: string, suffix: string): Promise<ActorSession> {
    const idSuffix = randomUUID();
    const externalId = `${TEST_PREFIX}-${suffix}-${idSuffix}`;
    const email = `${idSuffix}@example.test`;
    const actor = await migrateDb.pool.query<{ id: string }>(
      `insert into core.actors
         (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $2, 'user', 'internal_member')
       returning id`,
      [workspaceId, externalId, email],
    );
    const actorId = actor.rows[0]?.id;
    if (!actorId) throw new Error('notification test actor insert returned no id');
    actorIds.push(actorId);

    const sessionId = randomUUID();
    await migrateDb.pool.query(
      `insert into core.sessions
         (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
       values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
      [sessionId, actorId, workspaceId],
    );
    sessionIds.push(sessionId);
    rateLimitKeys.push(`${workspaceId}:${actorId}`);
    return { id: actorId, cookie: sessionId, workspaceId };
  }

  async function insertNotification(
    actor: ActorSession,
    input: { createdAt: string; readAt?: string | null; archivedAt?: string | null },
  ): Promise<NotificationSeed> {
    const id = randomUUID();
    const result = await migrateDb.pool.query<NotificationSeed>(
      `insert into core.notifications
         (id, workspace_id, actor_id, event_type, subject_type, subject_id, summary,
          detail, correlation_id, created_at, read_at, archived_at)
       values ($1, $2, $3, 'voc.reporter_replied', 'voc', $4, 'VOC에 작성자 답변이 등록되었습니다.',
               '{}'::jsonb, $5, $6, $7, $8)
       returning id, actor_id, workspace_id, created_at::text, read_at, archived_at`,
      [
        id,
        actor.workspaceId,
        actor.id,
        randomUUID(),
        randomUUID(),
        input.createdAt,
        input.readAt ?? null,
        input.archivedAt ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('notification fixture insert returned no row');
    notificationIds.push(id);
    return row;
  }

  function cookieHeader(actor: ActorSession): { cookie: string } {
    return { cookie: `${SESSION_COOKIE_NAME}=${actor.cookie}` };
  }

  it('keeps list, pagination, read, archive, and validation behavior actor scoped', async () => {
    const base = Date.now() - 60_000;
    const aNewest = await insertNotification(actorA, {
      createdAt: new Date(base + 5000).toISOString(),
    });
    const aMiddle = await insertNotification(actorA, {
      createdAt: new Date(base + 4000).toISOString(),
    });
    const aRead = await insertNotification(actorA, {
      createdAt: new Date(base + 3000).toISOString(),
      readAt: new Date(base + 3500).toISOString(),
    });
    const aArchived = await insertNotification(actorA, {
      createdAt: new Date(base + 2000).toISOString(),
      archivedAt: new Date(base + 2500).toISOString(),
    });
    const bRow = await insertNotification(actorB, {
      createdAt: new Date(base + 1000).toISOString(),
    });
    const cRow = await insertNotification(actorC, {
      createdAt: new Date(base).toISOString(),
    });

    const anonymous = await app.inject({ method: 'GET', url: '/notifications' });
    expect(anonymous.statusCode).toBe(401);
    const anonymousMutation = await app.inject({
      method: 'POST',
      url: `/notifications/${aNewest.id}/read`,
    });
    expect(anonymousMutation.statusCode).toBe(401);

    const first = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: cookieHeader(actorA),
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-cache');
    const firstBody = first.json<{
      items: Array<{ id: string }>;
      page: { cursor?: string; has_more: boolean };
      unread_count: number;
    }>();
    expect(firstBody.items.map((item) => item.id)).toEqual([aNewest.id, aMiddle.id, aRead.id]);
    expect(firstBody.items.map((item) => item.id)).not.toContain(bRow.id);
    expect(firstBody.items.map((item) => item.id)).not.toContain(cRow.id);
    expect(firstBody.unread_count).toBe(2);

    const unread = await app.inject({
      method: 'GET',
      url: '/notifications?unread=true',
      headers: cookieHeader(actorA),
    });
    expect(unread.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id)).toEqual([
      aNewest.id,
      aMiddle.id,
    ]);
    const read = await app.inject({
      method: 'GET',
      url: '/notifications?unread=false',
      headers: cookieHeader(actorA),
    });
    expect(read.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id)).toEqual([
      aRead.id,
    ]);

    const archived = await app.inject({
      method: 'GET',
      url: '/notifications?include_archived=true',
      headers: cookieHeader(actorA),
    });
    expect(
      archived
        .json<{ items: Array<{ id: string }>; unread_count: number }>()
        .items.map((item) => item.id),
    ).toEqual([aNewest.id, aMiddle.id, aRead.id, aArchived.id]);
    expect(archived.json<{ unread_count: number }>().unread_count).toBe(2);

    const pageOne = await app.inject({
      method: 'GET',
      url: '/notifications?limit=2',
      headers: cookieHeader(actorA),
    });
    const pageOneBody = pageOne.json<{
      items: Array<{ id: string }>;
      page: { cursor?: string; has_more: boolean };
    }>();
    expect(pageOneBody.items.map((item) => item.id)).toEqual([aNewest.id, aMiddle.id]);
    expect(pageOneBody.page.has_more).toBe(true);
    expect(pageOneBody.page.cursor).toBeTruthy();
    const pageTwo = await app.inject({
      method: 'GET',
      url: `/notifications?limit=2&cursor=${encodeURIComponent(pageOneBody.page.cursor ?? '')}`,
      headers: cookieHeader(actorA),
    });
    const pageTwoBody = pageTwo.json<{
      items: Array<{ id: string }>;
      page: { has_more: boolean };
      unread_count: number;
    }>();
    expect(pageTwoBody.items.map((item) => item.id)).toEqual([aRead.id]);
    expect(pageTwoBody.page.has_more).toBe(false);
    expect(pageTwoBody.unread_count).toBe(2);
    expect(pageOneBody.items.map((item) => item.id)).not.toContain(pageTwoBody.items[0]?.id);

    const foreignRead = await app.inject({
      method: 'POST',
      url: `/notifications/${bRow.id}/read`,
      headers: cookieHeader(actorA),
    });
    const foreignArchive = await app.inject({
      method: 'POST',
      url: `/notifications/${bRow.id}/archive`,
      headers: cookieHeader(actorA),
    });
    const crossWorkspace = await app.inject({
      method: 'POST',
      url: `/notifications/${cRow.id}/read`,
      headers: cookieHeader(actorA),
    });
    expect(foreignRead.statusCode).toBe(404);
    expect(foreignRead.json<{ code: string }>().code).toBe('not_found.record');
    expect(foreignArchive.statusCode).toBe(404);
    expect(crossWorkspace.statusCode).toBe(404);
    const unchangedB = await migrateDb.pool.query<{
      read_at: Date | null;
      archived_at: Date | null;
    }>('select read_at, archived_at from core.notifications where id = $1', [bRow.id]);
    expect(unchangedB.rows[0]).toEqual({ read_at: null, archived_at: null });

    const firstRead = await app.inject({
      method: 'POST',
      url: `/notifications/${aNewest.id}/read`,
      headers: cookieHeader(actorA),
    });
    const firstReadAt = firstRead.json<{ read_at: string | null }>().read_at;
    expect(firstRead.statusCode).toBe(200);
    expect(firstReadAt).toBeTruthy();
    const storedFirstRead = await migrateDb.pool.query<{ read_at: string }>(
      'select read_at::text from core.notifications where id = $1',
      [aNewest.id],
    );
    const secondRead = await app.inject({
      method: 'POST',
      url: `/notifications/${aNewest.id}/read`,
      headers: cookieHeader(actorA),
    });
    expect(secondRead.json<{ read_at: string | null }>().read_at).toBe(firstReadAt);
    const storedSecondRead = await migrateDb.pool.query<{ read_at: string }>(
      'select read_at::text from core.notifications where id = $1',
      [aNewest.id],
    );
    expect(storedSecondRead.rows[0]?.read_at).toBe(storedFirstRead.rows[0]?.read_at);

    const archiveRead = await app.inject({
      method: 'POST',
      url: `/notifications/${aNewest.id}/archive`,
      headers: cookieHeader(actorA),
    });
    expect(archiveRead.json<{ read_at: string | null }>().read_at).toBe(firstReadAt);

    const archiveUnread = await app.inject({
      method: 'POST',
      url: `/notifications/${aMiddle.id}/archive`,
      headers: cookieHeader(actorA),
    });
    expect(archiveUnread.statusCode).toBe(200);
    expect(
      archiveUnread.json<{ read_at: string | null; archived_at: string | null }>(),
    ).toMatchObject({ read_at: null });
    expect(archiveUnread.json<{ archived_at: string | null }>().archived_at).toBeTruthy();
    const afterArchive = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: cookieHeader(actorA),
    });
    expect(
      afterArchive.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id),
    ).not.toContain(aMiddle.id);
    const afterArchiveIncludingArchived = await app.inject({
      method: 'GET',
      url: '/notifications?include_archived=true',
      headers: cookieHeader(actorA),
    });
    expect(
      afterArchiveIncludingArchived
        .json<{ items: Array<{ id: string }> }>()
        .items.map((item) => item.id),
    ).toContain(aMiddle.id);

    const unknownId = await app.inject({
      method: 'POST',
      url: `/notifications/${randomUUID()}/read`,
      headers: cookieHeader(actorA),
    });
    expect(unknownId.statusCode).toBe(404);
    expect(unknownId.json<{ code: string }>().code).toBe('not_found.record');

    const invalidLimits = await Promise.all([
      app.inject({ method: 'GET', url: '/notifications?limit=0', headers: cookieHeader(actorA) }),
      app.inject({ method: 'GET', url: '/notifications?limit=101', headers: cookieHeader(actorA) }),
    ]);
    expect(invalidLimits.map((response) => response.statusCode)).toEqual([422, 422]);
    expect(invalidLimits.map((response) => response.json<{ code: string }>().code)).toEqual([
      'validation.failed',
      'validation.failed',
    ]);
    const invalidCursor = await app.inject({
      method: 'GET',
      url: '/notifications?cursor=not-a-cursor',
      headers: cookieHeader(actorA),
    });
    expect(invalidCursor.statusCode).toBe(422);
    expect(invalidCursor.json<{ code: string }>().code).toBe('validation.failed');
    const invalidId = await app.inject({
      method: 'POST',
      url: '/notifications/not-a-uuid/read',
      headers: cookieHeader(actorA),
    });
    expect(invalidId.statusCode).toBe(422);
    expect(invalidId.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('applies the 10-per-minute mutation tier per Actor', async () => {
    const row = await insertNotification(actorB, { createdAt: new Date().toISOString() });
    await migrateDb.pool.query('delete from core.rate_limits where key = $1 and route_group = $2', [
      `${actorB.workspaceId}:${actorB.id}`,
      'mutation',
    ]);

    const responses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: `/notifications/${row.id}/read`,
          headers: cookieHeader(actorB),
        }),
      );
    }
    expect(responses.slice(0, 10).every((response) => response.statusCode === 200)).toBe(true);
    expect(responses[10]?.statusCode).toBe(429);
    expect(responses[10]?.json<{ code: string }>().code).toBe('rate_limited.actor');
  });
});
