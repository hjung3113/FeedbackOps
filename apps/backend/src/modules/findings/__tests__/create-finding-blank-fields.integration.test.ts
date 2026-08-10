// POST /vocs/:id/create-finding blank required-field contract (#368).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The migrate role is
// required for cleanup of append-only core.entity_links and core.audit_log rows.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  insertMsDirectly,
  insertVocDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-findings-blank-fields';

describe.skipIf(!runIntegration)(
  'POST /vocs/:id/create-finding blank required fields (#368)',
  () => {
    let dbHandle: DbHandle;
    let migrateHandle: DbHandle;
    let app: FastifyInstance;
    let adminCookie: string;
    let reporterActorId: string;

    beforeAll(async () => {
      process.env.NODE_ENV = 'test';
      dbHandle = createDb(APP_URL);
      migrateHandle = createDb(MIGRATE_URL);
      app = await buildServer({ config: loadConfig(), dbHandle });
      await app.ready();

      adminCookie = await loginAs(app, 'mock-admin-1');
      const actors = await dbHandle.pool.query<{ id: string }>(
        `select id from core.actors where workspace_id = $1 and external_id = 'mock-user-1'`,
        [WORKSPACE_ID],
      );
      reporterActorId = actors.rows[0]?.id ?? '';
      if (!reporterActorId) throw new Error('seed reporter actor not found');
    });

    beforeEach(async () => {
      await cleanupFixtures();
    });

    afterAll(async () => {
      await cleanupFixtures();
      await app?.close();
      await dbHandle?.close();
      await migrateHandle?.close();
    });

    async function cleanupFixtures(): Promise<void> {
      if (!migrateHandle) return;
      await migrateHandle.pool.query(
        `delete from core.entity_links
        where workspace_id = $1
          and relation_type = 'created_finding'
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
      await migrateHandle.pool.query(
        `delete from core.audit_log
        where workspace_id = $1
          and event_type in ('finding_created_from_voc', 'entity_link.created')`,
        [WORKSPACE_ID],
      );
      await migrateHandle.pool.query(
        `delete from finding.findings
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
      await migrateHandle.pool.query('delete from core.idempotency_keys');
      await migrateHandle.pool.query("delete from core.rate_limits where key like '127.0.0.%'");
      await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    }

    async function seedSource(): Promise<string> {
      const managedSystemId = await insertMsDirectly(
        dbHandle,
        WORKSPACE_ID,
        uid(SLUG_PREFIX),
        'Finding blank fields',
      );
      const voc = await insertVocDirectly(
        dbHandle,
        WORKSPACE_ID,
        managedSystemId,
        reporterActorId,
        'VOC with synthesis need',
      );
      return voc.id;
    }

    function postFinding(vocId: string, body: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: `/vocs/${vocId}/create-finding`,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        payload: body,
      });
    }

    it.each([
      ['title', { title: '   ', summary: 'Valid summary' }],
      ['summary', { title: 'Blank field finding', summary: '   ' }],
    ])('rejects a whitespace-only %s with no matching Finding row', async (field, body) => {
      const vocId = await seedSource();
      const res = await postFinding(vocId, { ...body, severity: 'medium' });

      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe('validation.failed');
      expect(res.json().detail?.fields?.[0]?.path).toEqual([field]);
      const rows = await dbHandle.pool.query(
        'select id from finding.findings where workspace_id = $1 and title = $2',
        [WORKSPACE_ID, body.title],
      );
      expect(rows.rowCount).toBe(0);
    });

    it('creates a Finding with trimmed title and summary', async () => {
      const vocId = await seedSource();
      const res = await postFinding(vocId, {
        title: '  유효한 제목  ',
        summary: '  유효한 요약  ',
        severity: 'medium',
      });

      expect(res.statusCode).toBe(201);
      const finding = res.json<{ id: string }>();
      const rows = await dbHandle.pool.query<{ title: string; summary: string }>(
        'select title, summary from finding.findings where id = $1',
        [finding.id],
      );
      expect(rows.rows[0]).toMatchObject({ title: '유효한 제목', summary: '유효한 요약' });
    });
  },
);
