// Conversation visibility-boundary integration tests — Slice 7a-3 #181.
//
// The app handle is deliberately low privilege. Fixture writes and persistence
// checks use fops_migrate; the append-only assertions use fops_app directly.
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  insertInternalComment,
  insertMsDirectly,
  insertPublicUpdate,
  insertReporterReply,
  insertVocDirectly,
  loginAs,
  uid,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-conv-visibility-181';

type TimelineItem = { id: string; kind: 'public_update' | 'reporter_reply' | 'internal_comment' };

describe.skipIf(!runIntegration)('conversation visibility boundaries (#181)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterCookie: string;
  let reporterId: string;
  let operatorCookie: string;
  let operatorId: string;
  let outOfScopeCookie: string;
  let outOfScopeActorId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    reporterCookie = await loginAs(app, 'mock-user-1');
    const actors = await migrateHandle.pool.query<{ external_id: string; id: string }>(
      `select external_id, id from core.actors
        where workspace_id = $1
          and external_id in ('mock-admin-1', 'mock-user-1')`,
      [WORKSPACE_ID],
    );
    const actorIds = new Map(actors.rows.map((actor) => [actor.external_id, actor.id]));
    adminActorId = actorIds.get('mock-admin-1') ?? '';
    reporterId = actorIds.get('mock-user-1') ?? '';
    if (!adminActorId || !reporterId) throw new Error('required mock actors not found');

    operatorId = await insertDeveloper('operator');
    outOfScopeActorId = await insertDeveloper('out-of-scope');
    operatorCookie = await loginAs(app, 'mock-vb-181-operator');
    outOfScopeCookie = await loginAs(app, 'mock-vb-181-out-of-scope');
  });

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    // Sessions must go before the actors they reference.
    await migrateHandle?.pool.query(
      `delete from core.sessions where actor_id = any($1::uuid[])`,
      [[operatorId, outOfScopeActorId]],
    );
    await migrateHandle?.pool.query(
      `delete from permission.permission_grants where actor_id = any($1::uuid[])`,
      [[operatorId, outOfScopeActorId]],
    );
    await migrateHandle?.pool.query(`delete from core.actors where id = any($1::uuid[])`, [
      [operatorId, outOfScopeActorId],
    ]);
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function insertDeveloper(suffix: string): Promise<string> {
    const externalId = `mock-vb-181-${suffix}`;
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $4, 'developer', 'internal_member')
       returning id`,
      [WORKSPACE_ID, externalId, `${externalId}@local`, `Visibility Boundary ${suffix}`],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error(`could not create ${externalId}`);
    return id;
  }

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    // Conversation rows are explicitly first: the test proves their grants make
    // the app role unable to perform this teardown itself.
    for (const table of ['voc_internal_comments', 'voc_reporter_replies', 'voc_public_updates']) {
      await migrateHandle.pool.query(
        `delete from voc.${table}
          where voc_id in (
            select v.id from voc.vocs v
             join core.managed_systems ms on ms.id = v.primary_managed_system_id
            where ms.workspace_id = $1 and ms.slug like $2
          )`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
    }
    await migrateHandle.pool.query(
      `delete from permission.permission_grants
        where actor_id = $1
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $2 and slug like $3
          )`,
      [operatorId, WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from voc.vocs
        where primary_managed_system_id in (
          select id from core.managed_systems where workspace_id = $1 and slug like $2
        )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.managed_systems where workspace_id = $1 and slug like $2`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
  }

  async function seedConversation(): Promise<{ vocId: string; ids: Record<TimelineItem['kind'], string[]> }> {
    const msId = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Conversation Visibility Boundary MS',
    );
    await migrateHandle.pool.query(
      `insert into permission.permission_grants
         (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
       values ($1, $2, 'voc.read', $3, $4), ($1, $2, 'voc.triage', $3, $4)`,
      [WORKSPACE_ID, operatorId, msId, adminActorId],
    );
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'Conversation visibility boundary VOC',
    );
    const ids = {
      public_update: [
        await insertPublicUpdate(migrateHandle, voc.id, adminActorId),
        await insertPublicUpdate(migrateHandle, voc.id, adminActorId),
      ],
      reporter_reply: [
        await insertReporterReply(migrateHandle, voc.id, reporterId),
        await insertReporterReply(migrateHandle, voc.id, reporterId),
      ],
      internal_comment: [
        await insertInternalComment(migrateHandle, voc.id, adminActorId),
        await insertInternalComment(migrateHandle, voc.id, adminActorId),
      ],
    };

    // Non-vacuous setup: prove every seeded row persisted through the migrate role.
    for (const [kind, table] of Object.entries({
      public_update: 'voc_public_updates',
      reporter_reply: 'voc_reporter_replies',
      internal_comment: 'voc_internal_comments',
    }) as Array<[TimelineItem['kind'], string]>) {
      const count = await migrateHandle.pool.query<{ count: string }>(
        `select count(*)::text as count from voc.${table} where voc_id = $1`,
        [voc.id],
      );
      expect(Number(count.rows[0]?.count)).toBe(ids[kind].length);
    }
    return { vocId: voc.id, ids };
  }

  function cookie(value: string): Record<string, string> {
    return { cookie: `${SESSION_COOKIE_NAME}=${value}` };
  }

  it('reporter receives public/reply rows but zero internal comments on conversation and inline-detail reads', async () => {
    const { vocId, ids } = await seedConversation();

    const conversation = await app.inject({
      method: 'GET',
      url: `/vocs/${vocId}/conversation`,
      headers: cookie(reporterCookie),
    });
    expect(conversation.statusCode).toBe(200);
    const page = conversation.json<{ items: TimelineItem[] }>();
    expect(page.items.filter((item) => item.kind === 'internal_comment')).toHaveLength(0);
    expect(page.items.map((item) => item.id)).toEqual(expect.arrayContaining([...ids.public_update, ...ids.reporter_reply]));

    const detail = await app.inject({ method: 'GET', url: `/vocs/${vocId}`, headers: cookie(reporterCookie) });
    expect(detail.statusCode).toBe(200);
    const inline = detail.json<{ conversation_timeline: TimelineItem[] }>().conversation_timeline;
    expect(inline.filter((item) => item.kind === 'internal_comment')).toHaveLength(0);
    expect(inline.map((item) => item.id)).toEqual(expect.arrayContaining([...ids.public_update, ...ids.reporter_reply]));

    const internalOnly = await app.inject({
      method: 'GET',
      url: `/vocs/${vocId}/conversation?kind=internal_comment`,
      headers: cookie(reporterCookie),
    });
    // Current contract: a Reporter may request the filter, but sees an empty page.
    expect(internalOnly.statusCode).toBe(200);
    expect(internalOnly.json<{ items: TimelineItem[] }>().items).toEqual([]);
  });

  it('out-of-scope developer receives 404 to prevent a conversation existence probe', async () => {
    const { vocId } = await seedConversation();
    const response = await app.inject({
      method: 'GET',
      url: `/vocs/${vocId}/conversation`,
      headers: cookie(outOfScopeCookie),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ code: string }>().code).toBe('not_found.record');
  });

  it('in-scope triage operator sees three disjoint, correctly filtered timelines', async () => {
    const { vocId, ids } = await seedConversation();
    const kinds: TimelineItem['kind'][] = ['public_update', 'reporter_reply', 'internal_comment'];
    const returned = new Map<TimelineItem['kind'], TimelineItem[]>();

    for (const kind of kinds) {
      const response = await app.inject({
        method: 'GET',
        url: `/vocs/${vocId}/conversation?kind=${kind}`,
        headers: cookie(operatorCookie),
      });
      expect(response.statusCode).toBe(200);
      const items = response.json<{ items: TimelineItem[] }>().items;
      expect(items).toHaveLength(ids[kind].length);
      expect(items.every((item) => item.kind === kind)).toBe(true);
      expect(items.map((item) => item.id)).toEqual(expect.arrayContaining(ids[kind]));
      returned.set(kind, items);
    }

    const idsByKind = kinds.map((kind) => new Set(returned.get(kind)?.map((item) => item.id)));
    expect([...idsByKind[0]!].some((id) => idsByKind[1]?.has(id) || idsByKind[2]?.has(id))).toBe(false);
    expect([...idsByKind[1]!].some((id) => idsByKind[2]?.has(id))).toBe(false);
  });

  it.each([
    ['voc_public_updates', 'public_update'],
    ['voc_reporter_replies', 'reporter_reply'],
    ['voc_internal_comments', 'internal_comment'],
  ] as const)('fops_app cannot UPDATE or DELETE append-only %s', async (table, kind) => {
    const { ids } = await seedConversation();
    const id = ids[kind][0];
    await expect(
      appHandle.pool.query(`update voc.${table} set created_at = created_at where id = $1`, [id]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(appHandle.pool.query(`delete from voc.${table} where id = $1`, [id])).rejects.toMatchObject({
      code: '42501',
    });

    const persisted = await migrateHandle.pool.query<{ count: string }>(
      `select count(*)::text as count from voc.${table} where id = $1`,
      [id],
    );
    expect(Number(persisted.rows[0]?.count)).toBe(1);
  });
});
