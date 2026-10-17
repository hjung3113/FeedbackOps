// VOC write responses follow the read matrix (#1187).
//
// An actor who may WRITE to a VOC (voc.triage) but may not read it in full
// (no voc.read, or an explicit voc.read deny) must get the VocSummaryEnvelope
// back from every write route that returns a VOC payload — never the title,
// description, attachments or prior conversation. Candidate apply is covered in
// public-update-review-candidates.integration.test.ts (it needs a released Task).
// Reporter Reply / description edit (reporter-only) keep their suites.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { vocSummaryEnvelopeSchema, vocSummarySelfDecisionSchema } from '@fops/shared';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow, insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { denyCapability, grantCapability } from '../../../test-support/permissions-fixtures.js';
import { paragraphDoc } from '../../../test-support/rich-content-fixtures.js';
import { cleanupReadTestTables, insertVocDirectly } from '../../../test-support/voc-fixtures.js';
import { insertLinkedAttachment } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = 'it-1187';

const SUMMARY_KEYS = [
  'created_at',
  'display_id',
  'id',
  'permission_decisions',
  'primary_managed_system_id',
  'reporter_facing_status',
];

type Markers = {
  title: string;
  description: string;
  attachment: string;
  publicBody: string;
  internalBody: string;
  newBody: string;
};

type Seeded = { vocId: string; markers: Markers };

type WriteRoute = {
  name: string;
  status: number;
  request: (
    seeded: Seeded,
    ifMatch: string,
  ) => { method: string; url: string; payload: object; ifMatch?: string };
  // Picks the VOC payload out of the response body.
  vocOf: (body: Record<string, unknown>) => Record<string, unknown>;
  persisted: (handle: DbHandle, seeded: Seeded, before: string) => Promise<void>;
};

const PATCH_CONFIRM = {
  triage_state: 'triaged',
  severity: 'medium',
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
};
const PATCH_NOOP = {
  triage_state: 'untriaged',
  severity: null,
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
};

async function vocRow(handle: DbHandle, vocId: string) {
  const res = await handle.pool.query<{
    triage_state: string;
    severity: string | null;
    postponed: boolean;
    updated_at: Date;
  }>(
    `select triage_state, severity, triage_state_review_postponed_at is not null as postponed,
            updated_at
       from voc.vocs where id = $1`,
    [vocId],
  );
  const row = res.rows[0];
  if (!row) throw new Error('voc row missing');
  return row;
}

async function count(handle: DbHandle, table: string, vocId: string): Promise<number> {
  const res = await handle.pool.query<{ n: string }>(
    `select count(*)::text as n from voc.${table} where voc_id = $1`,
    [vocId],
  );
  return Number(res.rows[0]?.n);
}

const WRITE_ROUTES: WriteRoute[] = [
  {
    name: 'POST public-updates',
    status: 201,
    request: (s) => ({
      method: 'POST',
      url: `/vocs/${s.vocId}/public-updates`,
      payload: {
        skip_public_update: false,
        body_rich_content: paragraphDoc(s.markers.newBody),
        next_reporter_facing_status: 'received',
      },
    }),
    vocOf: (body) => body.voc as Record<string, unknown>,
    persisted: async (h, s) => expect(await count(h, 'voc_public_updates', s.vocId)).toBe(2),
  },
  {
    name: 'POST internal-comments',
    status: 201,
    request: (s) => ({
      method: 'POST',
      url: `/vocs/${s.vocId}/internal-comments`,
      payload: { body_rich_content: paragraphDoc(s.markers.newBody) },
    }),
    vocOf: (body) => body.voc as Record<string, unknown>,
    persisted: async (h, s) => expect(await count(h, 'voc_internal_comments', s.vocId)).toBe(2),
  },
  {
    name: 'PATCH /vocs/:id (confirm, changed fields)',
    status: 200,
    request: (s, ifMatch) => ({
      method: 'PATCH',
      url: `/vocs/${s.vocId}`,
      payload: PATCH_CONFIRM,
      ifMatch,
    }),
    vocOf: (body) => body,
    persisted: async (h, s) => {
      const row = await vocRow(h, s.vocId);
      expect(row.triage_state).toBe('triaged');
      expect(row.severity).toBe('medium');
    },
  },
  {
    name: 'PATCH /vocs/:id (no-op diff)',
    status: 200,
    request: (s, ifMatch) => ({
      method: 'PATCH',
      url: `/vocs/${s.vocId}`,
      payload: PATCH_NOOP,
      ifMatch,
    }),
    vocOf: (body) => body,
    persisted: async (h, s, before) => {
      const row = await vocRow(h, s.vocId);
      expect(row.triage_state).toBe('untriaged');
      expect(row.updated_at.toISOString()).toBe(before);
    },
  },
  {
    name: 'PATCH /vocs/:id (postpone_review)',
    status: 200,
    request: (s, ifMatch) => ({
      method: 'PATCH',
      url: `/vocs/${s.vocId}`,
      payload: { postpone_review: true },
      ifMatch,
    }),
    vocOf: (body) => body,
    persisted: async (h, s) => expect((await vocRow(h, s.vocId)).postponed).toBe(true),
  },
];

describe.skipIf(!runIntegration)('VOC write responses follow the read matrix (#1187)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminActorId: string;
  let reporterId: string;
  let msId: string;
  const cookies: Record<string, string> = {};

  async function seedVoc(): Promise<Seeded> {
    const tag = randomUUID().slice(0, 8);
    const markers: Markers = {
      title: `MK-title-${tag}`,
      description: `MK-description-${tag}`,
      attachment: `MK-attachment-${tag}.png`,
      publicBody: `MK-public-${tag}`,
      internalBody: `MK-internal-${tag}`,
      newBody: `MK-new-${tag}`,
    };
    const voc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reporterId, markers.title);
    await dbHandle.pool.query(
      'update voc.vocs set description_rich_content = $1::jsonb where id = $2',
      [JSON.stringify(paragraphDoc(markers.description)), voc.id],
    );
    await insertLinkedAttachment(
      dbHandle,
      WORKSPACE_ID,
      { kind: 'voc', vocId: voc.id },
      reporterId,
      {
        name: markers.attachment,
      },
    );
    await dbHandle.pool.query(
      `insert into voc.voc_public_updates
         (voc_id, actor_id, body_rich_content, reporter_facing_status_before,
          reporter_facing_status_after, skip_public_update)
       values ($1, $2, $3::jsonb, 'received', 'received', false)`,
      [voc.id, adminActorId, JSON.stringify(paragraphDoc(markers.publicBody))],
    );
    await dbHandle.pool.query(
      `insert into voc.voc_internal_comments (voc_id, actor_id, body_rich_content)
       values ($1, $2, $3::jsonb)`,
      [voc.id, adminActorId, JSON.stringify(paragraphDoc(markers.internalBody))],
    );
    return { vocId: voc.id, markers };
  }

  async function send(actor: string, route: WriteRoute, seeded: Seeded) {
    const before = (await vocRow(dbHandle, seeded.vocId)).updated_at.toISOString();
    const req = route.request(seeded, before);
    const headers: Record<string, string> = {
      cookie: `${SESSION_COOKIE_NAME}=${cookies[actor]}`,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      'workspace-id': WORKSPACE_ID,
    };
    if (req.ifMatch) headers['if-match'] = req.ifMatch;
    const res = await app.inject({
      method: req.method as 'POST' | 'PATCH',
      url: req.url,
      headers,
      payload: req.payload,
    });
    return { res, before };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    const adminRow = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    adminActorId = adminRow.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('mock-admin-1 not found');
    cookies.admin = await loginAs(app, 'mock-admin-1');

    // Cleaned by cleanupReadTestTables through the `mock-dev-read-` prefix.
    const reporter = await insertActorRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      externalId: 'mock-dev-read-1187-reporter',
      roleLevel: 'user',
    });
    reporterId = reporter.id;

    msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), '1187 MS-A');

    const deniedAdmin = await insertActorRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      externalId: 'mock-dev-read-1187-denied-admin',
      roleLevel: 'admin',
    });
    await denyCapability(dbHandle, WORKSPACE_ID, deniedAdmin.id, 'voc.read', msId, adminActorId);
    cookies['admin-read-denied'] = await loginAs(app, 'mock-dev-read-1187-denied-admin');

    const triageOnly = await insertDevActor(dbHandle, WORKSPACE_ID, '1187-triage-only');
    await grantCapability(dbHandle, WORKSPACE_ID, triageOnly.id, 'voc.triage', msId, adminActorId);
    cookies['developer-triage-only'] = await loginAs(app, triageOnly.externalId);

    const fullReader = await insertDevActor(dbHandle, WORKSPACE_ID, '1187-full-reader');
    await grantCapability(dbHandle, WORKSPACE_ID, fullReader.id, 'voc.triage', msId, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, fullReader.id, 'voc.read', msId, adminActorId);
    cookies['developer-full-reader'] = await loginAs(app, fullReader.externalId);
  });

  beforeEach(async () => {
    // Every case posts as one of three fixture actors; reset their rate-limit
    // buckets (`<workspace_id>:<actor_id>` keys) and idempotency cache.
    await dbHandle.pool.query('delete from core.rate_limits');
    await dbHandle.pool.query('delete from core.idempotency_keys');
  });

  afterAll(async () => {
    await migrateHandle?.pool.query(
      `delete from core.audit_log where workspace_id = $1 and subject_id in (
         select id from voc.vocs where primary_managed_system_id in (
           select id from core.managed_systems where slug like $2 and workspace_id = $1))`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  describe.each(['admin-read-denied', 'developer-triage-only'])('%s', (actor) => {
    it.each(WRITE_ROUTES.map((route) => [route.name, route] as const))(
      '%s succeeds and returns only the VocSummaryEnvelope',
      async (_name, route) => {
        const seeded = await seedVoc();
        const { res, before } = await send(actor, route, seeded);

        // Success first: validation, permission or rate limiting must not fake a pass.
        expect(res.statusCode, res.body).toBe(route.status);
        await route.persisted(dbHandle, seeded, before);

        const voc = route.vocOf(res.json());
        expect(Object.keys(voc).sort()).toEqual(SUMMARY_KEYS);
        const parsed = vocSummaryEnvelopeSchema.parse(voc);
        expect(parsed.id).toBe(seeded.vocId);
        expect(() =>
          vocSummarySelfDecisionSchema.parse(parsed.permission_decisions._self),
        ).not.toThrow();

        const serialized = JSON.stringify(res.json());
        // newBody is the writer's own input, echoed in the entry the write returns.
        const { newBody: _echoed, ...existing } = seeded.markers;
        for (const marker of Object.values(existing)) {
          expect(serialized).not.toContain(marker);
        }
      },
    );
  });

  describe('full reader (voc.read + voc.triage on MS-A)', () => {
    it.each(WRITE_ROUTES.slice(0, 2).map((route) => [route.name, route] as const))(
      '%s keeps the detail envelope with title and prior entries',
      async (_name, route) => {
        const seeded = await seedVoc();
        const { res } = await send('developer-full-reader', route, seeded);
        expect(res.statusCode, res.body).toBe(route.status);
        const voc = route.vocOf(res.json());
        expect(voc.title).toBe(seeded.markers.title);
        const timeline = JSON.stringify(voc.conversation_timeline);
        expect(timeline).toContain(seeded.markers.publicBody);
        expect(timeline).toContain(seeded.markers.internalBody);
        expect(timeline).toContain(seeded.markers.newBody);
        expect(JSON.stringify(voc.attachments)).toContain(seeded.markers.attachment);
      },
    );

    it('PATCH keeps its flat VocEnvelope with title and description and no conversation', async () => {
      const seeded = await seedVoc();
      const route = WRITE_ROUTES[2] as WriteRoute;
      const { res } = await send('developer-full-reader', route, seeded);
      expect(res.statusCode, res.body).toBe(200);
      const voc = res.json<Record<string, unknown>>();
      expect(voc.title).toBe(seeded.markers.title);
      expect(JSON.stringify(voc.description_rich_content)).toContain(seeded.markers.description);
      expect(voc).not.toHaveProperty('conversation_timeline');
    });
  });
  it.each(['admin-read-denied', 'developer-triage-only', 'developer-full-reader'])(
    '%s: no-follow-up POST, DELETE and replay follow the existing read matrix',
    async (actor) => {
      const seeded = await seedVoc();
      await dbHandle.pool.query("update voc.vocs set severity='high' where id=$1", [seeded.vocId]);
      for (const method of ['POST', 'DELETE'] as const) {
        const key = randomUUID();
        const request = {
          method,
          url: `/vocs/${seeded.vocId}/no-follow-up`,
          headers: { cookie: `${SESSION_COOKIE_NAME}=${cookies[actor]}`, 'idempotency-key': key },
          ...(method === 'POST' ? { payload: { reason: '1226 private decision reason' } } : {}),
        };
        const response = await app.inject(request);
        expect(response.statusCode, response.body).toBe(200);
        expect((await app.inject(request)).json()).toEqual(response.json());
        if (actor === 'developer-full-reader') {
          expect(response.json().follow_up).toMatchObject({ can_withdraw: method === 'POST' });
        } else {
          expect(Object.keys(response.json()).sort()).toEqual(SUMMARY_KEYS);
          expect(response.body).not.toContain('1226 private decision reason');
          expect(response.json()).not.toHaveProperty('follow_up');
        }
      }
    },
  );
});
