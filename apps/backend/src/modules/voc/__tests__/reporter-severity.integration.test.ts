import { randomUUID } from 'node:crypto';
import { vocDetailEnvelopeSchema, vocListItemSchema } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { cleanupResponsibilityFailures } from '../../../test-support/responsibility-fixtures.js';
import { paragraphDoc } from '../../../test-support/rich-content-fixtures.js';
import {
  cleanupTestActorsByExternalIdPrefix,
  insertVocDirectly,
} from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const PREFIX = 'it-1173-severity';
const personas = ['reporter', 'denied-admin', 'operator-reporter', 'operator'] as const;
type Persona = (typeof personas)[number];

describe.skipIf(!APP_URL || !MIGRATE_URL || !WORKSPACE_ID)(
  'Reporter severity wire projection (#1173)',
  () => {
    let handle: DbHandle;
    let app: FastifyInstance;
    let ms: string;
    let otherMs: string;
    let otherVoc: string;
    const actors = {} as Record<Persona, string>;
    const cookies = {} as Record<Persona, string>;
    const vocs = {} as Record<Persona, string>;
    const created: string[] = [];
    const headers = (persona: Persona) => ({
      cookie: `${SESSION_COOKIE_NAME}=${cookies[persona]}`,
      'idempotency-key': randomUUID(),
    });
    const get = (persona: Persona, url: string) =>
      app.inject({ method: 'GET', url, headers: headers(persona) });
    const checkSeverity = (
      body: Record<string, unknown>,
      hidden: boolean,
      expected: unknown = 'high',
    ) => {
      expect(Object.hasOwn(body, 'severity')).toBe(!hidden);
      if (!hidden) {
        expect(body.severity).toBe(expected);
      }
    };
    beforeAll(async () => {
      process.env.NODE_ENV = 'test';
      handle = createDb(APP_URL);
      app = await buildServer({ config: loadConfig(), dbHandle: handle });
      await app.ready();
      for (const persona of personas) {
        const actor = await insertActorRow(handle, {
          workspaceId: WORKSPACE_ID,
          externalId: `${PREFIX}-${persona}`,
          roleLevel:
            persona === 'denied-admin' ? 'admin' : persona === 'reporter' ? 'user' : 'developer',
        });
        actors[persona] = actor.id;
        cookies[persona] = await loginAs(app, `${PREFIX}-${persona}`);
      }
      ms = await insertMsDirectly(handle, WORKSPACE_ID, PREFIX, '1173 severity');
      otherMs = await insertMsDirectly(handle, WORKSPACE_ID, `${PREFIX}-other`, '1173 allowed');
      otherVoc = (
        await insertVocDirectly(
          handle,
          WORKSPACE_ID,
          otherMs,
          actors['denied-admin'],
          `${PREFIX}-allowed-own`,
          { severity: 'medium' },
        )
      ).id;
      created.push(otherVoc);
      for (const capability of ['voc.read', 'voc.triage']) {
        await handle.pool.query(
          `insert into permission.permission_denies
        (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id)
        values ($1,$2,$3,$4,'1173 regression',$2)`,
          [WORKSPACE_ID, actors['denied-admin'], capability, ms],
        );
      }
      for (const persona of ['operator-reporter', 'operator'] as const) {
        await grantCapability(
          handle,
          WORKSPACE_ID,
          actors[persona],
          'voc.read',
          ms,
          actors['denied-admin'],
        );
      }
      for (const persona of personas) {
        vocs[persona] = (
          await insertVocDirectly(
            handle,
            WORKSPACE_ID,
            ms,
            persona === 'operator' ? actors.reporter : actors[persona],
            `${PREFIX}-${persona}`,
            { severity: 'high' },
          )
        ).id;
      }
    });
    beforeEach(async () => {
      await handle.pool.query('delete from core.rate_limits where key = any($1::text[])', [
        Object.values(actors).map((id) => `${WORKSPACE_ID}:${id}`),
      ]);
    });
    afterAll(async () => {
      await handle.pool.query('delete from voc.vocs where id = any($1::uuid[])', [
        [...Object.values(vocs), ...created],
      ]);
      for (const table of ['permission_grants', 'permission_denies']) {
        await handle.pool.query(
          `delete from permission.${table} where actor_id = any($1::uuid[])`,
          [Object.values(actors)],
        );
      }
      await cleanupResponsibilityFailures(WORKSPACE_ID, PREFIX);
      await handle.pool.query('delete from core.rate_limits where key = any($1::text[])', [
        Object.values(actors).map((id) => `${WORKSPACE_ID}:${id}`),
      ]);
      await cleanupTestActorsByExternalIdPrefix(handle, WORKSPACE_ID, PREFIX);
      await deleteRecoveryFixtureParents(
        handle,
        'delete from core.managed_systems where id = any($1::uuid[])',
        [[ms, otherMs]],
      );
      await app.close();
      await handle.close();
    });

    it.each(personas)(
      '%s: raw list/detail/edit/reply/create respect the reporter arm',
      async (persona) => {
        const hidden = persona === 'reporter' || persona === 'denied-admin';
        const id = vocs[persona];
        const list = await get(
          persona,
          `/vocs?view=${persona === 'operator' ? 'inbox' : 'my'}&limit=100`,
        );
        expect(list.statusCode).toBe(200);
        const row = list.json().items.find((item: { id: string }) => item.id === id);
        expect(row).toBeDefined();
        checkSeverity(row, hidden);
        checkSeverity(vocListItemSchema.parse(row), hidden);
        if (persona === 'denied-admin') {
          const allowedRow = list.json().items.find((item: { id: string }) => item.id === otherVoc);
          expect(allowedRow).toBeDefined();
          checkSeverity(allowedRow, false, 'medium');
        }
        const detail = await get(persona, `/vocs/${id}`);
        expect(detail.statusCode).toBe(200);
        checkSeverity(detail.json(), hidden);
        checkSeverity(vocDetailEnvelopeSchema.parse(detail.json()), hidden);
        if (persona !== 'operator') {
          for (const title of [detail.json().title, `${PREFIX}-${persona}-edited`]) {
            const current = await get(persona, `/vocs/${id}`);
            expect(current.statusCode).toBe(200);
            const edit = await app.inject({
              method: 'PATCH',
              url: `/vocs/${id}/description`,
              headers: { ...headers(persona), 'if-match': current.json().updated_at },
              payload: { title },
            });
            expect(edit.statusCode).toBe(200);
            checkSeverity(edit.json(), hidden);
          }
          const reply = await app.inject({
            method: 'POST',
            url: `/vocs/${id}/reporter-replies`,
            headers: headers(persona),
            payload: { body_rich_content: paragraphDoc('Reporter reply') },
          });
          expect(reply.statusCode).toBe(201);
          checkSeverity(reply.json().voc, hidden);
        }
        const create = await app.inject({
          method: 'POST',
          url: '/vocs',
          headers: headers(persona),
          payload: {
            primary_managed_system_id: ms,
            title: `${PREFIX}-created-${persona}`,
            source_context: 'direct_use',
            description_rich_content: paragraphDoc('Created description'),
          },
        });
        expect(create.statusCode).toBe(201);
        created.push(create.json().id);
        checkSeverity(create.json(), hidden, null);
      },
    );

    it.each(['reporter', 'operator-reporter'] as const)(
      '%s cannot infer severity through My VOC queries',
      async (persona) => {
        for (const [field, value] of [
          ['filter.severity', 'high'],
          ['sort', 'severity:desc'],
          ['tab', 'high'],
          ['tab', 'high-no-link'],
        ]) {
          const response = await get(persona, `/vocs?view=my&${field}=${value}`);
          expect(response.statusCode).toBe(422);
          expect(response.json()).toMatchObject({
            code: 'validation.failed',
            detail: { fields: [{ path: [field], code: 'invalid_for_view' }] },
          });
          const inbox = await get('operator', `/vocs?view=inbox&${field}=${value}`);
          expect(inbox.statusCode).toBe(200);
        }
      },
    );

    it('denied non-owner retains exact not-found detail/conversation', async () => {
      for (const path of [`/vocs/${vocs.reporter}`, `/vocs/${vocs.reporter}/conversation`]) {
        const response = await get('denied-admin', path);
        expect(response.statusCode).toBe(404);
        expect(response.json().code).toBe('not_found.record');
      }
    });
  },
);
