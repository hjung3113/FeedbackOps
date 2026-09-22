import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import {
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  loginAs,
  paragraphDoc,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';
import { insertFindingRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = `it-progress-finding-${process.pid}-${Date.now()}-`;

describe.skipIf(!runIntegration)('Finding progress comments API (#377)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminActorId: string;
  let readActor: { id: string; externalId: string };
  let manageActor: { id: string; externalId: string };
  let readCookie: string;
  let manageCookie: string;
  let userCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    const admin = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = admin.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('seed admin actor not found');

    readActor = await insertDevActor(dbHandle, WORKSPACE_ID, uid('progress-finding-read'));
    manageActor = await insertDevActor(dbHandle, WORKSPACE_ID, uid('progress-finding-manage'));
    readCookie = await loginAs(app, readActor.externalId);
    manageCookie = await loginAs(app, manageActor.externalId);
    userCookie = await loginAs(app, 'mock-user-1');
  });

  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  beforeEach(async () => {
    const keys = [readActor?.id, manageActor?.id]
      .filter(Boolean)
      .map((actorId) => `${WORKSPACE_ID}:${actorId}`);
    await migrateHandle.pool.query('delete from core.rate_limits where key = any($1::text[])', [
      keys,
    ]);
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    const ids = [readActor?.id, manageActor?.id].filter(Boolean);
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where workspace_id = $1
          and (
            actor_id = any($2::uuid[])
            or subject_id in (
              select f.id from finding.findings f
              join core.managed_systems ms on ms.id = f.primary_managed_system_id
              where ms.slug like $3
            )
          )`,
      [WORKSPACE_ID, ids, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.idempotency_keys where actor_id = any($1::uuid[])',
      [ids],
    );
    await migrateHandle.pool.query(
      'delete from permission.permission_grants where actor_id = any($1::uuid[])',
      [ids],
    );
    await migrateHandle.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [
      ids,
    ]);
    await migrateHandle.pool.query(
      `delete from finding.findings where primary_managed_system_id in (
        select id from core.managed_systems where workspace_id = $1 and slug like $2
      )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.managed_systems where workspace_id = $1 and slug like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query('delete from core.actors where id = any($1::uuid[])', [ids]);
  }

  async function seedFinding(options: { archived?: boolean } = {}) {
    const slug = uid(SLUG_PREFIX);
    const ms = options.archived
      ? await migrateHandle.pool
          .query<{ id: string }>(
            `insert into core.managed_systems (workspace_id, slug, name, archived_at)
             values ($1, $2, $3, now()) returning id`,
            [WORKSPACE_ID, slug, 'Archived progress Finding MS'],
          )
          .then((result) => result.rows[0]?.id ?? '')
      : await insertMsDirectly(dbHandle, WORKSPACE_ID, slug, 'Progress Finding MS');
    if (!ms) throw new Error('managed system fixture was not created');

    await grantCapability(dbHandle, WORKSPACE_ID, readActor.id, 'finding.read', ms, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, manageActor.id, 'finding.read', ms, adminActorId);
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      manageActor.id,
      'finding.manage',
      ms,
      adminActorId,
    );
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: ms,
      sourceId: randomUUID(),
      createdBy: adminActorId,
    });
    return { ...finding, ms };
  }

  function commentsRequest(
    cookie: string,
    method: 'GET' | 'POST',
    findingId: string,
    payload?: Record<string, unknown>,
    query?: string,
    key = randomUUID(),
  ) {
    const headers: Record<string, string> = {
      cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
      'content-type': 'application/json',
    };
    if (method === 'POST') headers['idempotency-key'] = key;
    return app.inject({
      method,
      url: `/findings/${findingId}/comments${query ? `?${query}` : ''}`,
      headers,
      ...(payload ? { payload } : {}),
    });
  }

  function patchFinding(
    cookie: string,
    findingId: string,
    body: Record<string, unknown>,
    key = randomUUID(),
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/findings/${findingId}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: body,
    });
  }

  it('enforces Finding read/manage permissions and allows a manage comment', async () => {
    const finding = await seedFinding();
    const read = await commentsRequest(readCookie, 'GET', finding.id);
    expect(read.statusCode).toBe(200);

    const denied = await commentsRequest(readCookie, 'POST', finding.id, {
      body_rich_content: paragraphDoc('read only'),
    });
    expect(denied.statusCode).toBe(403);

    const created = await commentsRequest(manageCookie, 'POST', finding.id, {
      body_rich_content: paragraphDoc('progress note'),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ comment: { finding_id: finding.id, kind: 'note' } });

    const commentAudit = await migrateHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail
         from core.audit_log
        where workspace_id = $1
          and event_type = 'finding_comment_created'
          and subject_id = $2`,
      [WORKSPACE_ID, finding.id],
    );
    expect(commentAudit.rows).toHaveLength(1);
    expect(commentAudit.rows[0]?.detail).toMatchObject({
      finding_id: finding.id,
      actor_id: manageActor.id,
      mentions: [],
    });

    const timeline = await commentsRequest(readCookie, 'GET', finding.id);
    expect(timeline.statusCode).toBe(200);
    expect(timeline.json().items).toHaveLength(1);
  });

  it('validates blank, sanitized, mention, attachment, cursor, and idempotent POST paths', async () => {
    const finding = await seedFinding();
    const blank = await commentsRequest(manageCookie, 'POST', finding.id, {
      body_rich_content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    expect(blank.statusCode).toBe(422);

    const image = await commentsRequest(manageCookie, 'POST', finding.id, {
      body_rich_content: { type: 'doc', content: [{ type: 'image', attrs: {} }] },
    });
    expect(image.statusCode).toBe(422);

    const mismatch = await commentsRequest(manageCookie, 'POST', finding.id, {
      body_rich_content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'mention', attrs: { actor_id: readActor.id } }] },
        ],
      },
    });
    expect(mismatch.statusCode).toBe(422);

    const mentioned = await commentsRequest(manageCookie, 'POST', finding.id, {
      body_rich_content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'mention', attrs: { actor_id: readActor.id } }] },
        ],
      },
      mentions: [readActor.id],
    });
    expect(mentioned.statusCode).toBe(201);

    const attachment = await commentsRequest(manageCookie, 'POST', finding.id, {
      body_rich_content: {
        type: 'doc',
        content: [{ type: 'paragraph' }, { type: 'attachmentRef', attrs: { id: randomUUID() } }],
      },
    });
    expect(attachment.statusCode).toBe(422);
    expect(attachment.json().detail.fields).toContainEqual({
      path: ['body_rich_content'],
      code: 'attachment_not_supported',
    });

    const key = randomUUID();
    const first = await commentsRequest(
      manageCookie,
      'POST',
      finding.id,
      {
        body_rich_content: paragraphDoc('replay me'),
      },
      undefined,
      key,
    );
    const replay = await commentsRequest(
      manageCookie,
      'POST',
      finding.id,
      {
        body_rich_content: paragraphDoc('replay me'),
      },
      undefined,
      key,
    );
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());

    const firstPage = await commentsRequest(manageCookie, 'GET', finding.id, undefined, 'limit=1');
    const cursor = firstPage.json().page.cursor as string;
    expect(firstPage.json().page.has_more).toBe(true);
    const nextPage = await commentsRequest(
      manageCookie,
      'GET',
      finding.id,
      undefined,
      `limit=1&cursor=${encodeURIComponent(cursor)}`,
    );
    expect(nextPage.statusCode).toBe(200);
    expect(nextPage.json().items).toHaveLength(1);

    const invalidCursor = await commentsRequest(
      manageCookie,
      'GET',
      finding.id,
      undefined,
      'cursor=not-a-cursor',
    );
    expect(invalidCursor.statusCode).toBe(422);
  });

  it('review follow-up: cursor pagination does not skip a row sharing the same millisecond as the cursor boundary', async () => {
    // Regression for astra medium's review of PR #449: encoding the cursor
    // from a JS Date (millisecond precision) instead of the raw postgres
    // timestamp (microsecond precision) drops a row whenever two comments
    // share a millisecond, because the truncated cursor's `<` predicate
    // matches both the earlier row's rounded-down millisecond AND the
    // colliding row. Force the collision with an explicit same-millisecond
    // insert (natural timing between two API calls essentially never
    // collides on its own, so this must be seeded directly).
    const finding = await seedFinding();
    const microA = '2026-01-01 00:00:00.500900+00'; // later within the same ms
    const microB = '2026-01-01 00:00:00.500100+00'; // earlier within the same ms
    const idA = randomUUID();
    const idB = randomUUID();
    const body = JSON.stringify(paragraphDoc('same-millisecond row'));
    await migrateHandle.pool.query(
      `insert into finding.finding_comments
         (id, workspace_id, finding_id, actor_id, kind, body_rich_content, created_at)
       values
         ($1, $2, $3, $4, 'note', $5::jsonb, $6::timestamptz),
         ($7, $2, $3, $4, 'note', $5::jsonb, $8::timestamptz)`,
      [idA, WORKSPACE_ID, finding.id, manageActor.id, body, microA, idB, microB],
    );

    const firstPage = await commentsRequest(manageCookie, 'GET', finding.id, undefined, 'limit=1');
    expect(firstPage.json().items).toHaveLength(1);
    expect(firstPage.json().items[0].id).toBe(idA); // later microsecond sorts first (DESC)
    expect(firstPage.json().page.has_more).toBe(true);
    const cursor = firstPage.json().page.cursor as string;

    const nextPage = await commentsRequest(
      manageCookie,
      'GET',
      finding.id,
      undefined,
      `limit=1&cursor=${encodeURIComponent(cursor)}`,
    );
    expect(nextPage.statusCode).toBe(200);
    // Before the fix: idB (same millisecond, earlier microsecond) was silently
    // skipped because the millisecond-truncated cursor's `<` predicate treated
    // idB's row as not-earlier-than the (rounded-down) cursor boundary.
    expect(nextPage.json().items.map((c: { id: string }) => c.id)).toEqual([idB]);
  });

  it('writes a status_change row and reason audit atomically, but not for a no-op', async () => {
    const finding = await seedFinding();
    const changed = await patchFinding(manageCookie, finding.id, {
      status: 'not_actionable',
      reason: 'Not actionable for this release',
    });
    expect(changed.statusCode).toBe(200);

    const rows = await migrateHandle.pool.query<{
      kind: string;
      from_status: string;
      to_status: string;
      body_rich_content: unknown;
    }>(
      `select kind, from_status, to_status, body_rich_content
         from finding.finding_comments where finding_id = $1`,
      [finding.id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      kind: 'status_change',
      from_status: 'draft',
      to_status: 'not_actionable',
      body_rich_content: paragraphDoc('Not actionable for this release'),
    });

    const audits = await migrateHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log where event_type = 'finding_status_changed' and subject_id = $1`,
      [finding.id],
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]?.detail).toMatchObject({ reason: 'Not actionable for this release' });

    const noop = await patchFinding(manageCookie, finding.id, {
      status: 'not_actionable',
      reason: 'ignored on no-op',
    });
    expect(noop.statusCode).toBe(200);
    const after = await migrateHandle.pool.query(
      'select 1 from finding.finding_comments where finding_id = $1',
      [finding.id],
    );
    expect(after.rows).toHaveLength(1);
    const auditAfter = await migrateHandle.pool.query(
      `select 1 from core.audit_log where event_type = 'finding_status_changed' and subject_id = $1`,
      [finding.id],
    );
    expect(auditAfter.rows).toHaveLength(1);
  });

  it('denies User history access and rejects POST under an archived Managed System', async () => {
    const active = await seedFinding();
    const user = await commentsRequest(userCookie, 'GET', active.id);
    expect(user.statusCode).toBe(403);

    const archived = await seedFinding({ archived: true });
    const archivedHistory = await commentsRequest(readCookie, 'GET', archived.id);
    expect(archivedHistory.statusCode).toBe(200);
    const response = await commentsRequest(manageCookie, 'POST', archived.id, {
      body_rich_content: paragraphDoc('blocked'),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('conflict.parent_archived');
  });
});
