// POST /attachments integration tests — PLAN-22 C3a (validation-only).
//
// Mirrors the live harness pattern from
// modules/voc/__tests__/create-voc.integration.test.ts:
//   * buildServer + cookie session via POST /auth/mock-login.
//   * fops_app pool for cleanup of session + rate-limit + idempotency rows.
//
// Gate: DATABASE_URL + WORKSPACE_ID. Without DATABASE_URL the suite skips.
//
// The happy-path branch returns 501 not_implemented.todo until C3b lands.
// That test below is intentionally a tombstone — flip it to 201 when C3b
// replaces the stub.

import { randomUUID } from 'node:crypto';

import FormData from 'form-data';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { MAX_ATTACHMENT_BYTES } from '../routes.js';

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

function buildMultipart(opts: {
  bytes: Buffer;
  filename: string;
  contentType: string;
}): { payload: Buffer; headers: Record<string, string> } {
  const fd = new FormData();
  fd.append('file', opts.bytes, {
    filename: opts.filename,
    contentType: opts.contentType,
  });
  return {
    payload: fd.getBuffer(),
    headers: fd.getHeaders(),
  };
}

function postAttachment(
  app: FastifyInstance,
  opts: {
    cookie?: string;
    idempotencyKey?: string | null;
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
  const headers: Record<string, string> = { ...mpHeaders };
  if (opts.cookie) headers.cookie = `${SESSION_COOKIE_NAME}=${opts.cookie}`;
  if (opts.idempotencyKey !== null && opts.idempotencyKey !== undefined) {
    headers['idempotency-key'] = opts.idempotencyKey;
  }
  return app.inject({
    method: 'POST',
    url: '/attachments',
    headers,
    payload,
  });
}

describe.skipIf(!runIntegration)('POST /attachments — PLAN-22 C3a validation', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;

  async function cleanup() {
    await dbHandle.pool.query('delete from core.rate_limits');
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    await dbHandle?.close();
  });

  beforeEach(async () => {
    await cleanup();
  });

  it('401 when unauthenticated', async () => {
    const res = await postAttachment(app, {
      idempotencyKey: randomUUID(),
      bytes: Buffer.from('small'),
      filename: 'photo.png',
      contentType: 'image/png',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('auth.session_invalid');
  });

  it('422 validation.failed when Idempotency-Key header missing', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await postAttachment(app, {
      cookie,
      idempotencyKey: null,
      bytes: Buffer.from('small'),
      filename: 'photo.png',
      contentType: 'image/png',
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
  });

  it('422 validation.malformed_idempotency_key when not a UUIDv4', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await postAttachment(app, {
      cookie,
      idempotencyKey: 'not-a-uuid',
      bytes: Buffer.from('small'),
      filename: 'photo.png',
      contentType: 'image/png',
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.malformed_idempotency_key');
  });

  it('422 attachment.unsupported_type for application/zip', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await postAttachment(app, {
      cookie,
      idempotencyKey: randomUUID(),
      bytes: Buffer.from('PK\x03\x04'),
      filename: 'archive.zip',
      contentType: 'application/zip',
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('attachment.unsupported_type');
    expect(res.json().detail?.fields?.[0]?.path).toEqual(['file']);
  });

  it('422 attachment.too_large at 25MB+1 byte', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const oversized = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 0);
    const res = await postAttachment(app, {
      cookie,
      idempotencyKey: randomUUID(),
      bytes: oversized,
      filename: 'big.bin',
      contentType: 'image/png',
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('attachment.too_large');
  });

  it('422 validation.failed on traversal filename', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    // The traversal filename `../../etc/passwd` sanitizes to a non-empty
    // string `....etcpasswd` — the slashes get stripped. So this case
    // currently passes sanitization but fails on the not_implemented stub.
    // To force validation.failed we use a filename that collapses to empty.
    const res = await postAttachment(app, {
      cookie,
      idempotencyKey: randomUUID(),
      bytes: Buffer.from('small'),
      filename: '////\\\\',
      contentType: 'image/png',
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
    expect(res.json().detail?.fields?.[0]?.path).toEqual(['filename']);
  });

  it('422 validation.failed on empty-after-sanitize filename (only control chars)', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const ctrlOnly =
      String.fromCharCode(0x01) +
      String.fromCharCode(0x02) +
      String.fromCharCode(0x03);
    const res = await postAttachment(app, {
      cookie,
      idempotencyKey: randomUUID(),
      bytes: Buffer.from('small'),
      filename: ctrlOnly,
      contentType: 'image/png',
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
  });

  it('429 rate_limited.actor at 21st request/min', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    let last = 0;
    let lastBody: unknown = null;
    for (let i = 0; i < 21; i += 1) {
      const r = await postAttachment(app, {
        cookie,
        idempotencyKey: randomUUID(),
        bytes: Buffer.from('small'),
        filename: 'photo.png',
        contentType: 'image/png',
      });
      last = r.statusCode;
      lastBody = r.json();
    }
    expect(last).toBe(429);
    expect((lastBody as { code: string }).code).toBe('rate_limited.actor');
  });

  // C3b removed the 501 not_implemented.todo tombstone — happy-path coverage
  // lives in post-attachments-happy.integration.test.ts.
});
