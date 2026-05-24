// POST /vocs integration tests — Slice 3 #13 acceptance coverage.
//
// Mirrors the live harness pattern from
// modules/analytics-areas/__tests__/analytics-area.integration.test.ts:
//   * buildServer + cookie session via POST /auth/mock-login (no Bearer).
//   * fops_app pool for product-table cleanup.
//   * fops_migrate pool for core.audit_log cleanup (fops_app cannot DELETE).
//
// Gate: DATABASE_URL + WORKSPACE_ID. Without DATABASE_URL_MIGRATE the suite
// still runs but skips audit-log assertions/cleanup gracefully.

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

async function createMs(
  app: FastifyInstance,
  cookie: string,
  slug: string,
  name: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/managed-systems',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
    payload: { slug, name },
  });
  if (res.statusCode !== 201) throw new Error(`createMs failed: ${res.statusCode} ${res.body}`);
  return res.json().id;
}

async function createAa(
  app: FastifyInstance,
  cookie: string,
  body: { managed_system_id: string; slug: string; name: string },
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/analytics-areas',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
    payload: body,
  });
  if (res.statusCode !== 201) throw new Error(`createAa failed: ${res.statusCode} ${res.body}`);
  return res.json().id;
}

function paragraphDoc(text: string) {
  return {
    type: 'doc' as const,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

// PLAN-22 C7b: seed an unlinked voc_attachments row owned by a given actor.
// Mirrors the helper in modules/attachments/__tests__/get-attachments-download
// integration test (kept local here to avoid cross-suite imports).
async function seedAttachment(
  dbHandle: DbHandle,
  uploadedByActorId: string,
  slug: string,
  mimeType: string,
): Promise<string> {
  const id = randomUUID();
  const storageKey = `${WORKSPACE_ID}/${id}/${slug}-${randomUUID()}.bin`;
  await dbHandle.pool.query(
    `insert into voc.voc_attachments
       (id, voc_id, comment_id, comment_kind, name, size_bytes, mime_type,
        storage_key, uploaded_by_actor_id, linked_at)
     values ($1, null, null, null, $2, $3, $4, $5, $6, null)`,
    [id, `${slug}.bin`, 1024, mimeType, storageKey, uploadedByActorId],
  );
  return id;
}

function postVoc(
  app: FastifyInstance,
  cookie: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
    'content-type': 'application/json',
  };
  if (idempotencyKey !== undefined) {
    headers['idempotency-key'] = idempotencyKey;
  }
  return app.inject({ method: 'POST', url: '/vocs', headers, payload: body });
}

describe.skipIf(!runIntegration)('POST /vocs (#13)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let reporterActorId: string;

  async function cleanupProductTables() {
    // Order matters: voc_attachments first (FKs to vocs via voc_id),
    // then vocs, then AA, then MS.
    await dbHandle.pool.query(
      `delete from voc.voc_attachments
        where storage_key like $1 || '/%'`,
      [WORKSPACE_ID],
    );
    await dbHandle.pool.query(
      `delete from voc.vocs
        where primary_managed_system_id in (
          select id from core.managed_systems where slug like 'it-voc-%'
        )`,
    );
    await dbHandle.pool.query(
      `delete from core.analytics_areas
        where managed_system_id in (
          select id from core.managed_systems where slug like 'it-voc-%'
        )`,
    );
    await dbHandle.pool.query(`delete from core.managed_systems where slug like 'it-voc-%'`);
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query('delete from core.rate_limits');
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
  }

  async function cleanupAuditLog() {
    if (!MIGRATE_URL) return;
    const ops = createDb(MIGRATE_URL);
    try {
      // Broad audit cleanup — MS/AA registration rows from createMs/createAa
      // and our voc_created rows would otherwise leak across `it()` cases.
      await ops.pool.query(
        `delete from core.audit_log
          where event_type in (
            'managed_system_registered','managed_system_updated','managed_system_archived',
            'analytics_area_registered','analytics_area_updated','analytics_area_archived',
            'voc_created'
          )`,
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

    // Resolve the reporter actor_id for the WORKSPACE_ID under test.
    // Mock-login external_id 'mock-user-1' may exist in multiple workspaces.
    const r = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const id = r.rows[0]?.id;
    if (!id) throw new Error(`reporter actor for mock-user-1 in ${WORKSPACE_ID} not found`);
    reporterActorId = id;
  });

  afterAll(async () => {
    await cleanupProductTables();
    await cleanupAuditLog();
    await app?.close();
    await dbHandle?.close();
  });

  beforeEach(async () => {
    await cleanupProductTables();
    await cleanupAuditLog();
  });

  // ── 1. Happy path ─────────────────────────────────────────────────────
  it('Reporter create → 201 + full envelope shape', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-happy', 'Happy MS');
    const reporter = await loginAs(app, 'mock-user-1');

    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'happy path voc',
        description_rich_content: paragraphDoc('hello world'),
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      workspace_id: WORKSPACE_ID,
      primary_managed_system_id: msId,
      severity: null,
      reporter_facing_status: 'received',
      triage_state: 'untriaged',
      owner_user_id: null,
      owner_team_id: null,
      source_context: 'direct_use',
      next_actions: [],
      permission_decisions: {},
    });
    expect(body.id).toMatch(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    );
    expect(body.display_id).toMatch(/^VOC-\d+$/);
    expect(body.next_reporter_states?.allowed).toContain('reviewing');
  });

  // ── 2. display_id sequencing ──────────────────────────────────────────
  it('display_id increments by 1 across successive creates', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-seq', 'Seq MS');
    const reporter = await loginAs(app, 'mock-user-1');

    const r1 = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'one',
        description_rich_content: paragraphDoc('a'),
      },
      randomUUID(),
    );
    const r2 = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'two',
        description_rich_content: paragraphDoc('b'),
      },
      randomUUID(),
    );
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    const n1 = Number((r1.json().display_id as string).split('-')[1]);
    const n2 = Number((r2.json().display_id as string).split('-')[1]);
    expect(n2).toBe(n1 + 1);
  });

  // ── 3. Idempotency match ──────────────────────────────────────────────
  it('same Idempotency-Key + same body → both 201 same id, one row', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-idem-m', 'IdemM MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const key = randomUUID();
    const body = {
      primary_managed_system_id: msId,
      title: 'idem match',
      description_rich_content: paragraphDoc('same'),
    };
    const r1 = await postVoc(app, reporter, body, key);
    const auditBeforeReplay = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.audit_log where event_type = 'voc_created'`,
    );
    const r2 = await postVoc(app, reporter, body, key);
    const auditAfterReplay = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.audit_log where event_type = 'voc_created'`,
    );
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r1.json().id).toBe(r2.json().id);
    expect(auditAfterReplay.rows[0]?.n).toBe(auditBeforeReplay.rows[0]?.n);
    const count = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from voc.vocs where primary_managed_system_id = $1`,
      [msId],
    );
    expect(count.rows[0]?.n).toBe(1);
  });

  // ── 4. Idempotency mismatch ───────────────────────────────────────────
  it('same Idempotency-Key + different body → 409 conflict.idempotency_key_reuse', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-idem-x', 'IdemX MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const key = randomUUID();
    const r1 = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'first',
        description_rich_content: paragraphDoc('a'),
      },
      key,
    );
    expect(r1.statusCode).toBe(201);
    const r2 = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'different title',
        description_rich_content: paragraphDoc('a'),
      },
      key,
    );
    expect(r2.statusCode).toBe(409);
    expect(r2.json().code).toBe('conflict.idempotency_key_reuse');
  });

  // ── 5. Missing Idempotency-Key ────────────────────────────────────────
  it('missing Idempotency-Key → 422 validation.failed with header path', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-noidem', 'NoIdem MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const res = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'x',
      description_rich_content: paragraphDoc('a'),
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('validation.failed');
    expect(body.detail?.fields?.[0]?.path).toEqual(['headers', 'idempotency-key']);
  });

  // ── 5b. Malformed Idempotency-Key (present but not UUIDv4) ───────────
  it('malformed Idempotency-Key (not UUIDv4) → 422 validation.malformed_idempotency_key', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-malformed', 'Malformed MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'x',
        description_rich_content: paragraphDoc('a'),
      },
      'not-a-uuid',
    );
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.malformed_idempotency_key');
  });

  // ── 6. Forbidden fields (6 fields) — severity tested separately ───────
  it.each([
    'reporter_id',
    'reporter_facing_status',
    'triage_state',
    'owner_user_id',
    'owner_team_id',
    'display_id',
  ])('forbidden field %s → 422 validation.unexpected_field', async (field) => {
    const admin = await loginAs(app, 'mock-admin-1');
    const safeSlug = `it-voc-fb-${field.replace(/_/g, '-')}`;
    const msId = await createMs(app, admin, safeSlug, 'Fb MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const body: Record<string, unknown> = {
      primary_managed_system_id: msId,
      title: 'x',
      description_rich_content: paragraphDoc('a'),
      [field]: field === 'display_id' ? 'VOC-9999' : randomUUID(),
    };
    if (field === 'reporter_facing_status') body[field] = 'reviewing';
    if (field === 'triage_state') body[field] = 'triaged';
    const res = await postVoc(app, reporter, body, randomUUID());
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.unexpected_field');
    expect(res.json().detail?.fields).toEqual([{ path: [field], code: 'unexpected_field' }]);
  });

  // ── 7. severity in body → dedicated code ──────────────────────────────
  it('severity in body → 422 voc.severity_not_user_settable', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-sev', 'Sev MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'x',
        description_rich_content: paragraphDoc('a'),
        severity: 'high',
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('voc.severity_not_user_settable');
    expect(res.json().detail?.fields).toEqual([{ path: ['severity'], code: 'unexpected_field' }]);
  });

  // ── 8. MS id from random/other workspace → 404 ────────────────────────
  it('non-existent MS id → 404 not_found.record', async () => {
    const reporter = await loginAs(app, 'mock-user-1');
    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: randomUUID(),
        title: 'x',
        description_rich_content: paragraphDoc('a'),
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('not_found.record');
  });

  // ── 9. Archived MS → 409 ──────────────────────────────────────────────
  it('archived MS → 409 conflict.parent_archived', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-arch-ms', 'Arch MS');
    // Archive via fops_migrate UPDATE (mirrors AA test pattern).
    if (!MIGRATE_URL) return;
    const ops = createDb(MIGRATE_URL);
    try {
      await ops.pool.query(
        `update core.managed_systems set archived_at = now(), archived_by_actor_id = (
           select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $2
         ) where id = $1`,
        [msId, WORKSPACE_ID],
      );
    } finally {
      await ops.close();
    }
    const reporter = await loginAs(app, 'mock-user-1');
    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'x',
        description_rich_content: paragraphDoc('a'),
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict.parent_archived');
    expect(res.json().detail?.fields).toEqual([
      { path: ['primary_managed_system_id'], code: 'parent_archived' },
    ]);
  });

  // ── 10. AA not in MS → 422 ───────────────────────────────────────────
  it('AA from another MS → 422 validation.failed analytics_area_id', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const ms1 = await createMs(app, admin, 'it-voc-aa-ms1', 'AaMs1');
    const ms2 = await createMs(app, admin, 'it-voc-aa-ms2', 'AaMs2');
    const aa2 = await createAa(app, admin, {
      managed_system_id: ms2,
      slug: 'it-voc-aa-x',
      name: 'X',
    });
    const reporter = await loginAs(app, 'mock-user-1');
    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: ms1,
        analytics_area_id: aa2,
        title: 'x',
        description_rich_content: paragraphDoc('a'),
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
    expect(res.json().detail?.fields).toEqual([
      { path: ['analytics_area_id'], code: 'out_of_scope' },
    ]);
  });

  // ── 11. Archived AA → 409 ────────────────────────────────────────────
  it('archived AA → 409 conflict.parent_archived', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-aa-arch', 'AaArch');
    const aaId = await createAa(app, admin, {
      managed_system_id: msId,
      slug: 'it-voc-aa-archs',
      name: 'AA-arch',
    });
    if (!MIGRATE_URL) return;
    const ops = createDb(MIGRATE_URL);
    try {
      await ops.pool.query(
        `update core.analytics_areas set archived_at = now(), archived_by_actor_id = (
           select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $2
         ) where id = $1`,
        [aaId, WORKSPACE_ID],
      );
    } finally {
      await ops.close();
    }
    const reporter = await loginAs(app, 'mock-user-1');
    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        analytics_area_id: aaId,
        title: 'x',
        description_rich_content: paragraphDoc('a'),
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict.parent_archived');
    expect(res.json().detail?.fields).toEqual([
      { path: ['analytics_area_id'], code: 'parent_archived' },
    ]);
  });

  // ── 12. Sanitizer rejections ──────────────────────────────────────────
  // expectedFieldsCode follows sanitize.ts fields_code semantics post-#23:
  //   - node-type / mark-type / shape failures → 'disallowed_node'
  //   - bad attr key → 'disallowed_attr_key'
  //   - bad attr value (URL scheme, UUID, length, etc.) → 'invalid_attr_value'
  it.each<
    [
      string,
      () => unknown,
      'rich_content.external_image_forbidden' | 'rich_content.disallowed_node',
      string,
    ]
  >([
    [
      'image node',
      () => ({
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'https://x.example/a.png' } }],
      }),
      'rich_content.external_image_forbidden',
      'external_image_forbidden',
    ],
    [
      'mention node',
      () => ({
        type: 'doc',
        content: [{ type: 'mention', attrs: { id: 'u-1' } }],
      }),
      'rich_content.disallowed_node',
      'disallowed_node',
    ],
    [
      'javascript: link',
      () => ({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'x',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
        ],
      }),
      'rich_content.disallowed_node',
      'invalid_attr_value',
    ],
    [
      'oversized text >50KB',
      () => ({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(50 * 1024 + 1) }] },
        ],
      }),
      'rich_content.disallowed_node',
      'disallowed_node',
    ],
    [
      'strike mark',
      () => ({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x', marks: [{ type: 'strike' }] }],
          },
        ],
      }),
      'rich_content.disallowed_node',
      'disallowed_node',
    ],
  ])('sanitizer rejects %s → 422 %s', async (_label, buildDoc, expectedCode, expectedFieldsCode) => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-san', 'San MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'x',
        description_rich_content: buildDoc(),
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe(expectedCode);
    expect(res.json().detail?.fields?.[0]?.path).toEqual(['description_rich_content']);
    expect(res.json().detail?.fields?.[0]?.code).toBe(expectedFieldsCode);
  });

  // ── 12b. Sanitizer attr-injection (#23) ─────────────────────────────────
  it('sanitizer rejects attachmentRef.attrs with disallowed_attr_key → 422', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-atki', 'AtKI MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const attrInjectionDoc = {
      type: 'doc',
      content: [
        {
          type: 'attachmentRef',
          attrs: { id: randomUUID(), onclick: 'x' },
        },
      ],
    };
    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'x',
        description_rich_content: attrInjectionDoc,
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('rich_content.disallowed_node');
    expect(res.json().detail?.fields?.[0]?.path).toEqual(['description_rich_content']);
    expect(res.json().detail?.fields?.[0]?.code).toBe('disallowed_attr_key');
    expect(res.json().detail?.hint).toMatch(/attrs\.onclick$/);
  });

  // ── 13. attachment_ids: [] accepted ───────────────────────────────────
  it('attachment_ids: [] → 201 (PLAN-22 C7b)', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-atte', 'AttE MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'x',
        description_rich_content: paragraphDoc('a'),
        attachment_ids: [],
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(201);
  });

  // ── 14a. attachment_ids with valid owned unlinked rows → 201 + linked ──
  it('attachment_ids with valid owned unlinked rows → 201 + linked (PLAN-22 C7b)', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-attok', 'AttOk MS');
    const reporter = await loginAs(app, 'mock-user-1');

    // Seed two unlinked attachment rows owned by the reporter.
    const a1 = await seedAttachment(
      dbHandle,
      reporterActorId,
      'attok-1',
      'image/png',
    );
    const a2 = await seedAttachment(
      dbHandle,
      reporterActorId,
      'attok-2',
      'image/png',
    );

    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'with attachments',
        description_rich_content: paragraphDoc('a'),
        attachment_ids: [a1, a2],
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(201);
    const vocId = res.json().id as string;

    // Both rows now point at voc_id + carry linked_at.
    const linked = await dbHandle.pool.query<{
      id: string;
      voc_id: string;
      linked_at: Date | null;
    }>(
      `select id, voc_id, linked_at from voc.voc_attachments where id = any($1)`,
      [[a1, a2]],
    );
    expect(linked.rows.length).toBe(2);
    for (const r of linked.rows) {
      expect(r.voc_id).toBe(vocId);
      expect(r.linked_at).not.toBeNull();
    }
  });

  // ── 14b. attachment_ids owned by another actor → 422 validation.failed ─
  it('attachment_ids referencing other-actor rows → 422 validation.failed (PLAN-22 C7b)', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-attowner', 'AttOwner MS');
    const reporter = await loginAs(app, 'mock-user-1');

    // Resolve a DIFFERENT actor id (admin) and seed under that actor.
    const adminActorRow = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const adminActorId = adminActorRow.rows[0]?.id;
    if (!adminActorId) throw new Error('admin actor not seeded');
    const aWrongOwner = await seedAttachment(
      dbHandle,
      adminActorId,
      'attowner-1',
      'image/png',
    );

    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'x',
        description_rich_content: paragraphDoc('a'),
        attachment_ids: [aWrongOwner],
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
    expect(res.json().detail?.fields?.[0]?.path).toEqual(['attachment_ids', 0]);
    expect(res.json().detail?.fields?.[0]?.code).toBe('invalid');

    // Row remains unlinked (tx rolled back).
    const after = await dbHandle.pool.query<{ voc_id: string | null; linked_at: Date | null }>(
      `select voc_id, linked_at from voc.voc_attachments where id = $1`,
      [aWrongOwner],
    );
    expect(after.rows[0]?.voc_id).toBeNull();
    expect(after.rows[0]?.linked_at).toBeNull();
  });

  // ── 14c. attachment_ids referencing already-linked rows → 422 ─────────
  it('attachment_ids referencing already-linked rows → 422 validation.failed (PLAN-22 C7b)', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-attlinked', 'AttLinked MS');
    const reporter = await loginAs(app, 'mock-user-1');

    // Seed an attachment + first VOC creation links it.
    const a = await seedAttachment(
      dbHandle,
      reporterActorId,
      'attlinked-1',
      'image/png',
    );
    const first = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'first',
        description_rich_content: paragraphDoc('a'),
        attachment_ids: [a],
      },
      randomUUID(),
    );
    expect(first.statusCode).toBe(201);

    // Second create that references the now-linked row → 422.
    const second = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'second',
        description_rich_content: paragraphDoc('b'),
        attachment_ids: [a],
      },
      randomUUID(),
    );
    expect(second.statusCode).toBe(422);
    expect(second.json().code).toBe('validation.failed');
    expect(second.json().detail?.fields?.[0]?.path).toEqual(['attachment_ids', 0]);
  });

  // ── 15. Audit row written on success ──────────────────────────────────
  it.skipIf(!MIGRATE_URL)('successful create writes voc_created audit row', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-aud', 'Aud MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'with audit',
        description_rich_content: paragraphDoc('a'),
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(201);
    const vocId = res.json().id as string;
    const ops = createDb(MIGRATE_URL);
    try {
      const r = await ops.pool.query<{ subject_id: string; detail: Record<string, unknown> }>(
        `select subject_id, detail from core.audit_log
          where event_type = 'voc_created' and subject_id = $1`,
        [vocId],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0]?.detail).toMatchObject({
        voc_id: vocId,
        primary_managed_system_id: msId,
        reporter_id: reporterActorId,
        source_context: 'direct_use',
      });
    } finally {
      await ops.close();
    }
  });

  // ── 16. Audit rollback on sanitizer failure ───────────────────────────
  it.skipIf(!MIGRATE_URL)('failing sanitizer create does NOT bump voc_created count', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-rb', 'Rb MS');
    const reporter = await loginAs(app, 'mock-user-1');

    const before = await (async () => {
      const ops = createDb(MIGRATE_URL);
      try {
        const r = await ops.pool.query<{ n: number }>(
          `select count(*)::int as n from core.audit_log where event_type = 'voc_created'`,
        );
        return r.rows[0]?.n ?? 0;
      } finally {
        await ops.close();
      }
    })();

    const res = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'will fail',
        description_rich_content: {
          type: 'doc',
          content: [{ type: 'image', attrs: { src: 'https://x.example/a.png' } }],
        },
      },
      randomUUID(),
    );
    expect(res.statusCode).toBe(422);

    const after = await (async () => {
      const ops = createDb(MIGRATE_URL);
      try {
        const r = await ops.pool.query<{ n: number }>(
          `select count(*)::int as n from core.audit_log where event_type = 'voc_created'`,
        );
        return r.rows[0]?.n ?? 0;
      } finally {
        await ops.close();
      }
    })();
    expect(after).toBe(before);
  });

  // ── 17. Rate limit ────────────────────────────────────────────────────
  it('exceeding mutation tier → 429 rate_limited.actor with retry-after', async () => {
    // Mutation tier: max=10 / 60s (server.ts mutationKeyGenerator). After
    // adversarial review fix API-C-2 the keyGenerator resolves actor_id
    // from the session cookie BEFORE requireSession runs, so the bucket
    // is reliably per-Actor. We can now assert the strict contract:
    //   - exactly 10 successes from the reporter cookie, then 429 on #11
    //   - 429 envelope is `rate_limited.actor` with `retry-after` header
    //   - a SECOND actor (admin) is not throttled by reporter's bucket
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-voc-rate', 'Rate MS');
    const reporter = await loginAs(app, 'mock-user-1');

    for (let i = 0; i < 10; i++) {
      const r = await postVoc(
        app,
        reporter,
        {
          primary_managed_system_id: msId,
          title: `rate ${i}`,
          description_rich_content: paragraphDoc('a'),
        },
        randomUUID(),
      );
      if (r.statusCode !== 201) {
        throw new Error(`expected 201 at i=${i}, got ${r.statusCode}: ${r.body}`);
      }
    }

    const limited = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'rate 11',
        description_rich_content: paragraphDoc('a'),
      },
      randomUUID(),
    );
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe('rate_limited.actor');
    expect(limited.headers['retry-after']).toBeDefined();

    // Per-actor isolation: a second actor (admin) hitting the same route
    // immediately after must NOT be throttled by the reporter's bucket.
    // Proves keying is per actor_id, not per IP.
    const adminVoc = await postVoc(
      app,
      admin,
      {
        primary_managed_system_id: msId,
        title: 'admin slips through',
        description_rich_content: paragraphDoc('a'),
      },
      randomUUID(),
    );
    expect(adminVoc.statusCode).toBe(201);
  });

  // ── 18. Concurrent archive race ───────────────────────────────────────
  // Drives the SELECT … FOR UPDATE race in voc/repo.ts:lockManagedSystem
  // deterministically: a dedicated pg client opens a transaction and UPDATEs
  // the managed_systems row (acquiring FOR NO KEY UPDATE), then we issue
  // POST /vocs in parallel — the create handler reaches lockManagedSystem
  // and BLOCKS on the conflicting row lock. We wait for the handler to
  // park at the lock, then COMMIT the archive; the unblocked SELECT FOR
  // UPDATE sees archived_at populated and the service throws
  // conflict.parent_archived. Without this test a regression that drops
  // FOR UPDATE from lockManagedSystem would be undetectable in CI; case
  // #9 only exercises the post-archive read path, not the locking semantics.
  // Findings: adversarial review API-C-1, DB-B-4.
  it.skipIf(!MIGRATE_URL)(
    'concurrent archive race → 409 conflict.parent_archived (FOR UPDATE)',
    async () => {
      const admin = await loginAs(app, 'mock-admin-1');
      const msId = await createMs(app, admin, 'it-voc-race', 'Race MS');
      const reporter = await loginAs(app, 'mock-user-1');

      // Resolve admin actor_id for archived_by_actor_id FK.
      const adminRow = await dbHandle.pool.query<{ id: string }>(
        `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
        [WORKSPACE_ID],
      );
      const adminActorId = adminRow.rows[0]?.id;
      if (!adminActorId) throw new Error('admin actor not found');

      const racer = await dbHandle.pool.connect();
      try {
        await racer.query('BEGIN');
        // Take a row-level lock (FOR NO KEY UPDATE) on the MS row but do
        // NOT commit yet. The POST handler's SELECT … FOR UPDATE in
        // lockManagedSystem will block on this lock.
        await racer.query(
          `update core.managed_systems
             set archived_at = now(), archived_by_actor_id = $1
           where id = $2`,
          [adminActorId, msId],
        );

        // Fire the POST /vocs in parallel — it will park inside the
        // service transaction at lockManagedSystem's FOR UPDATE.
        const postPromise = postVoc(
          app,
          reporter,
          {
            primary_managed_system_id: msId,
            title: 'race',
            description_rich_content: paragraphDoc('a'),
          },
          randomUUID(),
        );

        // Give the POST handler time to reach lockManagedSystem and block
        // on the row lock. 200ms is generous on a local pg; we cannot
        // observe the wait directly, but if it has not parked yet the
        // subsequent COMMIT simply makes the row already-archived which
        // still yields conflict.parent_archived — the assertion below
        // remains correct either way.
        await new Promise((r) => setTimeout(r, 200));

        // Release the lock; the parked SELECT FOR UPDATE now proceeds,
        // sees archived_at populated, and the service rejects with
        // conflict.parent_archived.
        await racer.query('COMMIT');

        const res = await postPromise;
        expect(res.statusCode).toBe(409);
        expect(res.json().code).toBe('conflict.parent_archived');
        expect(res.json().detail?.fields).toEqual([
          { path: ['primary_managed_system_id'], code: 'parent_archived' },
        ]);
      } catch (err) {
        // Best-effort rollback if assertion above never ran or COMMIT
        // failed; release() in finally returns the connection to the pool.
        try {
          await racer.query('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw err;
      } finally {
        racer.release();
      }
    },
  );
});
