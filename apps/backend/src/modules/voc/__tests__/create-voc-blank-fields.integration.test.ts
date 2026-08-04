// POST /vocs blank required-field contract (#327).

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

function extractSessionCookie(setCookie: string | string[] | undefined): string | null {
  if (!setCookie) return null;
  for (const cookie of Array.isArray(setCookie) ? setCookie : [setCookie]) {
    const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (match?.[1]) return match[1];
  }
  return null;
}

async function loginAs(app: FastifyInstance, externalId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/mock-login',
    headers: { 'user-agent': 'integration-test' },
    payload: { external_id: externalId },
  });
  const cookie = extractSessionCookie(res.headers['set-cookie']);
  if (!cookie) throw new Error(`mock-login failed: ${res.statusCode} ${res.body}`);
  return cookie;
}

async function createManagedSystem(app: FastifyInstance, cookie: string, slug: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/managed-systems',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
    payload: { slug, name: slug },
  });
  if (res.statusCode !== 201) throw new Error(`createManagedSystem failed: ${res.statusCode} ${res.body}`);
  return res.json().id;
}

function paragraphDoc(text: string) {
  return {
    type: 'doc' as const,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

function postVoc(app: FastifyInstance, cookie: string, body: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/vocs',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    },
    payload: body,
  });
}

describe.skipIf(!runIntegration)('POST /vocs blank required fields (#327)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let adminCookie: string;
  let reporterCookie: string;
  let managedSystemId: string;

  async function cleanupProductTables(): Promise<void> {
    await dbHandle.pool.query(
      `delete from voc.vocs where primary_managed_system_id in (
        select id from core.managed_systems where slug = 'it-voc-blank-fields'
      )`,
    );
    await dbHandle.pool.query(`delete from core.managed_systems where slug = 'it-voc-blank-fields'`);
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query('delete from core.rate_limits');
  }

  // Deliberately NOT part of the per-test cleanup: the cookies are minted once
  // in beforeAll, so deleting these rows before each test revokes them and
  // every request after the first comes back 401.
  async function cleanupSessions(): Promise<void> {
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
  }

  async function cleanupAuditLog(): Promise<void> {
    if (!MIGRATE_URL) return;
    const ops = createDb(MIGRATE_URL);
    try {
      await ops.pool.query(
        `delete from core.audit_log where event_type in ('managed_system_registered', 'voc_created')`,
      );
    } finally {
      await ops.close();
    }
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    reporterCookie = await loginAs(app, 'mock-user-1');
  });

  beforeEach(async () => {
    await cleanupProductTables();
    await cleanupAuditLog();
    managedSystemId = await createManagedSystem(app, adminCookie, 'it-voc-blank-fields');
  });

  afterAll(async () => {
    await cleanupProductTables();
    await cleanupSessions();
    await cleanupAuditLog();
    await app?.close();
    await dbHandle?.close();
  });

  it('rejects a whitespace-only title with a title field error', async () => {
    const res = await postVoc(app, reporterCookie, {
      primary_managed_system_id: managedSystemId,
      title: '   ',
      description_rich_content: paragraphDoc('real body'),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
    expect(res.json().detail?.fields?.[0]?.path).toEqual(['title']);
  });

  it('rejects a whitespace-only description with a description field error and no row', async () => {
    const before = await dbHandle.pool.query<{ count: number }>(
      'select count(*)::int as count from voc.vocs where workspace_id = $1',
      [WORKSPACE_ID],
    );
    const res = await postVoc(app, reporterCookie, {
      primary_managed_system_id: managedSystemId,
      title: 'real title',
      description_rich_content: paragraphDoc('   '),
    });
    const after = await dbHandle.pool.query<{ count: number }>(
      'select count(*)::int as count from voc.vocs where workspace_id = $1',
      [WORKSPACE_ID],
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
    expect(res.json().detail?.fields?.[0]?.path).toEqual(['description_rich_content']);
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it.each([
    ['empty content array', { type: 'doc', content: [] }],
    ['missing content', { type: 'doc' }],
  ])('rejects a structurally empty description: %s', async (_name, description_rich_content) => {
    const res = await postVoc(app, reporterCookie, {
      primary_managed_system_id: managedSystemId,
      title: 'real title',
      description_rich_content,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
    expect(res.json().detail?.fields?.[0]?.path).toEqual(['description_rich_content']);
  });

  it('accepts a normal title and text description', async () => {
    const res = await postVoc(app, reporterCookie, {
      primary_managed_system_id: managedSystemId,
      title: 'normal title',
      description_rich_content: paragraphDoc('normal body'),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().id).toEqual(expect.any(String));
  });

  it('stores a trimmed title', async () => {
    const res = await postVoc(app, reporterCookie, {
      primary_managed_system_id: managedSystemId,
      title: '  실제 제목  ',
      description_rich_content: paragraphDoc('normal body'),
    });

    expect(res.statusCode).toBe(201);
    const stored = await dbHandle.pool.query<{ title: string }>('select title from voc.vocs where id = $1', [
      res.json().id,
    ]);
    expect(stored.rows[0]?.title).toBe('실제 제목');
  });

  it('accepts a textless attachmentRef description', async () => {
    const res = await postVoc(app, reporterCookie, {
      primary_managed_system_id: managedSystemId,
      title: 'attachment content',
      description_rich_content: {
        type: 'doc',
        content: [{ type: 'attachmentRef', attrs: { id: randomUUID() } }],
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().id).toEqual(expect.any(String));
  });
});
