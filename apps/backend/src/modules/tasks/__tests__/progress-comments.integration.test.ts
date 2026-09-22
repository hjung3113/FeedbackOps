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
import { insertTaskRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = `it-progress-task-${process.pid}-${Date.now()}-`;

describe.skipIf(!runIntegration)('Task progress comments API (#377)', () => {
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

    readActor = await insertDevActor(dbHandle, WORKSPACE_ID, uid('progress-task-read'));
    manageActor = await insertDevActor(dbHandle, WORKSPACE_ID, uid('progress-task-manage'));
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
              select task.id from task.tasks task
              join core.managed_systems ms on ms.id = task.primary_managed_system_id
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
      `delete from task.tasks where primary_managed_system_id in (
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

  async function seedTask(options: { archived?: boolean } = {}) {
    const slug = uid(SLUG_PREFIX);
    const ms = options.archived
      ? await migrateHandle.pool
          .query<{ id: string }>(
            `insert into core.managed_systems (workspace_id, slug, name, archived_at)
             values ($1, $2, $3, now()) returning id`,
            [WORKSPACE_ID, slug, 'Archived progress Task MS'],
          )
          .then((result) => result.rows[0]?.id ?? '')
      : await insertMsDirectly(dbHandle, WORKSPACE_ID, slug, 'Progress Task MS');
    if (!ms) throw new Error('managed system fixture was not created');

    await grantCapability(dbHandle, WORKSPACE_ID, readActor.id, 'finding.read', ms, adminActorId);
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      manageActor.id,
      'finding.manage',
      ms,
      adminActorId,
    );
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: ms,
      createdBy: adminActorId,
    });
    const updated = await dbHandle.pool.query<{ updated_at: Date }>(
      'select updated_at from task.tasks where id = $1',
      [task.id],
    );
    const updatedAt = updated.rows[0]?.updated_at?.toISOString();
    if (!updatedAt) throw new Error('task updated_at missing');
    return { ...task, ms, updatedAt };
  }

  function commentsRequest(
    cookie: string,
    method: 'GET' | 'POST',
    taskId: string,
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
      url: `/tasks/${taskId}/comments${query ? `?${query}` : ''}`,
      headers,
      ...(payload ? { payload } : {}),
    });
  }

  function patchTask(
    cookie: string,
    taskId: string,
    body: Record<string, unknown>,
    ifMatch: string,
    key = randomUUID(),
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/tasks/${taskId}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
        'if-match': ifMatch,
      },
      payload: body,
    });
  }

  it('requires Task manage access and writes a manage comment', async () => {
    const task = await seedTask();
    const read = await commentsRequest(readCookie, 'GET', task.id);
    expect(read.statusCode).toBe(403);

    const user = await commentsRequest(userCookie, 'GET', task.id);
    expect(user.statusCode).toBe(403);

    const denied = await commentsRequest(readCookie, 'POST', task.id, {
      body_rich_content: paragraphDoc('read only'),
    });
    expect(denied.statusCode).toBe(403);

    const created = await commentsRequest(manageCookie, 'POST', task.id, {
      body_rich_content: paragraphDoc('progress note'),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ comment: { task_id: task.id, kind: 'note' } });

    const commentAudit = await migrateHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail
         from core.audit_log
        where workspace_id = $1
          and event_type = 'task_comment_created'
          and subject_id = $2`,
      [WORKSPACE_ID, task.id],
    );
    expect(commentAudit.rows).toHaveLength(1);
    expect(commentAudit.rows[0]?.detail).toMatchObject({
      task_id: task.id,
      actor_id: manageActor.id,
      mentions: [],
    });

    const timeline = await commentsRequest(manageCookie, 'GET', task.id);
    expect(timeline.statusCode).toBe(200);
    expect(timeline.json().items).toHaveLength(1);
  });

  it('validates blank, sanitized, mention, attachment, cursor, and idempotent POST paths', async () => {
    const task = await seedTask();
    const blank = await commentsRequest(manageCookie, 'POST', task.id, {
      body_rich_content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    expect(blank.statusCode).toBe(422);

    const image = await commentsRequest(manageCookie, 'POST', task.id, {
      body_rich_content: { type: 'doc', content: [{ type: 'image', attrs: {} }] },
    });
    expect(image.statusCode).toBe(422);

    const mismatch = await commentsRequest(manageCookie, 'POST', task.id, {
      body_rich_content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'mention', attrs: { actor_id: readActor.id } }] },
        ],
      },
    });
    expect(mismatch.statusCode).toBe(422);

    const mentioned = await commentsRequest(manageCookie, 'POST', task.id, {
      body_rich_content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'mention', attrs: { actor_id: readActor.id } }] },
        ],
      },
      mentions: [readActor.id],
    });
    expect(mentioned.statusCode).toBe(201);

    const attachment = await commentsRequest(manageCookie, 'POST', task.id, {
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
      task.id,
      { body_rich_content: paragraphDoc('replay me') },
      undefined,
      key,
    );
    const replay = await commentsRequest(
      manageCookie,
      'POST',
      task.id,
      { body_rich_content: paragraphDoc('replay me') },
      undefined,
      key,
    );
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());

    const firstPage = await commentsRequest(manageCookie, 'GET', task.id, undefined, 'limit=1');
    const cursor = firstPage.json().page.cursor as string;
    expect(firstPage.json().page.has_more).toBe(true);
    const nextPage = await commentsRequest(
      manageCookie,
      'GET',
      task.id,
      undefined,
      `limit=1&cursor=${encodeURIComponent(cursor)}`,
    );
    expect(nextPage.statusCode).toBe(200);
    expect(nextPage.json().items).toHaveLength(1);

    const invalidCursor = await commentsRequest(
      manageCookie,
      'GET',
      task.id,
      undefined,
      'cursor=not-a-cursor',
    );
    expect(invalidCursor.statusCode).toBe(422);
  });

  it('review follow-up: cursor pagination does not skip a row sharing the same millisecond as the cursor boundary', async () => {
    // Regression for astra medium's review of PR #449 — see the matching
    // Finding test for the full rationale (millisecond-truncated cursors
    // drop rows that share a millisecond with the boundary row).
    const task = await seedTask();
    const microA = '2026-01-01 00:00:00.500900+00';
    const microB = '2026-01-01 00:00:00.500100+00';
    const idA = randomUUID();
    const idB = randomUUID();
    const body = JSON.stringify(paragraphDoc('same-millisecond row'));
    await migrateHandle.pool.query(
      `insert into task.task_comments
         (id, workspace_id, task_id, actor_id, kind, body_rich_content, created_at)
       values
         ($1, $2, $3, $4, 'note', $5::jsonb, $6::timestamptz),
         ($7, $2, $3, $4, 'note', $5::jsonb, $8::timestamptz)`,
      [idA, WORKSPACE_ID, task.id, manageActor.id, body, microA, idB, microB],
    );

    const firstPage = await commentsRequest(manageCookie, 'GET', task.id, undefined, 'limit=1');
    expect(firstPage.json().items).toHaveLength(1);
    expect(firstPage.json().items[0].id).toBe(idA);
    expect(firstPage.json().page.has_more).toBe(true);
    const cursor = firstPage.json().page.cursor as string;

    const nextPage = await commentsRequest(
      manageCookie,
      'GET',
      task.id,
      undefined,
      `limit=1&cursor=${encodeURIComponent(cursor)}`,
    );
    expect(nextPage.statusCode).toBe(200);
    expect(nextPage.json().items.map((c: { id: string }) => c.id)).toEqual([idB]);
  });

  it('writes status_change rows with optional reasons and leaves no-op transitions empty', async () => {
    const task = await seedTask();
    const changed = await patchTask(manageCookie, task.id, { status: 'doing' }, task.updatedAt);
    expect(changed.statusCode).toBe(200);

    const rows = await migrateHandle.pool.query<{
      kind: string;
      from_status: string;
      to_status: string;
      body_rich_content: unknown;
    }>(
      `select kind, from_status, to_status, body_rich_content
         from task.task_comments where task_id = $1`,
      [task.id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      kind: 'status_change',
      from_status: 'backlog',
      to_status: 'doing',
      body_rich_content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });

    const audit = await migrateHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log where event_type = 'task_status_changed' and subject_id = $1`,
      [task.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.detail).toEqual({ from: 'backlog', to: 'doing' });

    const changedTask = changed.json() as { updated_at: string };
    const noop = await patchTask(
      manageCookie,
      task.id,
      { status: 'doing', reason: 'ignored on no-op' },
      changedTask.updated_at,
    );
    expect(noop.statusCode).toBe(200);
    const afterNoop = await migrateHandle.pool.query(
      'select 1 from task.task_comments where task_id = $1',
      [task.id],
    );
    expect(afterNoop.rows).toHaveLength(1);
    const auditAfterNoop = await migrateHandle.pool.query(
      `select 1 from core.audit_log where event_type = 'task_status_changed' and subject_id = $1`,
      [task.id],
    );
    expect(auditAfterNoop.rows).toHaveLength(1);

    const reasonTask = await seedTask();
    const reasonChange = await patchTask(
      manageCookie,
      reasonTask.id,
      { status: 'doing', reason: 'Start implementation' },
      reasonTask.updatedAt,
    );
    expect(reasonChange.statusCode).toBe(200);
    const reasonRow = await migrateHandle.pool.query<{ body_rich_content: unknown }>(
      'select body_rich_content from task.task_comments where task_id = $1',
      [reasonTask.id],
    );
    expect(reasonRow.rows[0]?.body_rich_content).toEqual(paragraphDoc('Start implementation'));
    const reasonAudit = await migrateHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log where event_type = 'task_status_changed' and subject_id = $1`,
      [reasonTask.id],
    );
    expect(reasonAudit.rows[0]?.detail).toEqual({
      from: 'backlog',
      to: 'doing',
      reason: 'Start implementation',
    });
  });

  it('rejects comment creation under an archived Managed System', async () => {
    const task = await seedTask({ archived: true });
    const history = await commentsRequest(manageCookie, 'GET', task.id);
    expect(history.statusCode).toBe(200);
    const response = await commentsRequest(manageCookie, 'POST', task.id, {
      body_rich_content: paragraphDoc('blocked'),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('conflict.parent_archived');
  });
});
