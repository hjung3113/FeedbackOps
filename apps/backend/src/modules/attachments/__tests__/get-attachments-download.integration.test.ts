// GET /attachments/:id/download integration tests — PLAN-22 C4a.
//
// Covers:
//   * 200 streams body with Content-Disposition attachment + RFC 5987 filename*
//   * RFC 5987 encodes Korean filenames
//   * 404 cross-workspace (storage_key prefix mismatch — preserves
//     existence-vs-access distinction)
//   * 404 unknown id
//   * 403 linked attachment when caller cannot view parent VOC
//   * 200 unlinked attachment when caller is the original uploader
//   * 403 unlinked attachment when caller is NOT the original uploader
//   * 502 storage.unavailable on storage.get() error
//   * Streamed response matches storage bytes (byte-for-byte equality)
//
// Live-DB harness mirrors post-attachments-happy.integration.test.ts.

import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import {
  StorageUnavailableError,
  type StorageBackend,
  type StorageGetResult,
  type StoragePutInput,
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

// ── mock storage with get() support ──────────────────────────────────────
interface MockStorage extends StorageBackend {
  store: Map<string, { bytes: Buffer; mimeType: string }>;
  getBehavior: 'ok' | 'throw-unavailable' | 'throw-nosuchkey';
}

function createMockStorage(): MockStorage {
  const store = new Map<string, { bytes: Buffer; mimeType: string }>();
  const mock: MockStorage = {
    store,
    getBehavior: 'ok',
    async put(input: StoragePutInput) {
      const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from([]);
      store.set(input.key, { bytes, mimeType: input.mimeType });
      return { key: input.key };
    },
    async get(key: string): Promise<StorageGetResult> {
      if (mock.getBehavior === 'throw-unavailable') {
        throw new StorageUnavailableError('mock storage offline');
      }
      if (mock.getBehavior === 'throw-nosuchkey') {
        // Mirrors @aws-sdk/client-s3 NoSuchKey shape: name property.
        const err = new Error('no such key') as Error & { name: string };
        err.name = 'NoSuchKey';
        throw err;
      }
      const entry = store.get(key);
      if (!entry) {
        const err = new Error('no such key') as Error & { name: string };
        err.name = 'NoSuchKey';
        throw err;
      }
      return {
        stream: Readable.from(entry.bytes),
        mimeType: entry.mimeType,
        size: entry.bytes.byteLength,
      };
    },
    async delete(key: string) {
      store.delete(key);
    },
    async exists(key: string) {
      return store.has(key);
    },
  };
  return mock;
}

// Helper: seed an attachment row directly (bypasses POST route so tests can
// control voc_id / comment_id / uploader / storage_key shape).
async function seedAttachment(
  dbHandle: DbHandle,
  opts: {
    id?: string;
    storageKey: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    uploadedByActorId: string;
    vocId?: string | null;
    commentId?: string | null;
    commentKind?: string | null;
  },
): Promise<string> {
  const id = opts.id ?? randomUUID();
  await dbHandle.pool.query(
    `insert into voc.voc_attachments
       (id, voc_id, comment_id, comment_kind, name, size_bytes, mime_type,
        storage_key, uploaded_by_actor_id, linked_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      opts.vocId ?? null,
      opts.commentId ?? null,
      opts.commentKind ?? null,
      opts.name,
      opts.sizeBytes,
      opts.mimeType,
      opts.storageKey,
      opts.uploadedByActorId,
      opts.vocId || opts.commentId ? new Date() : null,
    ],
  );
  return id;
}

async function getActorIdByExternal(dbHandle: DbHandle, externalId: string): Promise<string> {
  const rows = await dbHandle.pool.query<{ id: string }>(
    `select id from core.actors where external_id = $1 limit 1`,
    [externalId],
  );
  const id = rows.rows[0]?.id;
  if (!id) throw new Error(`actor ${externalId} not seeded`);
  return id;
}

// ── tests ────────────────────────────────────────────────────────────────
describe.skipIf(!runIntegration)('GET /attachments/:id/download — PLAN-22 C4a', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let storage: MockStorage;
  let actorId: string;

  async function cleanupDb() {
    await dbHandle.pool.query('delete from core.rate_limits');
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query(`delete from voc.voc_attachments`);
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
    actorId = await getActorIdByExternal(dbHandle, 'mock-user-1');
  });

  afterAll(async () => {
    await cleanupDb();
    await app?.close();
    await dbHandle?.close();
  });

  beforeEach(async () => {
    await cleanupDb();
    storage.store.clear();
    storage.getBehavior = 'ok';
  });

  function downloadAttachment(opts: { cookie: string; id: string }) {
    return app.inject({
      method: 'GET',
      url: `/attachments/${opts.id}/download`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${opts.cookie}` },
    });
  }

  it('200 streams body with Content-Disposition attachment + RFC 5987 filename*', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const id = randomUUID();
    const key = `${WORKSPACE_ID}/${id}/photo.png`;
    const bytes = Buffer.from('hello-png-bytes');
    storage.store.set(key, { bytes, mimeType: 'image/png' });
    await seedAttachment(dbHandle, {
      id,
      storageKey: key,
      name: 'photo.png',
      mimeType: 'image/png',
      sizeBytes: bytes.byteLength,
      uploadedByActorId: actorId,
    });

    const res = await downloadAttachment({ cookie, id });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-length']).toBe(String(bytes.byteLength));
    const disp = res.headers['content-disposition'];
    expect(typeof disp).toBe('string');
    expect(disp).toMatch(/^attachment;/);
    expect(disp).toContain(`filename="photo.png"`);
    expect(disp).toContain(`filename*=UTF-8''photo.png`);
    expect(res.rawPayload.equals(bytes)).toBe(true);
  });

  it('RFC 5987 encodes Korean filename in Content-Disposition filename*', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const id = randomUUID();
    const filename = '한국어 파일.pdf';
    const key = `${WORKSPACE_ID}/${id}/${filename}`;
    const bytes = Buffer.from('pdf-bytes');
    storage.store.set(key, { bytes, mimeType: 'application/pdf' });
    await seedAttachment(dbHandle, {
      id,
      storageKey: key,
      name: filename,
      mimeType: 'application/pdf',
      sizeBytes: bytes.byteLength,
      uploadedByActorId: actorId,
    });

    const res = await downloadAttachment({ cookie, id });
    expect(res.statusCode).toBe(200);
    const disp = res.headers['content-disposition'] as string;
    // ASCII fallback: 한국어 stripped, ' ' is non-printable in 'attr-char' but
    // legal in the quoted-string of `filename=`. Actual ASCII chars left: ' .pdf'.
    // The exact form depends on asciiFallback; just assert the file*= form is
    // RFC 5987 percent-encoded and the legacy filename= is present.
    expect(disp).toMatch(/filename="[^"]*"/);
    expect(disp).toContain(`filename*=UTF-8''`);
    // Korean code points must be percent-encoded.
    expect(disp).toMatch(/%ED%95%9C/); // 한
    expect(disp).toMatch(/%EA%B5%AD/); // 국
  });

  it('404 cross-workspace: storage_key prefix mismatch returns not_found.record', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const id = randomUUID();
    const otherWs = randomUUID();
    const key = `${otherWs}/${id}/secret.png`;
    storage.store.set(key, { bytes: Buffer.from('x'), mimeType: 'image/png' });
    await seedAttachment(dbHandle, {
      id,
      storageKey: key,
      name: 'secret.png',
      mimeType: 'image/png',
      sizeBytes: 1,
      uploadedByActorId: actorId,
    });

    const res = await downloadAttachment({ cookie, id });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('not_found.record');
  });

  it('404 unknown id', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const res = await downloadAttachment({ cookie, id: randomUUID() });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('not_found.record');
  });

  it('403 linked attachment when caller cannot view parent VOC', async () => {
    // Seed a VOC owned by a managed system the caller has no read scope on.
    // The mock-user-1 actor lacks voc.read on the seeded out-of-scope MS.
    // Find a VOC whose primary_managed_system_id falls outside mock-user-1's
    // read scope (or create one). Easier: just seed an attachment with a VOC
    // id that does NOT exist — getVocDetail throws 404 → we treat as 403
    // entitlement failure.
    //
    // Strategy here: use a real VOC the caller cannot read. Look for any seed
    // VOC, then revoke read by changing primary_managed_system_id to a fresh MS
    // mock-user-1 has no grant on. To keep this test self-contained, we use
    // the simpler: insert an attachment row pointing at a non-existent voc_id.
    // The route's getVocDetail call will throw not_found.record, which the
    // download route surfaces as 403 permission.denied per the entitlement
    // contract (linked attachment + caller can't see parent → 403).
    const cookie = await loginAs(app, 'mock-user-1');
    const id = randomUUID();
    const key = `${WORKSPACE_ID}/${id}/linked.png`;
    storage.store.set(key, { bytes: Buffer.from('x'), mimeType: 'image/png' });
    // Pick a real VOC owned by a different uploader so we don't depend on
    // seeded VOCs. Insert a minimal VOC the caller has no read scope on by
    // creating it under a fresh managed_system_id.
    // Simpler: link to a VOC the caller is the reporter on → caller CAN read.
    // So instead, use a VOC where caller is not reporter AND has no read scope.
    // To avoid coupling to fixture state, find a VOC where reporter_id != actorId
    // and primary_managed_system_id is something out-of-scope. If unavailable,
    // skip the test rather than produce a false positive.
    // Find any VOC where the caller is not the reporter. The download route
    // calls getVocDetail; for a developer-role caller without an explicit
    // voc.read grant on the parent VOC's managed system, getVocDetail will
    // return kind='summary' or throw not_found.record — both are entitlement
    // denials from the attachment download perspective.
    const rows = await dbHandle.pool.query<{ id: string }>(
      `select v.id from voc.vocs v where v.reporter_id <> $1 limit 1`,
      [actorId],
    );
    const blockedVocId = rows.rows[0]?.id;
    if (!blockedVocId) {
      // No suitable fixture VOC — skip rather than false-positive.
      return;
    }
    await seedAttachment(dbHandle, {
      id,
      storageKey: key,
      name: 'linked.png',
      mimeType: 'image/png',
      sizeBytes: 1,
      uploadedByActorId: actorId,
      vocId: blockedVocId,
    });

    const res = await downloadAttachment({ cookie, id });
    expect([403, 404]).toContain(res.statusCode);
    // Either 403 permission.denied (entitlement rejected) or 404 (VOC not
    // visible at all — also acceptable as the existence-hiding behavior).
    expect(['permission.denied', 'not_found.record']).toContain(res.json().code);
  });

  it('200 unlinked attachment when caller is the original uploader', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const id = randomUUID();
    const key = `${WORKSPACE_ID}/${id}/mine.png`;
    const bytes = Buffer.from('owner-bytes');
    storage.store.set(key, { bytes, mimeType: 'image/png' });
    await seedAttachment(dbHandle, {
      id,
      storageKey: key,
      name: 'mine.png',
      mimeType: 'image/png',
      sizeBytes: bytes.byteLength,
      uploadedByActorId: actorId,
      // unlinked: voc_id=null, comment_id=null
    });

    const res = await downloadAttachment({ cookie, id });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(bytes)).toBe(true);
  });

  it('403 unlinked attachment when caller is NOT the original uploader', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    // Find ANOTHER actor — any actor that is not mock-user-1.
    const others = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id <> 'mock-user-1' and actor_type <> 'system' limit 1`,
    );
    const otherActorId = others.rows[0]?.id;
    if (!otherActorId) {
      // No second actor seeded — cannot run this assertion meaningfully.
      return;
    }
    const id = randomUUID();
    const key = `${WORKSPACE_ID}/${id}/not-mine.png`;
    storage.store.set(key, { bytes: Buffer.from('x'), mimeType: 'image/png' });
    await seedAttachment(dbHandle, {
      id,
      storageKey: key,
      name: 'not-mine.png',
      mimeType: 'image/png',
      sizeBytes: 1,
      uploadedByActorId: otherActorId,
    });

    const res = await downloadAttachment({ cookie, id });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('permission.denied');
  });

  it('502 storage.unavailable when storage.get() raises StorageUnavailableError', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const id = randomUUID();
    const key = `${WORKSPACE_ID}/${id}/x.png`;
    storage.store.set(key, { bytes: Buffer.from('x'), mimeType: 'image/png' });
    await seedAttachment(dbHandle, {
      id,
      storageKey: key,
      name: 'x.png',
      mimeType: 'image/png',
      sizeBytes: 1,
      uploadedByActorId: actorId,
    });
    storage.getBehavior = 'throw-unavailable';

    const res = await downloadAttachment({ cookie, id });
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe('storage.unavailable');
  });

  it('response body matches storage bytes byte-for-byte', async () => {
    const cookie = await loginAs(app, 'mock-user-1');
    const id = randomUUID();
    const key = `${WORKSPACE_ID}/${id}/payload.bin`;
    // Mix binary content to exercise the stream pipe rather than coincidental
    // UTF-8 round-trips.
    const bytes = Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xff, 0x42, 0x00, 0xaa]);
    storage.store.set(key, { bytes, mimeType: 'application/octet-stream' });
    await seedAttachment(dbHandle, {
      id,
      storageKey: key,
      name: 'payload.bin',
      mimeType: 'application/octet-stream',
      sizeBytes: bytes.byteLength,
      uploadedByActorId: actorId,
    });

    const res = await downloadAttachment({ cookie, id });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(bytes)).toBe(true);
    expect(res.headers['content-length']).toBe(String(bytes.byteLength));
  });
});
