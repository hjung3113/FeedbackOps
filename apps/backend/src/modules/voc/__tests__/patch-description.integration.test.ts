// PATCH /vocs/:id/description integration tests — Slice 3 #17 acceptance coverage.
//
// Mirrors patch-voc.integration.test.ts harness.
// Gate: DATABASE_URL + WORKSPACE_ID. Skips if not configured.

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

async function postVoc(
  app: FastifyInstance,
  cookie: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
) {
  const res = await app.inject({
    method: 'POST',
    url: '/vocs',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    payload: body,
  });
  if (res.statusCode !== 201) throw new Error(`postVoc failed: ${res.statusCode} ${res.body}`);
  return res.json() as { id: string; display_id: string; updated_at: string };
}

function patchDescription(
  app: FastifyInstance,
  cookie: string,
  vocId: string,
  body: Record<string, unknown>,
  opts: { idempotencyKey?: string; ifMatch?: string } = {},
) {
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
    'content-type': 'application/json',
  };
  if (opts.idempotencyKey !== undefined) headers['idempotency-key'] = opts.idempotencyKey;
  if (opts.ifMatch !== undefined) headers['if-match'] = opts.ifMatch;
  return app.inject({
    method: 'PATCH',
    url: `/vocs/${vocId}/description`,
    headers,
    payload: body,
  });
}

// Inserts a reporter-role actor directly. Returns id + externalId.
async function insertReporterActor(
  dbHandle: DbHandle,
  workspaceId: string,
  suffix: string,
): Promise<{ id: string; externalId: string }> {
  const externalId = `mock-reporter-${suffix}`;
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $4, 'user', 'internal_member')
       on conflict (workspace_id, external_id) do update set email = excluded.email
       returning id`,
    [workspaceId, externalId, `reporter-${suffix}@local`, `Reporter ${suffix}`],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertReporterActor failed for ${externalId}`);
  return { id, externalId };
}

// Inserts a developer-role actor directly.
async function insertDevActor(
  dbHandle: DbHandle,
  workspaceId: string,
  suffix: string,
): Promise<{ id: string; externalId: string }> {
  const externalId = `mock-dev-desc-${suffix}`;
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $4, 'developer', 'internal_member')
       on conflict (workspace_id, external_id) do update set email = excluded.email
       returning id`,
    [workspaceId, externalId, `dev-desc-${suffix}@local`, `Dev Desc ${suffix}`],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertDevActor failed for ${externalId}`);
  return { id, externalId };
}

// Grants voc.triage for a managed system.
async function grantVocTriage(
  dbHandle: DbHandle,
  workspaceId: string,
  actorId: string,
  msId: string,
  grantedByActorId: string,
): Promise<void> {
  await dbHandle.pool.query(
    `insert into permission.permission_grants
       (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
     values ($1, $2, 'voc.triage', $3, $4)
     on conflict do nothing`,
    [workspaceId, actorId, msId, grantedByActorId],
  );
}

// Archives a VOC row directly.
async function archiveVoc(dbHandle: DbHandle, vocId: string): Promise<void> {
  await dbHandle.pool.query(
    `update voc.vocs set archived_at = now() where id = $1`,
    [vocId],
  );
}

// Archives a managed system directly.
async function archiveMs(dbHandle: DbHandle, msId: string): Promise<void> {
  await dbHandle.pool.query(
    `update core.managed_systems set archived_at = now() where id = $1`,
    [msId],
  );
}

// Forces triage_state to a non-untriaged value directly.
async function forceTriageState(
  dbHandle: DbHandle,
  vocId: string,
  state: string,
): Promise<void> {
  await dbHandle.pool.query(
    `update voc.vocs set triage_state = $2, updated_at = now() where id = $1`,
    [vocId, state],
  );
}

// Returns audit detail rows for a given subject + event.
async function getAuditDetail(
  vocId: string,
  eventType: string,
): Promise<Record<string, unknown> | null> {
  if (!MIGRATE_URL) return null;
  const ops = createDb(MIGRATE_URL);
  try {
    const rows = await ops.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log where subject_id = $1 and event_type = $2 order by created_at asc limit 1`,
      [vocId, eventType],
    );
    return rows.rows[0]?.detail ?? null;
  } finally {
    await ops.close();
  }
}

// Counts audit rows of a given type for subject.
async function countAuditRows(vocId: string, eventType: string): Promise<number> {
  if (!MIGRATE_URL) return -1;
  const ops = createDb(MIGRATE_URL);
  try {
    const rows = await ops.pool.query<{ n: string }>(
      `select count(*) as n from core.audit_log where subject_id = $1 and event_type = $2`,
      [vocId, eventType],
    );
    return parseInt(rows.rows[0]?.n ?? '0', 10);
  } finally {
    await ops.close();
  }
}

describe.skipIf(!runIntegration)('PATCH /vocs/:id/description (#17)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let adminActorId: string;

  async function cleanupProductTables() {
    await dbHandle.pool.query(
      `delete from permission.permission_grants
        where workspace_id = $1
          and actor_id in (
            select id from core.actors
              where (external_id like 'mock-dev-desc-%' or external_id like 'mock-reporter-%')
                and workspace_id = $1
          )`,
      [WORKSPACE_ID],
    );
    await dbHandle.pool.query(
      `delete from voc.vocs
        where primary_managed_system_id in (
          select id from core.managed_systems where slug like 'it-pd-%'
        )`,
    );
    await dbHandle.pool.query(
      `delete from core.analytics_areas
        where managed_system_id in (
          select id from core.managed_systems where slug like 'it-pd-%'
        )`,
    );
    await dbHandle.pool.query(`delete from core.managed_systems where slug like 'it-pd-%'`);
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query('delete from core.rate_limits');
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'
         or actor_id in (
           select id from core.actors
             where (external_id like 'mock-dev-desc-%' or external_id like 'mock-reporter-%')
               and workspace_id = $1
         )`,
      [WORKSPACE_ID],
    );
    await dbHandle.pool.query(
      `delete from core.actors
        where (external_id like 'mock-dev-desc-%' or external_id like 'mock-reporter-%')
          and workspace_id = $1`,
      [WORKSPACE_ID],
    );
  }

  async function cleanupAuditLog() {
    if (!MIGRATE_URL) return;
    const ops = createDb(MIGRATE_URL);
    try {
      await ops.pool.query(
        `delete from core.audit_log
          where event_type in (
            'voc_created', 'voc_description_edited',
            'managed_system_registered'
          )
          and subject_id in (
            select id from voc.vocs
             where primary_managed_system_id in (
               select id from core.managed_systems where slug like 'it-pd-%'
             )
            union
            select id from core.managed_systems where slug like 'it-pd-%'
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

    const r = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const id = r.rows[0]?.id;
    if (!id) throw new Error(`mock-admin-1 in ${WORKSPACE_ID} not found`);
    adminActorId = id;
  });

  afterAll(async () => {
    await cleanupAuditLog();
    await cleanupProductTables();
    await app?.close();
    await dbHandle?.close();
  });

  beforeEach(async () => {
    await cleanupAuditLog();
    await cleanupProductTables();
  });

  // ── Happy paths ──────────────────────────────────────────────────────────

  // Case 1: all 3 fields
  it('case 1: Reporter edits own untriaged VOC with all 3 fields → 200, audit row with full diff', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-happy-all', 'Happy All');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'original title',
      description_rich_content: paragraphDoc('original'),
    }, randomUUID());

    const res = await patchDescription(app, reporter, voc.id, {
      title: 'updated title',
      description_rich_content: paragraphDoc('updated content'),
      attachments: [],
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBe('updated title');
    expect(body.updated_at).not.toBe(voc.updated_at);

    if (MIGRATE_URL) {
      const detail = await getAuditDetail(voc.id, 'voc_description_edited');
      expect(detail).not.toBeNull();
      expect(detail?.changes).toMatchObject({
        title: { from: 'original title', to: 'updated title' },
      });
      expect((detail?.changes as Record<string, unknown>).description_rich_content).toBeDefined();
    }
  });

  // Case 2: title-only
  it('case 2: title-only edit → 200; audit changes carries only title', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-title-only', 'Title Only');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'old title',
      description_rich_content: paragraphDoc('body'),
    }, randomUUID());

    const res = await patchDescription(app, reporter, voc.id, {
      title: 'new title',
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe('new title');

    if (MIGRATE_URL) {
      const detail = await getAuditDetail(voc.id, 'voc_description_edited');
      expect(detail?.changes).toMatchObject({ title: { from: 'old title', to: 'new title' } });
      expect((detail?.changes as Record<string, unknown>).description_rich_content).toBeUndefined();
    }
  });

  // Case 3: description-only
  it('case 3: description_rich_content-only edit → 200; audit carries from_hash/to_hash', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-desc-only', 'Desc Only');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'title stays',
      description_rich_content: paragraphDoc('original body'),
    }, randomUUID());

    const res = await patchDescription(app, reporter, voc.id, {
      description_rich_content: paragraphDoc('updated body'),
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(200);

    if (MIGRATE_URL) {
      const detail = await getAuditDetail(voc.id, 'voc_description_edited');
      const changes = detail?.changes as Record<string, unknown> | undefined;
      expect(changes?.description_rich_content).toBeDefined();
      const hashChange = changes?.description_rich_content as { from_hash: string; to_hash: string };
      expect(hashChange.from_hash).toHaveLength(64);
      expect(hashChange.to_hash).toHaveLength(64);
      expect(hashChange.from_hash).not.toBe(hashChange.to_hash);
      expect(changes?.title).toBeUndefined();
    }
  });

  // Case 4: empty attachments when current is also empty — no diff
  it('case 4: attachments: [] when current is [] → no attachments diff; if title unchanged → no audit', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-attach-noop', 'Attach Noop');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'same title',
      description_rich_content: paragraphDoc('same body'),
    }, randomUUID());

    // Send title same value + attachments: [] — only attachments in body
    // but title is unchanged and description is unchanged, so empty diff.
    const res = await patchDescription(app, reporter, voc.id, {
      attachments: [],
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(200);
    // updated_at should NOT change — empty diff
    expect(res.json().updated_at).toBe(voc.updated_at);

    if (MIGRATE_URL) {
      const count = await countAuditRows(voc.id, 'voc_description_edited');
      expect(count).toBe(0);
    }
  });

  // ── Permission ──────────────────────────────────────────────────────────

  // Case 5: other reporter
  it('case 5: other Reporter on someone else\'s VOC → 403 permission.denied', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-other-reporter', 'Other Reporter');
    const reporter1 = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter1, {
      primary_managed_system_id: msId,
      title: 'reporter1 voc',
      description_rich_content: paragraphDoc('body'),
    }, randomUUID());

    // Create a second reporter
    const { externalId: r2ExternalId } = await insertReporterActor(
      dbHandle, WORKSPACE_ID, `5-${randomUUID().slice(0, 8)}`,
    );
    const reporter2 = await loginAs(app, r2ExternalId);

    const res = await patchDescription(app, reporter2, voc.id, {
      title: 'hacked title',
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('permission.denied');
  });

  // Case 6: workspace admin
  it('case 6: Workspace Admin on reporter\'s VOC → 403 permission.denied (no admin elevation)', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-admin-denied', 'Admin Denied');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'reporter voc',
      description_rich_content: paragraphDoc('body'),
    }, randomUUID());

    const res = await patchDescription(app, admin, voc.id, {
      title: 'admin edited',
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('permission.denied');
  });

  // Case 7: developer with voc.triage capability
  it('case 7: Developer with voc.triage capability → 403 permission.denied', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-dev-denied', 'Dev Denied');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'reporter voc',
      description_rich_content: paragraphDoc('body'),
    }, randomUUID());

    const { id: devId, externalId: devExtId } = await insertDevActor(
      dbHandle, WORKSPACE_ID, `7-${randomUUID().slice(0, 8)}`,
    );
    await grantVocTriage(dbHandle, WORKSPACE_ID, devId, msId, adminActorId);
    const dev = await loginAs(app, devExtId);

    const res = await patchDescription(app, dev, voc.id, {
      title: 'dev hacked',
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('permission.denied');
  });

  // ── State ───────────────────────────────────────────────────────────────

  // Case 8: triaged VOC
  it('case 8: triaged VOC (triage_state=triaged) → 409 conflict.triage_already_committed', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-triaged', 'Triaged');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'to be triaged',
      description_rich_content: paragraphDoc('body'),
    }, randomUUID());

    // Force triage state via SQL
    await forceTriageState(dbHandle, voc.id, 'triaged');

    // Refresh updated_at
    const fresh = await dbHandle.pool.query<{ updated_at: string }>(
      `select updated_at::text as updated_at from voc.vocs where id = $1`,
      [voc.id],
    );
    const freshAt = fresh.rows[0]?.updated_at ?? voc.updated_at;

    const res = await patchDescription(app, reporter, voc.id, {
      title: 'edit after triage',
    }, { idempotencyKey: randomUUID(), ifMatch: freshAt });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe('conflict.triage_already_committed');
    expect(body.detail?.current_triage_state).toBe('triaged');
  });

  // Case 9: archived VOC
  it('case 9: archived VOC → 409 conflict.record_archived', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-archived', 'Archived');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'to be archived',
      description_rich_content: paragraphDoc('body'),
    }, randomUUID());

    await archiveVoc(dbHandle, voc.id);

    const res = await patchDescription(app, reporter, voc.id, {
      title: 'edit archived',
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict.record_archived');
  });

  // Case 10: archived parent MS
  it('case 10: archived parent MS → 409 conflict.parent_archived', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-parent-arch', 'Parent Archived');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'reporter voc',
      description_rich_content: paragraphDoc('body'),
    }, randomUUID());

    await archiveMs(dbHandle, msId);

    const res = await patchDescription(app, reporter, voc.id, {
      title: 'edit with archived ms',
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict.parent_archived');
  });

  // ── Validation ───────────────────────────────────────────────────────────

  // Case 11: empty body
  it('case 11: empty body → 422 validation.failed', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-empty-body', 'Empty Body');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const res = await patchDescription(app, reporter, voc.id, {}, {
      idempotencyKey: randomUUID(), ifMatch: voc.updated_at,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
  });

  // Case 12: single forbidden field (severity)
  it('case 12: forbidden field severity → 422 validation.unexpected_field with fields[0].path=[severity]', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-forbidden-sev', 'Forbidden Sev');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const res = await patchDescription(app, reporter, voc.id, { severity: 'high' }, {
      idempotencyKey: randomUUID(), ifMatch: voc.updated_at,
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('validation.unexpected_field');
    expect(body.detail?.fields?.[0]?.path).toContain('severity');
  });

  // Case 13: multiple forbidden fields — fields[] carries each
  it('case 13: multiple forbidden fields → 422; first forbidden field returned', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-forbidden-multi', 'Forbidden Multi');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    // Route pre-checks one at a time in FORBIDDEN list order; first match fires
    const res = await patchDescription(app, reporter, voc.id, {
      severity: 'low',
      triage_state: 'triaged',
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.unexpected_field');
  });

  // Case 14: bad title (201 chars)
  it('case 14: title 201 chars → 422 validation.failed', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-bad-title', 'Bad Title');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const res = await patchDescription(app, reporter, voc.id, {
      title: 'a'.repeat(201),
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
  });

  // Case 15: non-empty attachments
  it('case 15: non-empty attachments → 422 attachment.unsupported_pending_storage_slice', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-attach-unsup', 'Attach Unsupported');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const res = await patchDescription(app, reporter, voc.id, {
      attachments: [{
        id: randomUUID(),
        name: 'file.txt',
        size_bytes: 100,
        mime_type: 'text/plain',
        storage_uri: 'gs://bucket/file.txt',
      }],
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('attachment.unsupported_pending_storage_slice');
  });

  // ── Sanitizer ───────────────────────────────────────────────────────────

  // Case 16: image node rejected
  it('case 16: description_rich_content with image node → 422 rich_content.external_image_forbidden', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-img-forbidden', 'Img Forbidden');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const docWithImage = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'https://example.com/img.png', alt: 'img' },
        },
      ],
    };

    const res = await patchDescription(app, reporter, voc.id, {
      description_rich_content: docWithImage,
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('rich_content.external_image_forbidden');
  });

  // Case 17: javascript link rejected
  it('case 17: description_rich_content with javascript: href → 422 rich_content.disallowed_node', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-js-link', 'JS Link');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const docWithJsLink = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click me',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    };

    const res = await patchDescription(app, reporter, voc.id, {
      description_rich_content: docWithJsLink,
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('rich_content.disallowed_node');
    // post-#23: fields_code differentiates value-failure from key-failure
    expect(body.detail?.fields?.[0]?.code).toBe('invalid_attr_value');
  });

  // ── Headers ──────────────────────────────────────────────────────────────

  // Case 18: missing If-Match
  it('case 18: missing If-Match → 422 validation.failed with fields[0].path=[headers,if-match]', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-no-ifmatch', 'No IfMatch');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const res = await patchDescription(app, reporter, voc.id, { title: 'new' }, {
      idempotencyKey: randomUUID(),
      // no ifMatch
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('validation.failed');
    expect(body.detail?.fields?.[0]?.path).toEqual(['headers', 'if-match']);
  });

  // Case 19: If-Match mismatch
  it('case 19: If-Match mismatch → 409 conflict.stale_write with detail.current_updated_at', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-stale', 'Stale');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const bogus = '1970-01-01T00:00:00.000Z';
    const res = await patchDescription(app, reporter, voc.id, { title: 'new' }, {
      idempotencyKey: randomUUID(),
      ifMatch: bogus,
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe('conflict.stale_write');
    expect(body.detail?.current_updated_at).toBeDefined();
    expect(body.detail?.current_updated_at).not.toBe(bogus);
  });

  // ── Concurrency ──────────────────────────────────────────────────────────

  // Case 20: Reporter starts edit; admin commits triage first
  it('case 20: admin commits triage between Reporter\'s lock and edit → 409 conflict.triage_already_committed', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-race-triage', 'Race Triage');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'race voc',
      description_rich_content: paragraphDoc('body'),
    }, randomUUID());

    // Admin commits triage directly via SQL (simulates concurrent admin PATCH)
    await forceTriageState(dbHandle, voc.id, 'triaged');

    // Reporter now tries to edit description with original If-Match
    const res = await patchDescription(app, reporter, voc.id, { title: 'new title' }, {
      idempotencyKey: randomUUID(),
      ifMatch: voc.updated_at,
    });

    // State check fires (triage_already_committed) before If-Match comparison
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict.triage_already_committed');
  });

  // Case 21: stale If-Match race (sequential simulation)
  it('case 21: second PATCH with stale If-Match → 409 conflict.stale_write', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-race-stale', 'Race Stale');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'race voc 2',
      description_rich_content: paragraphDoc('body'),
    }, randomUUID());

    // First edit succeeds
    const res1 = await patchDescription(app, reporter, voc.id, { title: 'first edit' }, {
      idempotencyKey: randomUUID(),
      ifMatch: voc.updated_at,
    });
    expect(res1.statusCode).toBe(200);

    // Second edit with original (now stale) If-Match
    const res2 = await patchDescription(app, reporter, voc.id, { title: 'second edit' }, {
      idempotencyKey: randomUUID(),
      ifMatch: voc.updated_at, // stale
    });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().code).toBe('conflict.stale_write');
  });

  // ── Idempotency ──────────────────────────────────────────────────────────

  // Case 22: replay same key
  it('case 22: same Idempotency-Key + body + If-Match replay → cached 200', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-idem-replay', 'Idem Replay');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const key = randomUUID();
    const body = { title: 'idempotent title' };

    const res1 = await patchDescription(app, reporter, voc.id, body, {
      idempotencyKey: key, ifMatch: voc.updated_at,
    });
    expect(res1.statusCode).toBe(200);
    const firstBody = res1.json();

    // Replay — deep-equal envelope. Byte-equal not enforced because the
    // idempotency cache stores the parsed object then re-serializes on replay;
    // V8 key order from cache differs from initial response order. Deep-equal
    // (vitest .toEqual) locks the *content* invariant which is what
    // idempotency semantics require.
    const res2 = await patchDescription(app, reporter, voc.id, body, {
      idempotencyKey: key, ifMatch: voc.updated_at,
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual(firstBody);
  });

  // Case 23: same key, different body → 409 idempotency_key_reuse
  it('case 23: same Idempotency-Key, different body → 409 conflict.idempotency_key_reuse', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-idem-mismatch', 'Idem Mismatch');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const key = randomUUID();
    const res1 = await patchDescription(app, reporter, voc.id, { title: 'body A' }, {
      idempotencyKey: key, ifMatch: voc.updated_at,
    });
    expect(res1.statusCode).toBe(200);

    // Different body, same key
    const res2 = await patchDescription(app, reporter, voc.id, { title: 'body B' }, {
      idempotencyKey: key, ifMatch: voc.updated_at,
    });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().code).toBe('conflict.idempotency_key_reuse');
  });

  // Case 24: same key + body, refreshed If-Match → 409 (hash includes If-Match)
  it('case 24: same key, different If-Match → 409 conflict.idempotency_key_reuse', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-idem-ifmatch', 'Idem IfMatch');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const key = randomUUID();
    const res1 = await patchDescription(app, reporter, voc.id, { title: 'same body' }, {
      idempotencyKey: key, ifMatch: voc.updated_at,
    });
    expect(res1.statusCode).toBe(200);
    const freshAt = res1.json().updated_at as string;

    // Same key, same body, but fresh If-Match → different hash → mismatch
    const res2 = await patchDescription(app, reporter, voc.id, { title: 'same body' }, {
      idempotencyKey: key, ifMatch: freshAt,
    });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().code).toBe('conflict.idempotency_key_reuse');
  });

  // ── Rate limit ───────────────────────────────────────────────────────────

  // Case 25: 30 PATCHes succeed; 31st → 429 rate_limited.actor.
  // Locks the dedicated reporterEdit bucket (30/min), not the shared mutation
  // bucket (which would fire at the 11th). Cycle-1 codex MAJOR fix.
  it('case 25: 30 PATCHes succeed, 31st → 429 rate_limited.actor', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-ratelimit', 'Rate Limit');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    // clear rate limits before test
    await dbHandle.pool.query('delete from core.rate_limits');

    let updatedAt = voc.updated_at;
    const statuses: number[] = [];

    for (let i = 0; i < 31; i++) {
      const res = await patchDescription(
        app, reporter, voc.id,
        { title: `edit ${i}` },
        { idempotencyKey: randomUUID(), ifMatch: updatedAt },
      );
      statuses.push(res.statusCode);
      if (res.statusCode === 200) {
        updatedAt = (res.json() as { updated_at: string }).updated_at;
      }
    }

    // First 30 should succeed, 31st should be 429.
    expect(statuses.slice(0, 30).every(s => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  // ── NewCoverage (cases 26-28) ─────────────────────────────────────────────

  // Case 26: Reporter + stale If-Match + already-triaged → state check fires first
  it('case 26: Reporter + stale If-Match + triaged VOC → 409 conflict.triage_already_committed (state before If-Match)', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-order-26', 'Order 26');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    await forceTriageState(dbHandle, voc.id, 'triaged');
    const bogus = '1970-01-01T00:00:00.000Z';

    const res = await patchDescription(app, reporter, voc.id, { title: 'new' }, {
      idempotencyKey: randomUUID(),
      ifMatch: bogus, // stale
    });

    // triage_already_committed fires before stale_write (per plan §ordering)
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict.triage_already_committed');
  });

  // Case 27: unknown field not on forbidden list → validation.failed (zod unrecognized_keys)
  it('case 27: body with unknown field (foobar) not on forbidden list → 422 validation.failed', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-unknown-27', 'Unknown 27');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: paragraphDoc('x'),
    }, randomUUID());

    const res = await patchDescription(app, reporter, voc.id, {
      title: 'ok',
      foobar: 'unknown key',
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
  });

  // Case 28: stable-stringify regression. voc-description surface allows attrs only on
  // attachmentRef (single key 'id') — no multi-key attr to shuffle within. So we exercise
  // the diff-via-hash path by re-submitting a structurally equivalent doc and asserting
  // no audit row. Multi-key attr-order invariance is covered directly by the unit test
  // suite for stableStringify (apps/backend/src/lib/json/__tests__/stable-stringify.test.ts).
  it('case 28: re-submitting structurally-equal description → empty diff, no audit', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-pd-stable-28', 'Stable 28');
    const reporter = await loginAs(app, 'mock-user-1');

    const docOriginal = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'stable diff test' }] },
      ],
    };

    const voc = await postVoc(app, reporter, {
      primary_managed_system_id: msId,
      title: 'v',
      description_rich_content: docOriginal,
    }, randomUUID());

    // Re-submit a freshly-built doc that is structurally identical. Sanitizer's
    // canonical rebuild on both sides produces identical canonical JSON →
    // identical SHA-256 → empty diff → 200 with no audit row.
    const docResubmit = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'stable diff test' }] },
      ],
    };

    const res = await patchDescription(app, reporter, voc.id, {
      description_rich_content: docResubmit,
    }, { idempotencyKey: randomUUID(), ifMatch: voc.updated_at });

    expect(res.statusCode).toBe(200);

    if (MIGRATE_URL) {
      const count = await countAuditRows(voc.id, 'voc_description_edited');
      expect(count).toBe(0);
    }
  });
});
