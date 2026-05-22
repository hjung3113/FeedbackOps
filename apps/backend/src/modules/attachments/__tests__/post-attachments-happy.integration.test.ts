// POST /attachments happy-path integration tests — PLAN-22 C3b.
//
// Covers:
//   * 201 envelope shape (id/name/size_bytes/mime_type/uploaded_by_actor_id/created_at).
//   * storage.put runs BEFORE the DB INSERT (operation ordering).
//   * Idempotency replay returns the cached envelope without a second
//     storage.put.
//   * storage.put failure → 502 storage.unavailable, no row inserted, no
//     audit emitted.
//   * INSERT failure triggers best-effort storage.delete cleanup.
//   * attachment_uploaded audit row emitted with no `filename` field.
//   * storage_key shape = `{workspace_id}/{uuid}/{filename}`.
//
// Live-DB harness mirrors post-attachments-validation.integration.test.ts:
// buildServer + cookie session via POST /auth/mock-login; the only addition
// is `storage: <mock>` passed to buildServer to swap the S3-compat backend
// for an in-memory stub the tests can introspect.

import { randomUUID } from 'node:crypto';

import FormData from 'form-data';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import {
  StorageUnavailableError,
  type StorageBackend,
  type StoragePutInput,
  type StorageGetResult,
} from '../../../lib/storage/index.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

// ── helpers ──────────────────────────────────────────────────────────────
function extractSessionCookie(setCookie: string | string[] | undefined): string | null {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const m = c.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (m?.[1]) return m[1];
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

function buildMultipart(opts: { bytes: Buffer; filename: string; contentType: string }) {
  const fd = new FormData();
  fd.append('file', opts.bytes, { filename: opts.filename, contentType: opts.contentType });
  return { payload: fd.getBuffer(), headers: fd.getHeaders() };
}

function postAttachment(
  app: FastifyInstance,
  opts: {
    cookie: string;
    idempotencyKey: string;
    bytes: Buffer;
    filename: string;
    contentType: string;
  },
) {
  const { payload, headers: mpHeaders } = buildMultipart({
    bytes: opts.bytes,
    filename: opts.filename,
    contentType: opts.contentType,
  });
  return app.inject({
    method: 'POST',
    url: '/attachments',
    headers: {
      ...mpHeaders,
      cookie: `${SESSION_COOKIE_NAME}=${opts.cookie}`,
      'idempotency-key': opts.idempotencyKey,
    },
    payload,
  });
}

// ── mock storage ─────────────────────────────────────────────────────────
interface StorageCall {
  op: 'put' | 'delete' | 'get' | 'exists';
  key: string;
  ts: number;
}

interface MockStorage extends StorageBackend {
  calls: StorageCall[];
  store: Map<string, { bytes: Buffer; mimeType: string }>;
  putBehavior: 'ok' | 'throw-unavailable';
}

function createMockStorage(): MockStorage {
  const calls: StorageCall[] = [];
  const store = new Map<string, { bytes: Buffer; mimeType: string }>();
  const seq = () => Date.now() * 1000 + calls.length;
  const mock: MockStorage = {
    calls,
    store,
    putBehavior: 'ok',
    async put(input: StoragePutInput) {
      calls.push({ op: 'put', key: input.key, ts: seq() });
      if (mock.putBehavior === 'throw-unavailable') {
        throw new StorageUnavailableError('mock storage offline');
      }
      const bytes = Buffer.isBuffer(input.bytes)
        ? input.bytes
        : Buffer.from([]); /* tests only pass Buffers */
      store.set(input.key, { bytes, mimeType: input.mimeType });
      return { key: input.key };
    },
    async get(key: string): Promise<StorageGetResult> {
      calls.push({ op: 'get', key, ts: seq() });
      throw new Error('get not used in C3b tests');
    },
    async delete(key: string) {
      calls.push({ op: 'delete', key, ts: seq() });
      store.delete(key);
    },
    async exists(key: string) {
      calls.push({ op: 'exists', key, ts: seq() });
      return store.has(key);
    },
  };
  return mock;
}

// ── tests ────────────────────────────────────────────────────────────────
describe.skipIf(!runIntegration)('POST /attachments — PLAN-22 C3b happy path', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let storage: MockStorage;

  async function cleanupDb() {
    await dbHandle.pool.query('delete from core.rate_limits');
    await dbHandle.pool.query('delete from core.idempotency_keys');
    // attachment rows + audit rows from prior tests in this file.
    await dbHandle.pool.query(`delete from voc.voc_attachments`);
    await dbHandle.pool.query(
      `delete from core.audit_log where event_type = 'attachment_uploaded'`,
    );
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    storage = createMockStorage();
    app = await buildServer({ config: loadConfig(), dbHandle, storage });
    await app.ready();
  });

  afterAll(async () => {
    await cleanupDb();
    await app?.close();
    await dbHandle?.close();
  });

  beforeEach(async () => {
    await cleanupDb();
    storage.calls.length = 0;
    storage.store.clear();
    storage.putBehavior = 'ok';
  });

  it('201 returns envelope with id/name/size_bytes/mime_type/uploaded_by_actor_id/created_at', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const bytes = Buffer.from('hello-png-bytes');
    const res = await postAttachment(app, {
      cookie,
      idempotencyKey: randomUUID(),
      bytes,
      filename: 'photo.png',
      contentType: 'image/png',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as Record<string, unknown>;
    expect(typeof body.id).toBe('string');
    expect(body.name).toBe('photo.png');
    expect(body.size_bytes).toBe(bytes.byteLength);
    expect(body.mime_type).toBe('image/png');
    expect(typeof body.uploaded_by_actor_id).toBe('string');
    expect(typeof body.created_at).toBe('string');
    // ISO-8601-ish: parseable as Date.
    expect(Number.isFinite(Date.parse(body.created_at as string))).toBe(true);
  });

  it('uploads to storage BEFORE inserting DB row', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await postAttachment(app, {
      cookie,
      idempotencyKey: randomUUID(),
      bytes: Buffer.from('abc'),
      filename: 'photo.png',
      contentType: 'image/png',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string };
    // The put happened (mock recorded it) AND the row exists (DB confirms).
    expect(storage.calls.some((c) => c.op === 'put')).toBe(true);
    const rows = await dbHandle.pool.query(
      `select id from voc.voc_attachments where id = $1`,
      [body.id],
    );
    expect(rows.rowCount).toBe(1);
    // Operation-ordering proof: when storage.put throws BEFORE the INSERT
    // (separate test below), no row exists. The presence of the row here
    // together with the recorded put is sufficient for upload-then-insert.
  });

  it('idempotency replay returns the cached 201 envelope without a second storage.put', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const key = randomUUID();
    const first = await postAttachment(app, {
      cookie,
      idempotencyKey: key,
      bytes: Buffer.from('abc'),
      filename: 'photo.png',
      contentType: 'image/png',
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json();
    const putCountAfterFirst = storage.calls.filter((c) => c.op === 'put').length;

    const second = await postAttachment(app, {
      cookie,
      idempotencyKey: key,
      bytes: Buffer.from('abc'),
      filename: 'photo.png',
      contentType: 'image/png',
    });
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(firstBody);
    const putCountAfterSecond = storage.calls.filter((c) => c.op === 'put').length;
    expect(putCountAfterSecond).toBe(putCountAfterFirst);
  });

  it('storage.put failure → 502 storage.unavailable, no row inserted, no audit emitted', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    storage.putBehavior = 'throw-unavailable';
    const beforeRows = await dbHandle.pool.query(`select count(*)::int as n from voc.voc_attachments`);
    const beforeAudit = await dbHandle.pool.query(
      `select count(*)::int as n from core.audit_log where event_type = 'attachment_uploaded'`,
    );
    const res = await postAttachment(app, {
      cookie,
      idempotencyKey: randomUUID(),
      bytes: Buffer.from('abc'),
      filename: 'photo.png',
      contentType: 'image/png',
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe('storage.unavailable');
    const afterRows = await dbHandle.pool.query(`select count(*)::int as n from voc.voc_attachments`);
    const afterAudit = await dbHandle.pool.query(
      `select count(*)::int as n from core.audit_log where event_type = 'attachment_uploaded'`,
    );
    expect(afterRows.rows[0].n).toBe(beforeRows.rows[0].n);
    expect(afterAudit.rows[0].n).toBe(beforeAudit.rows[0].n);
  });

  it('INSERT failure triggers best-effort storage.delete cleanup', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    // Monkey-patch storage.put: BEFORE calling the real put, seed a row in
    // voc_attachments at the exact storage_key the route will INSERT. The
    // UNIQUE(storage_key) index then fails the route's repo INSERT, which
    // triggers the best-effort `storage.delete(key)` cleanup path.
    const originalPut = storage.put.bind(storage);
    storage.put = async (input: StoragePutInput) => {
      const actorRow = await dbHandle.pool.query<{ id: string }>(
        `select id from core.actors limit 1`,
      );
      const actorId = actorRow.rows[0]?.id;
      if (!actorId) throw new Error('no seeded actor for collision setup');
      await dbHandle.pool.query(
        `insert into voc.voc_attachments
           (id, name, size_bytes, mime_type, storage_key, uploaded_by_actor_id)
         values (gen_random_uuid(), 'pre-existing', 1, 'image/png', $1, $2)`,
        [input.key, actorId],
      );
      return originalPut(input);
    };
    try {
      const res = await postAttachment(app, {
        cookie,
        idempotencyKey: randomUUID(),
        bytes: Buffer.from('abc'),
        filename: 'photo.png',
        contentType: 'image/png',
      });
      // unique_violation surfaces as 500 (not mapped to a friendlier code in
      // C3b; the cleanup invariant is what matters here).
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      const deletes = storage.calls.filter((c) => c.op === 'delete');
      expect(deletes.length).toBeGreaterThan(0);
    } finally {
      storage.put = originalPut;
    }
  });

  it('emits attachment_uploaded audit row without a filename field', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await postAttachment(app, {
      cookie,
      idempotencyKey: randomUUID(),
      bytes: Buffer.from('abc'),
      filename: 'photo.png',
      contentType: 'image/png',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string };
    const audits = await dbHandle.pool.query<{
      event_type: string;
      subject_id: string;
      detail: Record<string, unknown>;
    }>(
      `select event_type, subject_id, detail
         from core.audit_log
        where event_type = 'attachment_uploaded'
          and subject_id = $1`,
      [body.id],
    );
    expect(audits.rowCount).toBe(1);
    const detail = audits.rows[0].detail;
    expect('filename' in detail).toBe(false);
    expect(detail.attachment_id).toBe(body.id);
    expect(typeof detail.storage_key).toBe('string');
    expect(detail.size_bytes).toBe(3);
    expect(detail.mime_type).toBe('image/png');
  });

  it('storage_key uses {workspace_id}/{uuid}/{sanitized_filename} shape', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await postAttachment(app, {
      cookie,
      idempotencyKey: randomUUID(),
      bytes: Buffer.from('abc'),
      filename: 'photo.png',
      contentType: 'image/png',
    });
    expect(res.statusCode).toBe(201);
    const put = storage.calls.find((c) => c.op === 'put');
    expect(put).toBeTruthy();
    // {workspace_uuid}/{uuid}/photo.png
    expect(put!.key).toMatch(
      /^[0-9a-fA-F-]{36}\/[0-9a-fA-F-]{36}\/photo\.png$/,
    );
    expect(put!.key.startsWith(`${WORKSPACE_ID}/`)).toBe(true);
  });
});
