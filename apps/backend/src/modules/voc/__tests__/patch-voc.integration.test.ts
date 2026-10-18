import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { cleanupResponsibilityFailures } from '../../../test-support/responsibility-fixtures.js';
// PATCH /vocs/:id integration tests — Slice 3 #14 acceptance coverage.
//
// Mirrors create-voc.integration.test.ts harness:
//   * buildServer + cookie session via POST /auth/mock-login.
//   * fops_app pool for product-table cleanup.
//   * fops_migrate pool for core.audit_log cleanup.
//
// Gate: DATABASE_URL + WORKSPACE_ID. Without DATABASE_URL_MIGRATE the suite
// runs but skips audit-log assertions gracefully (matches POST suite).

import { randomUUID } from 'node:crypto';
import { vocOwnerCandidatesSchema } from '@fops/shared';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { insertMsDirectly, insertTeamDirectly } from '../../../test-support/core-fixtures.js';
import {
  denyCapability,
  expireCapabilityGrant,
  grantCapability,
  revokeCapabilityGrant,
} from '../../../test-support/permissions-fixtures.js';
import {
  cleanupTestActorsByExternalIdPrefix,
  insertVocDirectly,
} from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

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

function patchVoc(
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
  return app.inject({ method: 'PATCH', url: `/vocs/${vocId}`, headers, payload: body });
}

// Inserts a developer-role actor directly. Returns id + externalId.
// Used for developer-scope tests where mock-login needs an existing actor.
async function insertDevActor(
  dbHandle: DbHandle,
  workspaceId: string,
  suffix: string,
): Promise<{ id: string; externalId: string }> {
  const externalId = `mock-dev-${suffix}`;
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $4, 'developer', 'internal_member')
       on conflict (workspace_id, external_id) do update set email = excluded.email
       returning id`,
    [workspaceId, externalId, `dev-${suffix}@local`, `Dev ${suffix}`],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertDevActor failed for ${externalId}`);
  return { id, externalId };
}

// Grants voc.triage for a managed system. Returns grant id.
// Uses APP_URL pool — fops_app has INSERT on permission.permission_grants.
async function grantVocTriage(
  dbHandle: DbHandle,
  workspaceId: string,
  actorId: string,
  msId: string,
  grantedByActorId: string,
): Promise<string> {
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into permission.permission_grants
       (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
     values ($1, $2, 'voc.triage', $3, $4)
     returning id`,
    [workspaceId, actorId, msId, grantedByActorId],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error('grantVocTriage: no id returned');
  return id;
}

// Archives a VOC row directly via SQL (simulates the archived state for
// tests that need to bypass normal archive flows).
async function archiveVoc(dbHandle: DbHandle, vocId: string): Promise<void> {
  await dbHandle.pool.query('update voc.vocs set archived_at = now() where id = $1', [vocId]);
}

// Returns all audit event_type values for a given subject_id, in
// insertion order. Requires MIGRATE_URL; returns [] if not available.
async function getAuditTypes(vocId: string): Promise<string[]> {
  if (!MIGRATE_URL) return [];
  const ops = createDb(MIGRATE_URL);
  try {
    const rows = await ops.pool.query<{ event_type: string }>(
      // Same-transaction rows tie on created_at: id is defaultRandom()
      // (core.ts:210) and created_at is defaultNow() (core.ts:225), so neither
      // encodes insert order. ctid does: core.audit_log is append-only for
      // fops_app (UPDATE denied by role grants), so ctid order == insert order
      // and the sequence below becomes deterministic.
      `select event_type from core.audit_log where subject_id = $1
       order by created_at asc, ctid asc`,
      [vocId],
    );
    return rows.rows.map((r) => r.event_type);
  } finally {
    await ops.close();
  }
}

// Returns the `detail` JSON for the first audit row matching event_type for
// the given subject_id. Returns null if MIGRATE_URL is absent or no row found.
async function getAuditDetail(
  vocId: string,
  eventType: string,
): Promise<Record<string, unknown> | null> {
  if (!MIGRATE_URL) return null;
  const ops = createDb(MIGRATE_URL);
  try {
    const rows = await ops.pool.query<{ detail: Record<string, unknown> }>(
      'select detail from core.audit_log where subject_id = $1 and event_type = $2 order by created_at asc limit 1',
      [vocId, eventType],
    );
    return rows.rows[0]?.detail ?? null;
  } finally {
    await ops.close();
  }
}

describe.skipIf(!runIntegration)('PATCH /vocs/:id (#14)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let adminActorId: string;

  async function cleanupProductTables() {
    await cleanupResponsibilityFailures(WORKSPACE_ID, 'it-patch-');
    // Remove permission grants for test actors before removing the actors.
    await dbHandle.pool.query(
      `delete from permission.permission_grants
        where workspace_id = $1
          and actor_id in (
            select id from core.actors where external_id like 'mock-dev-%' and workspace_id = $1
          )`,
      [WORKSPACE_ID],
    );
    // Explicit denies reference the test Managed Systems (FK); clear them first.
    await dbHandle.pool.query(
      `delete from permission.permission_denies
        where workspace_id = $1
          and actor_id in (
            select id from core.actors where external_id like 'mock-dev-%' and workspace_id = $1
          )`,
      [WORKSPACE_ID],
    );
    await dbHandle.pool.query(
      `delete from voc.vocs
        where primary_managed_system_id in (
          select id from core.managed_systems where slug like 'it-patch-%'
        )`,
    );
    await dbHandle.pool.query(
      `delete from core.analytics_areas
        where managed_system_id in (
          select id from core.managed_systems where slug like 'it-patch-%'
        )`,
    );
    await deleteRecoveryFixtureParents(
      dbHandle,
      `delete from core.managed_systems where slug like 'it-patch-%'`,
    );
    // Tables that reference core.actors must be cleared BEFORE the actor rows
    // are deleted (FK constraints: sessions.actor_id, idempotency_keys.actor_id,
    // rate_limits.actor_id). The UA filter alone misses rows if a prior run
    // died mid-test before reaching the standard cleanup branch.
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query('delete from core.rate_limits');
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'
         or actor_id in (
           select id from core.actors where external_id like 'mock-dev-%' and workspace_id = $1
         )`,
      [WORKSPACE_ID],
    );
    // Clean up test dev actors (inserted by insertDevActor).
    await dbHandle.pool.query(
      `delete from core.actors where external_id like 'mock-dev-%' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
  }

  async function cleanupAuditLog() {
    if (!MIGRATE_URL) return;
    const ops = createDb(MIGRATE_URL);
    try {
      // F11: scope the delete to subject_ids that belong to our test fixtures
      // (VOCs under managed systems with slug like 'it-patch-%') so parallel
      // test files don't wipe each other's audit rows. Covers all VOC and
      // parent-entity event types emitted by this suite.
      await ops.pool.query(
        `delete from core.audit_log
          where event_type in (
            'managed_system_registered','managed_system_updated','managed_system_archived',
            'analytics_area_registered','analytics_area_updated','analytics_area_archived',
            'voc_created','voc_triage_committed','voc_severity_set','voc_owner_assigned',
            'voc_analytics_area_linked','voc_triage_postponed','voc_triage_postpone_cleared'
          )
          and subject_id in (
            select id from voc.vocs
             where primary_managed_system_id in (
               select id from core.managed_systems where slug like 'it-patch-%'
             )
            union
            select id from core.managed_systems where slug like 'it-patch-%'
            union
            select id from core.analytics_areas
             where managed_system_id in (
               select id from core.managed_systems where slug like 'it-patch-%'
             )
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
    // C1: audit rows must be deleted BEFORE product-table rows, because
    // cleanupAuditLog scopes by subject_id via a subquery over voc.vocs and
    // core.managed_systems. If product tables are deleted first the subquery
    // returns empty and no audit rows are removed — leaving orphaned rows and
    // causing FK violations on the actor delete in the next beforeEach run.
    await cleanupAuditLog();
    await cleanupProductTables();

    // C1 regression assertion: after both cleanups no orphaned audit rows
    // with voc_* event types should reference missing voc rows.
    if (MIGRATE_URL) {
      const ops = createDb(MIGRATE_URL);
      try {
        const result = await ops.pool.query<{ n: number }>(
          `select count(*)::int as n from core.audit_log
            where event_type like 'voc_%'
              and subject_id not in (select id from voc.vocs)`,
        );
        expect(result.rows[0]?.n).toBe(0);
      } finally {
        await ops.close();
      }
    }

    await app?.close();
    await dbHandle?.close();
  });

  beforeEach(async () => {
    // C1: audit before product tables — same reasoning as afterAll above.
    await cleanupAuditLog();
    await cleanupProductTables();
  });

  // ── 1. Happy path: full triage commit in one PATCH ──────────────────────
  it('admin PATCH severity+owner+AA+triage_state=triaged → 200 + four audit rows', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-happy', 'Happy Triage MS');
    const aaId = await createAa(app, admin, {
      managed_system_id: msId,
      slug: 'aa-h',
      name: 'AA Happy',
    });
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'triage me',
        description_rich_content: paragraphDoc('please triage'),
      },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      {
        severity: 'high',
        owner_user_id: adminActorId,
        analytics_area_id: aaId,
        triage_state: 'triaged',
      },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id: voc.id,
      severity: 'high',
      owner_user_id: adminActorId,
      owner_team_id: null,
      analytics_area_id: aaId,
      triage_state: 'triaged',
    });
    expect(body.updated_at).not.toBe(voc.updated_at);

    if (MIGRATE_URL) {
      // POST /vocs writes a `voc_created` audit row first; assert PATCH-emitted
      // events come after it in spec order.
      const types = (await getAuditTypes(voc.id)).filter((t) => t !== 'voc_created');
      expect(types).toEqual([
        'voc_severity_set',
        'voc_owner_assigned',
        'voc_analytics_area_linked',
        'voc_triage_committed',
      ]);

      // F20: assert voc_triage_committed detail snapshot is populated from
      // POST-UPDATE state (newSev, newOwnerUser2, newAa) not PRE-UPDATE values.
      const detail = await getAuditDetail(voc.id, 'voc_triage_committed');
      expect(detail).toMatchObject({
        severity: 'high',
        owner_user_id: adminActorId,
        analytics_area_id: aaId,
        cluster_decision: null,
      });
    }
  });

  it.skipIf(!MIGRATE_URL)(
    'confirm compensation restores needs_more_information and prior fields without a triage commit audit',
    async () => {
      const admin = await loginAs(app, 'mock-admin-1');
      const msId = await createMs(app, admin, 'it-patch-undo-nmi', 'Undo NMI MS');
      const aaId = await createAa(app, admin, {
        managed_system_id: msId,
        slug: 'aa-undo-nmi',
        name: 'Undo NMI AA',
      });
      const reporter = await loginAs(app, 'mock-user-1');
      const voc = await postVoc(
        app,
        reporter,
        {
          primary_managed_system_id: msId,
          title: 'undo confirm',
          description_rich_content: paragraphDoc('needs more information'),
        },
        randomUUID(),
      );
      const priorBody = {
        triage_state: 'needs_more_information',
        severity: 'low',
        owner_user_id: adminActorId,
        owner_team_id: null,
        analytics_area_id: aaId,
      };
      const prior = await patchVoc(app, admin, voc.id, priorBody, {
        idempotencyKey: randomUUID(),
        ifMatch: voc.updated_at,
      });
      expect(prior.statusCode).toBe(200);
      const forward = await patchVoc(
        app,
        admin,
        voc.id,
        {
          triage_state: 'triaged',
          severity: 'high',
          owner_user_id: null,
          owner_team_id: null,
          analytics_area_id: null,
        },
        { idempotencyKey: randomUUID(), ifMatch: prior.json().updated_at },
      );
      expect(forward.statusCode).toBe(200);
      expect(forward.json().triage_state).toBe('triaged');
      expect(await getAuditTypes(voc.id)).not.toContain('voc_triage_committed');

      const compensation = await patchVoc(app, admin, voc.id, priorBody, {
        idempotencyKey: randomUUID(),
        ifMatch: forward.json().updated_at,
      });
      expect(compensation.statusCode).toBe(200);
      expect(compensation.json()).toMatchObject(priorBody);
      const row = await dbHandle.pool.query(
        `select triage_state, severity, owner_user_id, owner_team_id, analytics_area_id
           from voc.vocs where id = $1`,
        [voc.id],
      );
      expect(row.rows[0]).toEqual(priorBody);
      expect(await getAuditTypes(voc.id)).not.toContain('voc_triage_committed');
    },
  );

  // ── 2. If-Match missing → 422 ─────────────────────────────────────────
  // Spec says 400 for missing header; we deviate to 422 to match ADR-0012
  // mapping (all validation errors → 422) per the Idempotency-Key precedent.
  it('PATCH without If-Match → 422 validation.failed with fields[0].path=[headers,if-match]', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-no-ifmatch', 'No IfMatch MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { severity: 'low' },
      { idempotencyKey: randomUUID() },
    );

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('validation.failed');
    expect(body.detail.fields[0].path).toEqual(['headers', 'if-match']);
  });

  // ── 3. If-Match mismatch → 409 conflict.stale_write ───────────────────
  // C3: uses admin so the permission check passes and only the stale_write
  // fires. The companion test (3b) proves a developer without grant gets 403
  // regardless of If-Match value — no current_updated_at leak.
  it('admin PATCH with stale If-Match → 409 conflict.stale_write + current_updated_at', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-stale', 'Stale MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );
    const bogusMatch = '1970-01-01T00:00:00.000Z';

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { severity: 'low' },
      { idempotencyKey: randomUUID(), ifMatch: bogusMatch },
    );

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe('conflict.stale_write');
    const cur = body.detail.current_updated_at as string;
    expect(() => new Date(cur)).not.toThrow();
    expect(new Date(cur).getFullYear()).toBeGreaterThan(1970);
    expect(cur).not.toBe(bogusMatch);
  });

  // ── 3b. Developer without grant + bogus If-Match → 403, NOT 409 (C3) ───
  // Permission check fires BEFORE If-Match comparison (C3 reorder). An actor
  // without voc.triage must not receive current_updated_at in any form — that
  // would enable activity-frequency probing on VOCs they cannot mutate.
  it('developer without grant + bogus If-Match → 403 permission.scope_required, no current_updated_at', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-c3-order', 'C3 Order MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const { externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      `14-c3-${randomUUID().slice(0, 8)}`,
    );
    const devCookie = await loginAs(app, externalId);
    const bogusMatch = '1970-01-01T00:00:00.000Z';

    const res = await patchVoc(
      app,
      devCookie,
      voc.id,
      { severity: 'low' },
      { idempotencyKey: randomUUID(), ifMatch: bogusMatch },
    );

    // Must be 403 from permission check — NOT 409 from stale_write.
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('permission.scope_required');
    // No current_updated_at leak in any part of the response.
    expect(JSON.stringify(body)).not.toContain('current_updated_at');
  });

  // ── 4. Severity retriage: two PATCHes with different severities ────────
  it('retriage: PATCH high then critical → voc_severity_set×2, voc_triage_committed×1', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-retriage', 'Retriage MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    // First PATCH: set severity=high + triage_state=triaged.
    const res1 = await patchVoc(
      app,
      admin,
      voc.id,
      { severity: 'high', triage_state: 'triaged' },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json() as { updated_at: string };

    // Second PATCH: retriage with severity=critical only.
    const res2 = await patchVoc(
      app,
      admin,
      voc.id,
      { severity: 'critical' },
      { idempotencyKey: randomUUID(), ifMatch: body1.updated_at },
    );
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json();
    expect(body2.severity).toBe('critical');
    expect(body2.triage_state).toBe('triaged');

    if (MIGRATE_URL) {
      const types = await getAuditTypes(voc.id);
      const severitySetCount = types.filter((t) => t === 'voc_severity_set').length;
      const triageCommittedCount = types.filter((t) => t === 'voc_triage_committed').length;
      expect(severitySetCount).toBe(2);
      expect(triageCommittedCount).toBe(1);
    }
  });

  // ── 4b. Severity-clear: severity=null → 200, voc_severity_set audit with to=null ──
  it('PATCH { severity: null } on high-severity VOC → 200, voc_severity_set(from=high,to=null)', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-sev-clear', 'Sev Clear MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    // First PATCH: set severity=high.
    const res1 = await patchVoc(
      app,
      admin,
      voc.id,
      { severity: 'high' },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json() as { updated_at: string };
    expect((res1.json() as { severity: string }).severity).toBe('high');

    // Second PATCH: clear severity back to null.
    const res2 = await patchVoc(
      app,
      admin,
      voc.id,
      { severity: null },
      { idempotencyKey: randomUUID(), ifMatch: body1.updated_at },
    );
    expect(res2.statusCode).toBe(200);
    expect((res2.json() as { severity: unknown }).severity).toBeNull();

    if (MIGRATE_URL) {
      const types = await getAuditTypes(voc.id);
      // Two voc_severity_set rows: high set and high clear.
      expect(types.filter((t) => t === 'voc_severity_set').length).toBe(2);
    }
  });

  // ── 4c. Severity null → null is no-op, no audit row emitted (C7) ───────
  // The service's severityChanged guard prevents reaching the audit service when
  // the incoming severity equals the stored severity. For a freshly created VOC
  // whose severity is null, PATCHing { severity: null } must be a no-op: 200,
  // zero voc_severity_set rows. This validates the guard doesn't drift and
  // accidentally emit a (null → null) audit row that would fail Zod's
  // from === to refine (vocSeveritySetDetailSchema, F18).
  it('PATCH { severity: null } on null-severity VOC → 200, no voc_severity_set audit row (C7)', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-sev-noop', 'Sev Noop MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );
    // Fresh VOC: severity is null by default.

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { severity: null },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(200);
    // updated_at unchanged — no UPDATE was issued (empty diff path).
    expect((res.json() as { updated_at: string }).updated_at).toBe(voc.updated_at);
    expect((res.json() as { severity: unknown }).severity).toBeNull();

    if (MIGRATE_URL) {
      const types = await getAuditTypes(voc.id);
      // Only voc_created from POST — no voc_severity_set for the no-op PATCH.
      expect(types.filter((t) => t === 'voc_severity_set').length).toBe(0);
    }
  });

  // ── 5. Forbidden field: reporter_facing_status → 422 ──────────────────
  it('PATCH reporter_facing_status → 422 voc.reporter_status_via_public_update_only', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-forbid-rfs', 'Forbid RFS MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { reporter_facing_status: 'reviewing' } as Record<string, unknown>,
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('voc.reporter_status_via_public_update_only');
  });

  // ── 6. Forbidden field: title → 422 validation.unexpected_field ────────
  it('PATCH title → 422 validation.unexpected_field with fields[0].path=[title]', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-forbid-title', 'Forbid Title MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { title: 'new title' } as Record<string, unknown>,
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('validation.unexpected_field');
    expect(body.detail.fields[0].path).toEqual(['title']);
  });

  // ── 7. Forbidden field: description_rich_content → 422 ─────────────────
  it('PATCH description_rich_content → 422 validation.unexpected_field', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-forbid-desc', 'Forbid Desc MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { description_rich_content: paragraphDoc('new') } as Record<string, unknown>,
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.unexpected_field');
  });

  // ── 8. Forbidden field: cluster_decision → 422 ─────────────────────────
  it('PATCH cluster_decision → 422 validation.unexpected_field', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-forbid-cluster', 'Forbid Cluster MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { cluster_decision: 'yes' } as Record<string, unknown>,
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.unexpected_field');
  });

  // ── 8b. Forbidden field: display_id → 422 ─────────────────────────────
  it('PATCH display_id → 422 validation.unexpected_field', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-forbid-disp', 'Forbid Display MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { display_id: 'VOC-999' } as Record<string, unknown>,
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.unexpected_field');
  });

  // ── 9. postpone_review happy path ───────────────────────────────────────
  it('PATCH { postpone_review: true } → 200, postponed_at non-null, triage_state=untriaged, voc_triage_postponed audit', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-postpone', 'Postpone MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { postpone_review: true },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.triage_state).toBe('untriaged');

    // Verify postponed_at is set in the DB.
    const dbRow = await dbHandle.pool.query<{ postponed_at: string | null }>(
      'select triage_state_review_postponed_at as postponed_at from voc.vocs where id = $1',
      [voc.id],
    );
    expect(dbRow.rows[0]?.postponed_at).not.toBeNull();

    if (MIGRATE_URL) {
      const types = await getAuditTypes(voc.id);
      expect(types).toContain('voc_triage_postponed');
      expect(types).not.toContain('voc_triage_committed');
    }
  });

  // ── 9b. postpone + multi-field: combined audit order (F13) ────────────────
  // Spec §8.4: voc_triage_postponed must be first; subsequent field changes
  // (severity, owner, AA) emit their rows in deterministic order after.
  it('PATCH { postpone_review, severity, owner_user_id, analytics_area_id } → 200, audit order: [postponed,severity_set,owner_assigned,aa_linked]', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-postpone-multi', 'Postpone Multi MS');
    const aaId = await createAa(app, admin, {
      managed_system_id: msId,
      slug: 'aa-pm',
      name: 'AA Postpone Multi',
    });
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      {
        postpone_review: true,
        severity: 'high',
        owner_user_id: adminActorId,
        analytics_area_id: aaId,
      },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.triage_state).toBe('untriaged');
    expect(body.severity).toBe('high');
    expect(body.owner_user_id).toBe(adminActorId);
    expect(body.analytics_area_id).toBe(aaId);

    if (MIGRATE_URL) {
      const types = await getAuditTypes(voc.id);
      // voc_created is the first row; then our four from this PATCH.
      const patchTypes = types.filter((t) => t !== 'voc_created');
      expect(patchTypes).toEqual([
        'voc_triage_postponed',
        'voc_severity_set',
        'voc_owner_assigned',
        'voc_analytics_area_linked',
      ]);
    }
  });

  // ── 10. postpone_review + triage_state mutex → 422 ────────────────────
  it('PATCH { postpone_review: true, triage_state: triaged } → 422 validation.failed', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-postpone-mutex', 'Postpone Mutex MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { postpone_review: true, triage_state: 'triaged' },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
  });

  // ── 10b. postpone_review on already-triaged VOC → 422 invalid_state ──────
  it('PATCH { postpone_review: true } on triaged VOC → 422 validation.failed invalid_state', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-postpone-triaged', 'Postpone Triaged MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    // First: triage the VOC.
    const res1 = await patchVoc(
      app,
      admin,
      voc.id,
      { triage_state: 'triaged', severity: 'low' },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );
    expect(res1.statusCode).toBe(200);
    const triaged = res1.json() as { updated_at: string };

    // Second: attempt postpone on an already-triaged VOC.
    const res2 = await patchVoc(
      app,
      admin,
      voc.id,
      { postpone_review: true },
      { idempotencyKey: randomUUID(), ifMatch: triaged.updated_at },
    );
    expect(res2.statusCode).toBe(422);
    const body2 = res2.json();
    expect(body2.code).toBe('validation.failed');
    expect(body2.detail.fields[0].path).toEqual(['postpone_review']);
    expect(body2.detail.fields[0].code).toBe('invalid_state');
  });

  // ── 10c. triage_state_review_postponed_at cleared on subsequent triage (C5) ──
  // A VOC that was postponed then triaged must have postponed_at = NULL.
  // Without C5 the column keeps a stale timestamp; downstream readers would
  // incorrectly interpret the row as currently postponed.
  it('postpone then PATCH triage_state=triaged → triage_state_review_postponed_at IS NULL', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-postpone-clear', 'Postpone Clear MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    // First PATCH: postpone the VOC.
    const res1 = await patchVoc(
      app,
      admin,
      voc.id,
      { postpone_review: true },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );
    expect(res1.statusCode).toBe(200);

    // Confirm postponed_at is set.
    const afterPostpone = await dbHandle.pool.query<{ postponed_at: string | null }>(
      'select triage_state_review_postponed_at as postponed_at from voc.vocs where id = $1',
      [voc.id],
    );
    expect(afterPostpone.rows[0]?.postponed_at).not.toBeNull();

    const afterPostponeAt = (res1.json() as { updated_at: string }).updated_at;

    // Second PATCH: triage the VOC (moving away from untriaged).
    const res2 = await patchVoc(
      app,
      admin,
      voc.id,
      { triage_state: 'triaged', severity: 'low', owner_user_id: adminActorId },
      { idempotencyKey: randomUUID(), ifMatch: afterPostponeAt },
    );
    expect(res2.statusCode).toBe(200);
    expect((res2.json() as { triage_state: string }).triage_state).toBe('triaged');

    // Assert postponed_at is cleared in the DB (C5).
    const afterTriage = await dbHandle.pool.query<{ postponed_at: string | null }>(
      'select triage_state_review_postponed_at as postponed_at from voc.vocs where id = $1',
      [voc.id],
    );
    expect(afterTriage.rows[0]?.postponed_at).toBeNull();
  });

  it('955: confirm compensation restores the timestamp read by the client exactly in Postgres', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-955-roundtrip', 'Restore MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      {
        primary_managed_system_id: msId,
        title: 'restore',
        description_rich_content: paragraphDoc('x'),
      },
      randomUUID(),
    );
    const postponed = await patchVoc(
      app,
      admin,
      voc.id,
      { postpone_review: true },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );
    expect(postponed.statusCode).toBe(200);
    const original = await dbHandle.pool.query<{ timestamp: string }>(
      'select triage_state_review_postponed_at::text as timestamp from voc.vocs where id = $1',
      [voc.id],
    );
    const read = await app.inject({
      method: 'GET',
      url: `/vocs?view=triage&managed_system_id=${msId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${admin}` },
    });
    expect(read.statusCode).toBe(200);
    const prior = read.json().items.find((item: { id: string }) => item.id === voc.id);
    expect(prior.review_postponed_at).toEqual(expect.any(String));
    const confirmed = await patchVoc(
      app,
      admin,
      voc.id,
      {
        triage_state: 'triaged',
        severity: 'high',
        owner_user_id: adminActorId,
        owner_team_id: null,
        analytics_area_id: null,
      },
      { idempotencyKey: randomUUID(), ifMatch: postponed.json().updated_at },
    );
    expect(confirmed.statusCode).toBe(200);
    const afterConfirm = await dbHandle.pool.query(
      'select triage_state_review_postponed_at from voc.vocs where id = $1',
      [voc.id],
    );
    expect(afterConfirm.rows[0].triage_state_review_postponed_at).toBeNull();
    const auditsBefore = await getAuditTypes(voc.id);
    const restored = await patchVoc(
      app,
      admin,
      voc.id,
      {
        triage_state: prior.triage_state,
        severity: prior.severity,
        owner_user_id: prior.owner_user_id,
        owner_team_id: prior.owner_team_id,
        analytics_area_id: prior.analytics_area_id,
        restore_review_postponed_at: prior.review_postponed_at,
      },
      { idempotencyKey: randomUUID(), ifMatch: confirmed.json().updated_at },
    );
    expect(restored.statusCode).toBe(200);
    const afterRestore = await dbHandle.pool.query(
      `select triage_state, severity, owner_user_id, owner_team_id, analytics_area_id,
        triage_state_review_postponed_at = $2::timestamptz as exact
        from voc.vocs where id = $1`,
      [voc.id, original.rows[0]?.timestamp],
    );
    expect(afterRestore.rows[0]).toEqual({
      triage_state: 'untriaged',
      severity: prior.severity,
      owner_user_id: prior.owner_user_id,
      owner_team_id: prior.owner_team_id,
      analytics_area_id: prior.analytics_area_id,
      exact: true,
    });
    for (const tab of ['waiting', 'untriaged']) {
      const list = await app.inject({
        method: 'GET',
        url: `/vocs?view=triage&tab=${tab}&managed_system_id=${msId}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${admin}` },
      });
      expect(list.statusCode).toBe(200);
      const ids = list.json().items.map((item: { id: string }) => item.id);
      if (tab === 'waiting') expect(ids).toContain(voc.id);
      else expect(ids).not.toContain(voc.id);
    }
    const auditsAfter = await getAuditTypes(voc.id);
    for (const type of ['voc_triage_postponed', 'voc_triage_postpone_cleared']) {
      expect(auditsAfter.filter((value) => value === type)).toEqual(
        auditsBefore.filter((value) => value === type),
      );
    }
    expect(auditsAfter.slice(auditsBefore.length)).toEqual([
      'voc_severity_set',
      'voc_owner_assigned',
    ]);
  });

  it.each([
    [
      'missing target',
      'triaged',
      { restore_review_postponed_at: '2026-01-01T00:00:00.000Z' },
      'restore_review_postponed_at',
      'custom',
    ],
    [
      'wrong target',
      'triaged',
      { triage_state: 'triaged', restore_review_postponed_at: '2026-01-01T00:00:00.000Z' },
      'restore_review_postponed_at',
      'custom',
    ],
    [
      'postpone true',
      'triaged',
      {
        triage_state: 'untriaged',
        postpone_review: true,
        restore_review_postponed_at: '2026-01-01T00:00:00.000Z',
      },
      'postpone_review',
      'custom',
    ],
    [
      'postpone false',
      'triaged',
      {
        triage_state: 'untriaged',
        postpone_review: false,
        restore_review_postponed_at: '2026-01-01T00:00:00.000Z',
      },
      'postpone_review',
      'custom',
    ],
    [
      'already untriaged',
      'untriaged',
      { triage_state: 'untriaged', restore_review_postponed_at: '2026-01-01T00:00:00.000Z' },
      'restore_review_postponed_at',
      'invalid_state',
    ],
    [
      'future',
      'triaged',
      { triage_state: 'untriaged', restore_review_postponed_at: '2999-01-01T00:00:00.000Z' },
      'restore_review_postponed_at',
      'invalid',
    ],
    [
      'not ISO',
      'triaged',
      { triage_state: 'untriaged', restore_review_postponed_at: 'not ISO' },
      'restore_review_postponed_at',
      'invalid_string',
    ],
  ] as const)(
    '955: %s is 422 and leaves row and audits unchanged',
    async (_name, state, body, path, code) => {
      const admin = await loginAs(app, 'mock-admin-1');
      const msId = await createMs(app, admin, 'it-patch-955-invalid', 'Invalid Restore MS');
      const voc = await postVoc(
        app,
        admin,
        {
          primary_managed_system_id: msId,
          title: 'restore',
          description_rich_content: paragraphDoc('x'),
        },
        randomUUID(),
      );
      await dbHandle.pool.query('update voc.vocs set triage_state = $2 where id = $1', [
        voc.id,
        state,
      ]);
      const before = await dbHandle.pool.query(
        'select to_jsonb(v) as row, v.updated_at from voc.vocs v where id = $1',
        [voc.id],
      );
      const audits = await getAuditTypes(voc.id);
      // The direct UPDATE above bumps updated_at; send the current value.
      const res = await patchVoc(app, admin, voc.id, body, {
        idempotencyKey: randomUUID(),
        ifMatch: (before.rows[0].updated_at as Date).toISOString(),
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe('validation.failed');
      expect(res.json().detail.fields[0]).toEqual({ path: [path], code });
      expect(
        (
          await dbHandle.pool.query(
            'select to_jsonb(v) as row, v.updated_at from voc.vocs v where id = $1',
            [voc.id],
          )
        ).rows,
      ).toEqual(before.rows);
      expect(await getAuditTypes(voc.id)).toEqual(audits);
    },
  );

  it.each([
    ['untriaged', '2026-01-01T00:00:00.000Z'],
    ['untriaged', '2999-01-01T00:00:00.000Z'],
    ['triaged', '2026-01-01T00:00:00.000Z'],
    ['triaged', '2999-01-01T00:00:00.000Z'],
  ])(
    '955: permission denial precedes state=%s and timestamp=%s checks',
    async (state, timestamp) => {
      const admin = await loginAs(app, 'mock-admin-1');
      const msId = await createMs(app, admin, 'it-patch-955-permission', 'Restore Permission MS');
      const voc = await postVoc(
        app,
        admin,
        {
          primary_managed_system_id: msId,
          title: 'restore',
          description_rich_content: paragraphDoc('x'),
        },
        randomUUID(),
      );
      await dbHandle.pool.query('update voc.vocs set triage_state = $2 where id = $1', [
        voc.id,
        state,
      ]);
      const { externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, `955-${randomUUID()}`);
      const developer = await loginAs(app, externalId);
      const opts = { idempotencyKey: randomUUID(), ifMatch: voc.updated_at };
      const denied = await patchVoc(app, developer, voc.id, { severity: 'low' }, opts);
      const res = await patchVoc(
        app,
        developer,
        voc.id,
        {
          triage_state: 'untriaged',
          restore_review_postponed_at: timestamp,
          severity: null,
          owner_user_id: null,
          owner_team_id: null,
          analytics_area_id: null,
        },
        { ...opts, idempotencyKey: randomUUID() },
      );
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('permission.scope_required');
      expect(res.json()).toEqual(denied.json());
      const schemaInvalid = await patchVoc(
        app,
        developer,
        voc.id,
        { restore_review_postponed_at: timestamp },
        { ...opts, idempotencyKey: randomUUID() },
      );
      expect(schemaInvalid.statusCode).toBe(422);
      expect(schemaInvalid.json().code).toBe('validation.failed');
      expect(schemaInvalid.json().detail.fields[0]).toEqual({
        path: ['restore_review_postponed_at'],
        code: 'custom',
      });
    },
  );

  // ── 10d. postpone_review: false clears a postponed untriaged review (#921) ──
  it('PATCH { postpone_review: false } after postpone clears postponed_at and tab=waiting', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-postpone-undo', 'Postpone Undo MS');
    const aaId = await createAa(app, admin, {
      managed_system_id: msId,
      slug: 'aa-postpone-undo',
      name: 'AA Postpone Undo',
    });
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const postponed = await patchVoc(
      app,
      admin,
      voc.id,
      { postpone_review: true },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );
    expect(postponed.statusCode).toBe(200);
    const afterPostpone = await dbHandle.pool.query<{ postponed_at: string | null }>(
      'select triage_state_review_postponed_at as postponed_at from voc.vocs where id = $1',
      [voc.id],
    );
    expect(afterPostpone.rows[0]?.postponed_at).not.toBeNull();

    const waitingUrl = `/vocs?view=triage&tab=waiting&managed_system_id=${msId}`;
    const waitingBefore = await app.inject({
      method: 'GET',
      url: waitingUrl,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${admin}` },
    });
    expect(waitingBefore.statusCode).toBe(200);
    expect(
      (waitingBefore.json() as { items: { id: string }[] }).items.map((item) => item.id),
    ).toContain(voc.id);

    const typesBefore = await getAuditTypes(voc.id);
    const cleared = await patchVoc(
      app,
      admin,
      voc.id,
      {
        postpone_review: false,
        severity: 'low',
        owner_user_id: adminActorId,
        analytics_area_id: aaId,
      },
      {
        idempotencyKey: randomUUID(),
        ifMatch: (postponed.json() as { updated_at: string }).updated_at,
      },
    );
    expect(cleared.statusCode).toBe(200);
    const clearedBody = cleared.json() as {
      triage_state: string;
      severity: string | null;
      owner_user_id: string | null;
      analytics_area_id: string | null;
    };
    expect(clearedBody.triage_state).toBe('untriaged');
    expect(clearedBody.severity).toBe('low');
    expect(clearedBody.owner_user_id).toBe(adminActorId);
    expect(clearedBody.analytics_area_id).toBe(aaId);

    const afterClear = await dbHandle.pool.query<{ postponed_at: string | null }>(
      'select triage_state_review_postponed_at as postponed_at from voc.vocs where id = $1',
      [voc.id],
    );
    expect(afterClear.rows[0]?.postponed_at).toBeNull();

    const waitingAfter = await app.inject({
      method: 'GET',
      url: waitingUrl,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${admin}` },
    });
    expect(waitingAfter.statusCode).toBe(200);
    expect(
      (waitingAfter.json() as { items: { id: string }[] }).items.map((item) => item.id),
    ).not.toContain(voc.id);

    if (MIGRATE_URL) {
      const typesAfter = await getAuditTypes(voc.id);
      expect(typesAfter.filter((t) => t === 'voc_triage_postpone_cleared')).toHaveLength(1);
      expect(typesAfter.length).toBe(typesBefore.length + 4);
      expect(typesAfter.filter((t) => t === 'voc_severity_set')).toHaveLength(1);
      expect(typesAfter.filter((t) => t === 'voc_owner_assigned')).toHaveLength(1);
      expect(typesAfter.filter((t) => t === 'voc_analytics_area_linked')).toHaveLength(1);
    }
  });

  // ── 10d2. the exact Triage skip-undo body clears a postpone ──────────────
  it('PATCH { postpone_review: false } alone clears a postponed review with one audit row', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-postpone-undo-only', 'Postpone Undo Only MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );
    const postponed = await patchVoc(
      app,
      admin,
      voc.id,
      { postpone_review: true },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );
    expect(postponed.statusCode).toBe(200);
    const typesBefore = await getAuditTypes(voc.id);

    const cleared = await patchVoc(
      app,
      admin,
      voc.id,
      { postpone_review: false },
      {
        idempotencyKey: randomUUID(),
        ifMatch: (postponed.json() as { updated_at: string }).updated_at,
      },
    );
    expect(cleared.statusCode).toBe(200);
    const afterClear = await dbHandle.pool.query<{ postponed_at: string | null }>(
      'select triage_state_review_postponed_at as postponed_at from voc.vocs where id = $1',
      [voc.id],
    );
    expect(afterClear.rows[0]?.postponed_at).toBeNull();
    if (MIGRATE_URL) {
      const typesAfter = await getAuditTypes(voc.id);
      expect(typesAfter.length).toBe(typesBefore.length + 1);
      expect(typesAfter.filter((t) => t === 'voc_triage_postpone_cleared')).toHaveLength(1);
    }
  });

  // ── 10e. postpone_review: false on a VOC that is not postponed ──────────
  it('PATCH { postpone_review: false } on a non-postponed VOC writes no postpone audit and applies other fields', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-postpone-noop', 'Postpone Noop MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );
    const typesBefore = await getAuditTypes(voc.id);

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { postpone_review: false, severity: 'low' },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );
    expect(res.statusCode).toBe(200);
    expect((res.json() as { severity: string | null }).severity).toBe('low');

    const row = await dbHandle.pool.query<{ postponed_at: string | null }>(
      'select triage_state_review_postponed_at as postponed_at from voc.vocs where id = $1',
      [voc.id],
    );
    expect(row.rows[0]?.postponed_at).toBeNull();

    if (MIGRATE_URL) {
      const typesAfter = await getAuditTypes(voc.id);
      expect(typesAfter).not.toContain('voc_triage_postponed');
      expect(typesAfter).not.toContain('voc_triage_postpone_cleared');
      expect(typesAfter.filter((t) => t === 'voc_severity_set')).toHaveLength(1);
      expect(typesAfter.length).toBe(typesBefore.length + 1);
    }
  });

  // ── 10f. postpone_review: false + triage_state stays validation.failed ──
  it('PATCH { postpone_review: false, triage_state: triaged } → 422 validation.failed', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(
      app,
      admin,
      'it-patch-postpone-false-mutex',
      'Postpone False Mutex MS',
    );
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { postpone_review: false, triage_state: 'triaged' },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
  });

  // ── 10g. postpone_review: false uses the same voc.triage check as true ──
  it('developer without voc.triage gets the same error for postpone_review false as for true', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-postpone-perm', 'Postpone Perm MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );
    const { externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      `921-perm-${randomUUID().slice(0, 8)}`,
    );
    const devCookie = await loginAs(app, externalId);

    const postponed = await patchVoc(
      app,
      devCookie,
      voc.id,
      { postpone_review: true },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );
    const cleared = await patchVoc(
      app,
      devCookie,
      voc.id,
      { postpone_review: false },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(postponed.statusCode).toBe(403);
    expect(cleared.statusCode).toBe(403);
    expect(cleared.json().code).toBe(postponed.json().code);
    expect(cleared.json().code).toBe('permission.scope_required');
    expect(cleared.json().detail.requiredScope).toEqual([msId]);
    expect(cleared.json().requestable_permission.permission).toBe('voc.triage');
  });

  // ── 11. Owner mutex: both owner_user_id + owner_team_id → 422 ──────────
  it('PATCH both owner_user_id and owner_team_id → 422 validation.failed', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-owner-mutex', 'Owner Mutex MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { owner_user_id: randomUUID(), owner_team_id: randomUUID() },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.failed');
  });

  // ── 11b. Resolved-value owner mutex: row has owner_user_id, PATCH sends only owner_team_id → 422 ──
  // C2: the input-level mutex catches { owner_user_id, owner_team_id } in the same payload.
  // This test proves the resolved-value guard fires when the existing row already has one
  // owner and the client sends only the other without clearing the first.
  // We use a random UUID for owner_team_id — the service-level guard fires before the
  // UPDATE/FK check, so no real team row needs to exist.
  it('row has owner_user_id set, PATCH sends only { owner_team_id } → 422 validation.failed (not 500)', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-owner-resolved', 'Owner Resolved MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    // First PATCH: assign owner_user_id.
    const res1 = await patchVoc(
      app,
      admin,
      voc.id,
      { owner_user_id: adminActorId },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );
    expect(res1.statusCode).toBe(200);
    const afterPatch1 = (res1.json() as { updated_at: string }).updated_at;

    // Second PATCH: send only owner_team_id (non-existent UUID) without clearing owner_user_id.
    // The service-level resolved-value mutex must fire with 422, not 500 from a DB CHECK violation.
    const res2 = await patchVoc(
      app,
      admin,
      voc.id,
      { owner_team_id: randomUUID() },
      { idempotencyKey: randomUUID(), ifMatch: afterPatch1 },
    );
    expect(res2.statusCode).toBe(422);
    const body2 = res2.json();
    expect(body2.code).toBe('validation.failed');
    const ownerTeamField = (body2.detail.fields as Array<{ path: string[]; code: string }>).find(
      (f) => f.path.includes('owner_team_id'),
    );
    expect(ownerTeamField?.code).toBe('invalid');
  });

  // ── 12. AA cross-MS scope violation → 422 ──────────────────────────────
  // F9: The service-level guard at service.ts:244-247 fires before any UPDATE
  // that would invoke the DB trigger. The test asserts the field-level hint
  // is present (out_of_scope code on analytics_area_id); this is conclusive
  // evidence the service-level check ran because the trigger would produce a
  // different error shape (raw pg exception, not the ADR-0012 envelope).
  it('PATCH analytics_area_id from different MS → 422 validation.failed out_of_scope', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msAId = await createMs(app, admin, 'it-patch-cross-ms-a', 'Cross MS-A');
    const msBId = await createMs(app, admin, 'it-patch-cross-ms-b', 'Cross MS-B');
    const aaBId = await createAa(app, admin, {
      managed_system_id: msBId,
      slug: 'aa-b',
      name: 'AA B',
    });
    const reporter = await loginAs(app, 'mock-user-1');
    // VOC belongs to MS-A.
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msAId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    // PATCH with AA-B (belongs to MS-B) — must fail cross-MS guard.
    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { analytics_area_id: aaBId },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('validation.failed');
    expect(body.detail.fields[0].path).toEqual(['analytics_area_id']);
    expect(body.detail.fields[0].code).toBe('out_of_scope');
  });

  // ── 13. Archived VOC → 409 conflict.record_archived ───────────────────
  it('PATCH archived VOC → 409 conflict.record_archived', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-arc-voc', 'Arc VOC MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    await archiveVoc(dbHandle, voc.id);

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { severity: 'low' },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict.record_archived');
  });

  // ── 14. Archived parent MS → 409 conflict.parent_archived ─────────────
  it('PATCH when parent MS is archived → 409 conflict.parent_archived', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-arc-ms', 'Arc MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    // Archive the managed system via the REST endpoint. No body — drop the
    // content-type so Fastify's JSON parser does not reject the empty payload.
    const archRes = await app.inject({
      method: 'POST',
      url: `/managed-systems/${msId}/archive`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${admin}` },
    });
    expect(archRes.statusCode).toBe(200);

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      { severity: 'low' },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('conflict.parent_archived');
  });

  // ── 15. Developer without MS scope → 403 permission.scope_required ─────
  it('developer without MS-scoped grant PATCH → 403 permission.scope_required with envelope', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-dev-403', 'Dev 403 MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const { externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      `14-dev403-${randomUUID().slice(0, 8)}`,
    );
    const devCookie = await loginAs(app, externalId);

    const res = await patchVoc(
      app,
      devCookie,
      voc.id,
      { severity: 'low' },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('permission.scope_required');
    // F3: requestable_permission is hoisted to top-level envelope per ADR-0012
    // ErrorEnvelope contract; requiredScope stays in detail.
    expect(body.detail.requiredScope).toEqual([msId]);
    expect(body.requestable_permission.permission).toBe('voc.triage');
    expect(body.requestable_permission.managed_system_id).toBe(msId);
  });

  // ── 16. Permission change race: revoked/expired grant remains requestable ──
  // WHY tx-binding is proven: the grant-revoke commits before the second
  // handler opens its tx. `checkCapability` is called with `{ tx }`, so the
  // read runs inside the same snapshot as the VOC SELECT FOR UPDATE. A
  // pool-bound read would also see the committed revoke, but the test still
  // proves the recheck fires (ADR-0019 §D), because a service that skipped
  // the permission recheck entirely would return 200 here.
  it.each([{ grantState: 'revoked' }, { grantState: 'expired' }] as const)(
    '$grantState grant → second PATCH returns 403 permission.scope_required',
    async ({ grantState }) => {
      const admin = await loginAs(app, 'mock-admin-1');
      const msId = await createMs(app, admin, `it-patch-dev-${grantState}`, `Dev ${grantState} MS`);
      const reporter = await loginAs(app, 'mock-user-1');
      const voc = await postVoc(
        app,
        reporter,
        {
          primary_managed_system_id: msId,
          title: 'v',
          description_rich_content: paragraphDoc('x'),
        },
        randomUUID(),
      );

      const { id: devId, externalId } = await insertDevActor(
        dbHandle,
        WORKSPACE_ID,
        `14-${grantState}-${randomUUID().slice(0, 8)}`,
      );
      const grantId = await grantVocTriage(dbHandle, WORKSPACE_ID, devId, msId, adminActorId);
      const devCookie = await loginAs(app, externalId);

      // First PATCH: grant is active → 200.
      const res1 = await patchVoc(
        app,
        devCookie,
        voc.id,
        { severity: 'low' },
        { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
      );
      expect(res1.statusCode).toBe(200);
      // #1187: this triage-only dev has no voc.read, so the PATCH response is the
      // summary (no updated_at); read the new If-Match from the row.
      const afterPatch1 =
        (
          await dbHandle.pool.query<{ updated_at: Date }>(
            'select updated_at from voc.vocs where id = $1',
            [voc.id],
          )
        ).rows[0]?.updated_at.toISOString() ?? '';

      // Change the grant state — the next tx must classify it as requestable.
      if (grantState === 'revoked') {
        await revokeCapabilityGrant(dbHandle, grantId, adminActorId);
      } else {
        await expireCapabilityGrant(dbHandle, grantId);
      }

      // Second PATCH: the inactive grant no longer authorizes triage.
      const res2 = await patchVoc(
        app,
        devCookie,
        voc.id,
        { severity: 'medium' },
        { idempotencyKey: randomUUID(), ifMatch: afterPatch1 },
      );
      expect(res2.statusCode).toBe(403);
      const body = res2.json();
      expect(body.code).toBe('permission.scope_required');
      expect(body.detail.requiredScope).toEqual([msId]);
      expect(body.requestable_permission).toMatchObject({
        permission: 'voc.triage',
        managed_system_id: msId,
      });
    },
  );

  it('explicit deny alongside a revoked voc.triage grant stays permission.denied', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-dev-revoked-deny', 'Revoked Deny MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );
    const { id: devId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      `revoked-deny-${randomUUID().slice(0, 8)}`,
    );
    const grantId = await grantVocTriage(dbHandle, WORKSPACE_ID, devId, msId, adminActorId);
    await revokeCapabilityGrant(dbHandle, grantId, adminActorId);
    await denyCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', msId, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await patchVoc(
      app,
      devCookie,
      voc.id,
      { severity: 'low' },
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('permission.denied');
    expect(res.json().detail.reason).toBe('explicit_deny');
    expect(res.json().requestable_permission).toBeUndefined();
  });

  // ── 17. Empty diff: body {} → 200, no audit rows written ────────────────
  it('PATCH body {} (no changes) → 200, audit row count unchanged', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-empty-diff', 'Empty Diff MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const typesBefore = await getAuditTypes(voc.id);

    const res = await patchVoc(
      app,
      admin,
      voc.id,
      {},
      { idempotencyKey: randomUUID(), ifMatch: voc.updated_at },
    );

    expect(res.statusCode).toBe(200);
    // F5: assert updated_at is unchanged (no UPDATE was issued) and full
    // envelope matches the original VOC state.
    const body = res.json() as { updated_at: string; severity: unknown; triage_state: string };
    expect(body.updated_at).toBe(voc.updated_at);
    expect(body).toMatchObject({
      id: voc.id,
      severity: null,
      triage_state: 'untriaged',
    });

    if (MIGRATE_URL) {
      const typesAfter = await getAuditTypes(voc.id);
      // No new voc_* rows should be written for a no-op diff.
      expect(typesAfter.length).toBe(typesBefore.length);
    }
  });

  // ── 18. Concurrent PATCH stale_write (real lock contention via Promise.all) ──
  // Both PATCHes are fired concurrently with the same If-Match. SELECT FOR
  // UPDATE serialises them at the DB level: one wins the row lock and commits
  // first; the second then reads the updated row, sees the If-Match no longer
  // matches, and returns 409. This exercises the FOR UPDATE clause directly —
  // if it were removed from selectVocForUpdate (repo.ts) the second PATCH
  // could still return 409 from the If-Match check, but lock contention would
  // no longer be verified. Promise.all guarantees both handlers are in-flight
  // simultaneously (F4).
  it('two concurrent PATCHes with same If-Match: one 200, one 409 conflict.stale_write', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-concurrent', 'Concurrent MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );
    const sharedIfMatch = voc.updated_at;

    // Fire both requests concurrently — exercises SELECT FOR UPDATE contention.
    const [res1, res2] = await Promise.all([
      patchVoc(
        app,
        admin,
        voc.id,
        { severity: 'low' },
        { idempotencyKey: randomUUID(), ifMatch: sharedIfMatch },
      ),
      patchVoc(
        app,
        admin,
        voc.id,
        { severity: 'medium' },
        { idempotencyKey: randomUUID(), ifMatch: sharedIfMatch },
      ),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = res1.statusCode === 409 ? res1 : res2;
    expect(loser.json().code).toBe('conflict.stale_write');

    // C6: assert the winner's body has the expected shape.
    const winner = res1.statusCode === 200 ? res1 : res2;
    expect(['low', 'medium']).toContain(winner.json().severity);
    // updated_at must have advanced beyond the original If-Match value.
    expect(winner.json().updated_at).not.toBe(sharedIfMatch);

    // C6: exactly one voc_severity_set audit row must exist for the VOC
    // (the loser never committed).
    if (MIGRATE_URL) {
      const types = await getAuditTypes(voc.id);
      expect(types.filter((t) => t === 'voc_severity_set').length).toBe(1);
    }
  });

  // ── 19. Idempotency replay: same key + body → 200×2, one audit row ─────
  it('idempotency replay: same key+body returns 200 twice; only one DB write', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-idem-replay', 'Idem Replay MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const key = randomUUID();
    const body = { severity: 'high' };

    const res1 = await patchVoc(app, admin, voc.id, body, {
      idempotencyKey: key,
      ifMatch: voc.updated_at,
    });
    expect(res1.statusCode).toBe(200);

    const res2 = await patchVoc(app, admin, voc.id, body, {
      idempotencyKey: key,
      ifMatch: voc.updated_at,
    });
    expect(res2.statusCode).toBe(200);

    // Both responses have the same body (idempotent).
    expect(res1.json()).toEqual(res2.json());
    // F8: explicitly assert updated_at is identical across both responses —
    // proves exactly one DB UPDATE was issued (no second write on replay).
    expect(res1.json().updated_at).toBe(res2.json().updated_at);

    if (MIGRATE_URL) {
      const types = await getAuditTypes(voc.id);
      // Exactly one voc_severity_set, not two — the replay hit the idempotency cache.
      expect(types.filter((t) => t === 'voc_severity_set').length).toBe(1);
    }
  });

  // ── 20. Idempotency mismatch: same key + different body → 409 ──────────
  it('idempotency key reuse with different body → 409 conflict.idempotency_key_reuse', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-idem-mismatch', 'Idem Mismatch MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );

    const key = randomUUID();

    const res1 = await patchVoc(
      app,
      admin,
      voc.id,
      { severity: 'low' },
      { idempotencyKey: key, ifMatch: voc.updated_at },
    );
    expect(res1.statusCode).toBe(200);
    const afterPatch = (res1.json() as { updated_at: string }).updated_at;

    // Same key but different body — conflict.
    const res2 = await patchVoc(
      app,
      admin,
      voc.id,
      { severity: 'medium' },
      { idempotencyKey: key, ifMatch: afterPatch },
    );
    expect(res2.statusCode).toBe(409);
    expect(res2.json().code).toBe('conflict.idempotency_key_reuse');
  });

  it('allows more than 10 triage PATCHes and limits requests only past 60 per minute', async () => {
    const admin = await loginAs(app, 'mock-admin-1');
    const msId = await createMs(app, admin, 'it-patch-rate-limit', 'Rate Limit MS');
    const reporter = await loginAs(app, 'mock-user-1');
    const voc = await postVoc(
      app,
      reporter,
      { primary_managed_system_id: msId, title: 'v', description_rich_content: paragraphDoc('x') },
      randomUUID(),
    );
    const rateLimitKey = `${WORKSPACE_ID}:${adminActorId}`;
    await dbHandle.pool.query(
      `delete from core.rate_limits
        where key = $1 and route_group in ('mutation', 'triage')`,
      [rateLimitKey],
    );

    const successfulTriages = [];
    let ifMatch = voc.updated_at;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await patchVoc(
        app,
        admin,
        voc.id,
        {
          severity: attempt % 2 === 0 ? 'low' : 'medium',
          ...(attempt === 0 ? { triage_state: 'triaged' } : {}),
        },
        { idempotencyKey: randomUUID(), ifMatch },
      );
      successfulTriages.push(response);
      ifMatch = (response.json() as { updated_at: string }).updated_at;
    }
    expect(successfulTriages.every((response) => response.statusCode === 200)).toBe(true);

    // Keep 11 real commits; invalid calls fill the remaining route quota without more DB writes.
    const remainingTriageResponses = [];
    for (let attempt = 0; attempt < 50; attempt += 1) {
      remainingTriageResponses.push(
        await patchVoc(
          app,
          admin,
          voc.id,
          { unexpected_field: true },
          { idempotencyKey: randomUUID(), ifMatch },
        ),
      );
    }
    expect(
      remainingTriageResponses.slice(0, 49).every((response) => response.statusCode === 422),
    ).toBe(true);
    const limitedTriage = remainingTriageResponses[49];
    expect(limitedTriage?.statusCode).toBe(429);
    const limitedBody = limitedTriage?.json<{
      code: string;
      message: string;
      detail: { retry_after_seconds: number };
    }>();
    expect(limitedBody?.code).toBe('rate_limited.actor');
    expect(limitedBody?.message).toEqual(expect.any(String));
    expect(limitedBody?.message.length).toBeGreaterThan(0);
    const retryAfterSeconds = limitedBody?.detail.retry_after_seconds;
    expect(Number.isInteger(retryAfterSeconds)).toBe(true);
    expect(retryAfterSeconds).toBeGreaterThan(0);
    expect(Number(limitedTriage?.headers['retry-after'])).toBe(retryAfterSeconds);

    const mutationResponses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      mutationResponses.push(
        await app.inject({
          method: 'POST',
          url: '/vocs',
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${admin}`,
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          payload: { unexpected_field: true },
        }),
      );
    }
    expect(mutationResponses.map((response) => response.statusCode)).toEqual([
      ...Array(10).fill(422),
      429,
    ]);
  });
});

describe.skipIf(!runIntegration)('VOC actionable ownership (#1172)', () => {
  const PREFIX = 'it-1172-owner';
  const rejected = [
    ['reporter', 'ineligible_actor'],
    ['system', 'ineligible_actor'],
    ['otherScope', 'ineligible_actor'],
    ['triageOnly', 'ineligible_actor'],
    ['expired', 'ineligible_actor'],
    ['deniedAdmin', 'ineligible_actor'],
    ['missing', 'foreign_workspace'],
    ['foreign', 'foreign_workspace'],
  ] as const;

  let handle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let ms: string;
  let otherMs: string;
  let foreignWorkspace: string;
  let team: string;
  let cookie: string;
  let reporterCookie: string;
  let triageOnlyCookie: string;
  let unrelatedCookie: string;
  const ids: Record<string, string> = { missing: randomUUID() };
  const vocIds: string[] = [];

  function requestHeaders(session = cookie) {
    return { cookie: `${SESSION_COOKIE_NAME}=${session}`, 'idempotency-key': randomUUID() };
  }
  async function fixture(ownerUserId?: string) {
    const voc = await insertVocDirectly(
      handle,
      WORKSPACE_ID,
      ms,
      ids.reporter as string,
      '1172 ownership',
      ownerUserId ? { ownerUserId } : {},
    );
    vocIds.push(voc.id);
    return { ...voc, updated_at: new Date(voc.updated_at).toISOString() };
  }
  function create(owner: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: '/vocs',
      headers: requestHeaders(),
      payload: {
        primary_managed_system_id: ms,
        title: '1172 create',
        description_rich_content: paragraphDoc('Actionable ownership'),
        ...owner,
      },
    });
  }
  async function rememberCreated(response: Awaited<ReturnType<typeof create>>) {
    expect(response.statusCode, response.body).toBe(201);
    vocIds.push(response.json().id);
    return response.json();
  }
  async function state(vocId: string) {
    const row = await handle.pool.query('select * from voc.vocs where id=$1', [vocId]);
    const audit = await migrate.pool.query(
      'select * from core.audit_log where subject_id=$1 order by id',
      [vocId],
    );
    return { row: row.rows, audit: audit.rows };
  }
  async function patch(voc: { id: string; updated_at: string }, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: `/vocs/${voc.id}`,
      headers: { ...requestHeaders(), 'if-match': voc.updated_at },
      payload,
    });
  }
  function candidates(vocId: string, session = cookie) {
    return app.inject({
      method: 'GET',
      url: `/vocs/${vocId}/owner-candidates`,
      headers: requestHeaders(session),
    });
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    handle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: handle });
    await app.ready();
    for (const [name, roleLevel] of [
      ['admin', 'admin'],
      ['reporter', 'user'],
      ['system', 'admin'],
      ['otherScope', 'developer'],
      ['triageOnly', 'developer'],
      ['expired', 'developer'],
      ['deniedAdmin', 'admin'],
      ['eligibleDev', 'developer'],
      ['unrelated', 'user'],
    ] as const) {
      ids[name] = (
        await insertActorRow(handle, {
          workspaceId: WORKSPACE_ID,
          externalId: `${PREFIX}-${name}`,
          roleLevel,
        })
      ).id;
    }
    await migrate.pool.query("update core.actors set actor_type='system' where id=$1", [
      ids.system,
    ]);
    cookie = await loginAs(app, `${PREFIX}-admin`);
    reporterCookie = await loginAs(app, `${PREFIX}-reporter`);
    triageOnlyCookie = await loginAs(app, `${PREFIX}-triageOnly`);
    unrelatedCookie = await loginAs(app, `${PREFIX}-unrelated`);
    ms = await insertMsDirectly(handle, WORKSPACE_ID, `${PREFIX}-a`, '1172 A');
    otherMs = await insertMsDirectly(handle, WORKSPACE_ID, `${PREFIX}-b`, '1172 B');
    team = await insertTeamDirectly(migrate, WORKSPACE_ID, PREFIX);
    foreignWorkspace = randomUUID();
    await migrate.pool.query('insert into core.workspaces (id,name) values ($1,$2)', [
      foreignWorkspace,
      PREFIX,
    ]);
    ids.foreign = (
      await insertActorRow(handle, {
        workspaceId: foreignWorkspace,
        externalId: `${PREFIX}-foreign`,
        roleLevel: 'admin',
      })
    ).id;
    for (const [name, scope] of [
      ['eligibleDev', ms],
      ['expired', ms],
      ['otherScope', otherMs],
    ] as const) {
      for (const capability of ['voc.read', 'voc.triage']) {
        const grant = await grantCapability(
          handle,
          WORKSPACE_ID,
          ids[name] as string,
          capability,
          scope,
          ids.admin as string,
        );
        if (name === 'expired' && capability === 'voc.triage')
          await expireCapabilityGrant(handle, grant);
      }
    }
    await grantCapability(
      handle,
      WORKSPACE_ID,
      ids.triageOnly as string,
      'voc.triage',
      ms,
      ids.admin as string,
    );
    await denyCapability(
      handle,
      WORKSPACE_ID,
      ids.deniedAdmin as string,
      'voc.read',
      ms,
      ids.admin as string,
    );
  });

  beforeEach(async () => {
    // Rate-limit keys are `<workspace_id>:<actor_id>` (server.ts keyGenerator).
    await handle.pool.query('delete from core.rate_limits where key=any($1::text[])', [
      Object.values(ids).map((id) => `${WORKSPACE_ID}:${id}`),
    ]);
  });

  afterAll(async () => {
    await handle.pool.query('delete from voc.vocs where id=any($1::uuid[])', [vocIds]);
    await migrate.pool.query('delete from core.notifications where actor_id=any($1::uuid[])', [
      Object.values(ids),
    ]);
    await handle.pool.query(
      'update core.managed_systems set default_owner_actor_id=null where id=$1',
      [ms],
    );
    // Grants and denies reference the suite's Managed Systems.
    await handle.pool.query(
      'delete from permission.permission_grants where actor_id=any($1::uuid[])',
      [Object.values(ids)],
    );
    await handle.pool.query(
      'delete from permission.permission_denies where actor_id=any($1::uuid[])',
      [Object.values(ids)],
    );
    await deleteRecoveryFixtureParents(
      handle,
      'delete from core.managed_systems where id=any($1::uuid[])',
      [[ms, otherMs]],
    );
    await migrate.pool.query('delete from core.teams where id=$1', [team]);
    await cleanupTestActorsByExternalIdPrefix(handle, WORKSPACE_ID, PREFIX);
    await cleanupTestActorsByExternalIdPrefix(handle, foreignWorkspace, PREFIX);
    await deleteRecoveryFixtureParents(migrate, 'delete from core.workspaces where id=$1', [
      foreignWorkspace,
    ]);
    await app.close();
    await handle.close();
    await migrate.close();
  });

  it.each(rejected)(
    'rejects %s on PATCH and explicit create atomically (%s)',
    async (name, code) => {
      const voc = await fixture();
      const before = await state(voc.id);
      const response = await patch(voc, {
        owner_user_id: ids[name],
        severity: 'high',
        triage_state: 'triaged',
      });
      expect(response.statusCode, response.body).toBe(422);
      expect(response.json()).toMatchObject({
        code: 'validation.failed',
        detail: {
          fields: [{ path: ['owner_user_id'], code }],
        },
      });
      expect(await state(voc.id)).toEqual(before);
      const created = await create({ owner_user_id: ids[name] });
      expect(created.statusCode, created.body).toBe(422);
      expect(created.json()).toMatchObject({
        code: 'validation.failed',
        detail: {
          fields: [{ path: ['owner_user_id'], code }],
        },
      });
    },
  );

  // A nonexistent UUID cannot be stored as an MS default (FK); all storable rejected actors are covered.
  it.each(rejected.filter(([name]) => name !== 'missing'))(
    'falls back and diagnoses the configured %s default',
    async (name, category) => {
      await handle.pool.query(
        'update core.managed_systems set default_owner_actor_id=$1 where id=$2',
        [ids[name], ms],
      );
      try {
        const before = await migrate.pool.query(
          'select id from core.responsibility_default_failures where managed_system_id=$1',
          [ms],
        );
        const created = await rememberCreated(await create());
        expect(created).toMatchObject({
          owner_user_id: null,
          owner_team_id: null,
          default_resolved: false,
          source_rule: 'workspace_fallback_queue',
        });
        const diagnostics = await migrate.pool.query(
          'select id,rule,category from core.responsibility_default_failures where managed_system_id=$1',
          [ms],
        );
        expect(
          diagnostics.rows.filter((row) => !before.rows.some((old) => old.id === row.id)),
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ rule: 'managed_system_owner', category }),
          ]),
        );
      } finally {
        await handle.pool.query(
          'update core.managed_systems set default_owner_actor_id=null where id=$1',
          [ms],
        );
      }
    },
  );

  it.each(['eligibleDev', 'admin', 'team', 'unassign'] as const)(
    'accepts %s on PATCH and explicit create',
    async (name) => {
      const owner = {
        owner_user_id: name === 'team' || name === 'unassign' ? null : ids[name],
        owner_team_id: name === 'team' ? team : null,
      };
      const voc = await fixture(ids.reporter);
      const response = await patch(voc, owner);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject(owner);
      expect(await rememberCreated(await create(owner))).toMatchObject(owner);
    },
  );

  it.each(['eligibleDev', 'admin', 'team'] as const)(
    'resolves an eligible %s automatic default',
    async (name) => {
      await handle.pool.query(
        'update core.managed_systems set default_owner_actor_id=$1,default_owner_team_id=$2 where id=$3',
        [name === 'team' ? null : ids[name], name === 'team' ? team : null, ms],
      );
      try {
        expect(await rememberCreated(await create())).toMatchObject({
          owner_user_id: name === 'team' ? null : ids[name],
          owner_team_id: name === 'team' ? team : null,
          default_resolved: true,
          source_rule: 'managed_system_owner',
        });
      } finally {
        await handle.pool.query(
          'update core.managed_systems set default_owner_actor_id=null,default_owner_team_id=null where id=$1',
          [ms],
        );
      }
    },
  );

  it('allows unrelated severity edits without revalidating historical ownership', async () => {
    const voc = await fixture(ids.reporter);
    const response = await patch(voc, { severity: 'high' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ severity: 'high', owner_user_id: ids.reporter });
  });

  it('lists the eligible fixture actors, retains an ineligible current owner, and writes nothing', async () => {
    const voc = await fixture(ids.reporter);
    const before = await state(voc.id);
    const response = await candidates(voc.id);
    expect(response.statusCode, response.body).toBe(200);
    const body = vocOwnerCandidatesSchema.parse(response.json());
    // Scope exactness to this suite's fixtures: other suites also create workspace Actors.
    expect(body.actors.filter((actor) => Object.values(ids).includes(actor.id))).toEqual(
      expect.arrayContaining([
        { id: ids.admin, display_name: `${PREFIX}-admin`, eligible: true },
        { id: ids.eligibleDev, display_name: `${PREFIX}-eligibleDev`, eligible: true },
        { id: ids.reporter, display_name: `${PREFIX}-reporter`, eligible: false },
      ]),
    );
    expect(
      body.actors
        .filter((actor) => Object.values(ids).includes(actor.id))
        .map((actor) => actor.id)
        .sort(),
    ).toEqual([ids.admin, ids.eligibleDev, ids.reporter].sort());
    expect(response.body).not.toContain('email');
    expect(await state(voc.id)).toEqual(before);
  });

  it('retains a historical System owner disabled without listing other ineligible actors', async () => {
    const voc = await fixture(ids.system);
    const response = await candidates(voc.id);
    expect(response.statusCode).toBe(200);
    expect(vocOwnerCandidatesSchema.parse(response.json()).actors).toContainEqual({
      id: ids.system,
      display_name: `${PREFIX}-system`,
      eligible: false,
    });
  });

  it('reads owner candidates without taking an Actor row lock', async () => {
    const voc = await fixture(ids.reporter);
    const holder = await handle.pool.connect();
    try {
      await holder.query('begin');
      await holder.query('select 1 from core.actors where id=$1 for update', [ids.eligibleDev]);
      const outcome = await Promise.race([
        candidates(voc.id).then((response) => response.statusCode),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 2000)),
      ]);
      expect(outcome).toBe(200);
    } finally {
      await holder.query('rollback');
      holder.release();
    }
  });

  it('matches PATCH denial for a visible reporter without triage; hides unreadable VOCs', async () => {
    const voc = await fixture();
    const response = await candidates(voc.id, reporterCookie);
    const deniedPatch = await app.inject({
      method: 'PATCH',
      url: `/vocs/${voc.id}`,
      headers: { ...requestHeaders(reporterCookie), 'if-match': voc.updated_at },
      payload: { severity: 'low' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: deniedPatch.json().code,
      detail: deniedPatch.json().detail,
    });
    const developerCookie = await loginAs(app, `${PREFIX}-expired`);
    const developerDenied = await candidates(voc.id, developerCookie);
    const developerDeniedPatch = await app.inject({
      method: 'PATCH',
      url: `/vocs/${voc.id}`,
      headers: { ...requestHeaders(developerCookie), 'if-match': voc.updated_at },
      payload: { severity: 'low' },
    });
    expect(developerDenied.statusCode).toBe(403);
    expect(developerDeniedPatch.statusCode).toBe(403);
    expect(developerDenied.json()).toMatchObject({
      code: 'permission.scope_required',
      detail: developerDeniedPatch.json().detail,
    });
    expect(developerDenied.json().detail.requiredScope).toEqual([ms]);
    const hidden = await candidates(voc.id, unrelatedCookie);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json().code).toBe('not_found.record');
    // Detail's summary-visible triage-only arm stays visible and can use the picker.
    expect((await candidates(voc.id, triageOnlyCookie)).statusCode).toBe(200);
  });
});
