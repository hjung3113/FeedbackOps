// Remaining blank rich-content route contracts (#344).

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import {
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  insertVocDirectly,
  loginAs,
  paragraphDoc,
  uid,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);
const SLUG_PREFIX = 'it-blank-rich';

const blankDoc = paragraphDoc('   ');

async function insertReporterActor(
  dbHandle: DbHandle,
  suffix: string,
): Promise<{ id: string; externalId: string }> {
  const externalId = `mock-user-blank-rich-${suffix}`;
  const result = await dbHandle.pool.query<{ id: string }>(
    `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $4, 'user', 'internal_member') returning id`,
    [WORKSPACE_ID, externalId, `${suffix}@local`, `Blank rich ${suffix}`],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('failed to insert reporter');
  return { id, externalId };
}

describe.skipIf(!runIntegration)(
  'remaining rich-content surfaces reject blank bodies (#344)',
  () => {
    let app: FastifyInstance;
    let dbHandle: DbHandle;
    let adminActorId: string;

    function request(
      cookie: string,
      method: 'POST' | 'PATCH',
      url: string,
      payload: Record<string, unknown>,
      ifMatch?: string,
    ) {
      return app.inject({
        method,
        url,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
          ...(ifMatch ? { 'if-match': ifMatch } : {}),
        },
        payload,
      });
    }

    async function setupReporter(suffix: string) {
      const reporter = await insertReporterActor(dbHandle, suffix);
      const cookie = await loginAs(app, reporter.externalId);
      const msId = await insertMsDirectly(
        dbHandle,
        WORKSPACE_ID,
        `${uid(SLUG_PREFIX)}-${suffix}`,
        suffix,
      );
      const voc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporter.id, suffix);
      return { cookie, voc };
    }

    async function setupDeveloper(suffix: string) {
      const developer = await insertDevActor(dbHandle, WORKSPACE_ID, `blank-rich-${suffix}`);
      const cookie = await loginAs(app, developer.externalId);
      const reporter = await insertReporterActor(dbHandle, `${suffix}-reporter`);
      const msId = await insertMsDirectly(
        dbHandle,
        WORKSPACE_ID,
        `${uid(SLUG_PREFIX)}-${suffix}`,
        suffix,
      );
      await grantCapability(dbHandle, WORKSPACE_ID, developer.id, 'voc.triage', msId, adminActorId);
      const voc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporter.id, suffix);
      return { cookie, voc };
    }

    beforeAll(async () => {
      process.env.NODE_ENV = 'test';
      dbHandle = createDb(APP_URL);
      app = await buildServer({ config: loadConfig(), dbHandle });
      await app.ready();
      const admin = await dbHandle.pool.query<{ id: string }>(
        `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
        [WORKSPACE_ID],
      );
      adminActorId = admin.rows[0]?.id ?? '';
      if (!adminActorId) throw new Error('mock-admin-1 not found');
    });

    afterAll(async () => {
      if (MIGRATE_URL) {
        const ops = createDb(MIGRATE_URL);
        try {
          await ops.pool.query(
            `delete from core.audit_log where subject_id in (
             select v.id from voc.vocs v join core.managed_systems ms on ms.id = v.primary_managed_system_id
             where ms.slug like $1
           )`,
            [`${SLUG_PREFIX}%`],
          );
        } finally {
          await ops.close();
        }
      }
      await dbHandle.pool.query(
        'delete from voc.vocs where primary_managed_system_id in (select id from core.managed_systems where slug like $1)',
        [`${SLUG_PREFIX}%`],
      );
      await dbHandle.pool.query(
        `delete from permission.permission_grants where actor_id in (select id from core.actors where external_id like 'mock-%blank-rich%')`,
      );
      await dbHandle.pool.query(
        `delete from core.sessions where actor_id in (select id from core.actors where external_id like 'mock-%blank-rich%')`,
      );
      // Every request in this suite sends an Idempotency-Key, and those rows FK
      // to the actor. They must go before the actors do.
      await dbHandle.pool.query(
        `delete from core.idempotency_keys where actor_id in (select id from core.actors where external_id like 'mock-%blank-rich%')`,
      );
      await dbHandle.pool.query(
        `delete from core.actors where external_id like 'mock-%blank-rich%'`,
      );
      await dbHandle.pool.query('delete from core.managed_systems where slug like $1', [
        `${SLUG_PREFIX}%`,
      ]);
      await app?.close();
      await dbHandle?.close();
    });

    it('reporter reply rejects blank content and stores a normal reply', async () => {
      const { cookie, voc } = await setupReporter('reply');
      const blank = await request(cookie, 'POST', `/vocs/${voc.id}/reporter-replies`, {
        body_rich_content: blankDoc,
      });
      expect(blank.statusCode).toBe(422);
      expect(blank.json<{ code: string }>().code).toBe('validation.failed');
      const normal = await request(cookie, 'POST', `/vocs/${voc.id}/reporter-replies`, {
        body_rich_content: paragraphDoc('reply'),
      });
      expect(normal.statusCode).toBe(201);
      const stored = await dbHandle.pool.query(
        'select id from voc.voc_reporter_replies where id = $1',
        [normal.json<{ reporter_reply: { id: string } }>().reporter_reply.id],
      );
      expect(stored.rowCount).toBe(1);
    });

    it('public update rejects blank content and stores a normal update', async () => {
      const { cookie, voc } = await setupDeveloper('update');
      const body = {
        skip_public_update: false as const,
        next_reporter_facing_status: 'received' as const,
      };
      const blank = await request(cookie, 'POST', `/vocs/${voc.id}/public-updates`, {
        ...body,
        body_rich_content: blankDoc,
      });
      expect(blank.statusCode).toBe(422);
      expect(blank.json<{ code: string }>().code).toBe('validation.failed');
      const normal = await request(cookie, 'POST', `/vocs/${voc.id}/public-updates`, {
        ...body,
        body_rich_content: paragraphDoc('update'),
      });
      expect(normal.statusCode).toBe(201);
      const stored = await dbHandle.pool.query(
        'select id from voc.voc_public_updates where id = $1',
        [normal.json<{ public_update: { id: string } }>().public_update.id],
      );
      expect(stored.rowCount).toBe(1);
    });

    it('internal comment rejects blank content and stores a normal comment', async () => {
      const { cookie, voc } = await setupDeveloper('comment');
      const blank = await request(cookie, 'POST', `/vocs/${voc.id}/internal-comments`, {
        body_rich_content: blankDoc,
      });
      expect(blank.statusCode).toBe(422);
      expect(blank.json<{ code: string }>().code).toBe('validation.failed');
      const normal = await request(cookie, 'POST', `/vocs/${voc.id}/internal-comments`, {
        body_rich_content: paragraphDoc('comment'),
      });
      expect(normal.statusCode).toBe(201);
      const stored = await dbHandle.pool.query(
        'select id from voc.voc_internal_comments where id = $1',
        [normal.json<{ internal_comment: { id: string } }>().internal_comment.id],
      );
      expect(stored.rowCount).toBe(1);
    });

    it('description edit rejects blank content and stores a normal description', async () => {
      const { cookie, voc } = await setupReporter('description');
      // If-Match must come from the API, not from the SQL seed: `updated_at::text`
      // is postgres text ("2026-08-05 03:20:00+00"), not the ISO string the route
      // compares against, and every request would 409 stale_write.
      const seeded = await app.inject({
        method: 'GET',
        url: `/vocs/${voc.id}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
      });
      expect(seeded.statusCode).toBe(200);
      const etag = seeded.json<{ updated_at: string }>().updated_at;

      const blank = await request(
        cookie,
        'PATCH',
        `/vocs/${voc.id}/description`,
        { description_rich_content: blankDoc },
        etag,
      );
      expect(blank.statusCode).toBe(422);
      expect(blank.json<{ code: string }>().code).toBe('validation.failed');
      const normal = await request(
        cookie,
        'PATCH',
        `/vocs/${voc.id}/description`,
        { description_rich_content: paragraphDoc('description') },
        etag,
      );
      expect(normal.statusCode).toBe(200);
      const stored = await dbHandle.pool.query<{ description_rich_content: unknown }>(
        'select description_rich_content from voc.vocs where id = $1',
        [voc.id],
      );
      expect(stored.rows[0]?.description_rich_content).toEqual(paragraphDoc('description'));
    });
  },
);
