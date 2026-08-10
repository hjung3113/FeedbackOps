import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../voc/__tests__/_seed-helpers.js';
import { createCheckService } from '../check-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TEST_REASON = 'perm-decision-it:';

function sessionCookie(setCookie: string | string[] | undefined): string {
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  const value = values
    .find((entry) => entry)
    ?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
  if (!value) throw new Error('mock login did not set a session cookie');
  return value;
}

async function loginAs(app: FastifyInstance, externalId: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/mock-login',
    headers: { 'user-agent': 'permission-decision-integration-test' },
    payload: { external_id: externalId },
  });
  return sessionCookie(response.headers['set-cookie']);
}

describe.skipIf(!runIntegration)('permission request decisions', () => {
  let db: DbHandle;
  let migrateDb: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminId: string;
  let requesterId: string;
  let requesterExternalId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const admin = await db.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? '';
    if (!adminId) throw new Error('mock admin missing');
  });

  beforeEach(async () => {
    await db.pool.query('delete from core.idempotency_keys');
    await db.pool.query('delete from core.rate_limits');
    const actor = await insertDevActor(db, WORKSPACE_ID, `perm-decision-${randomUUID()}`);
    requesterId = actor.id;
    requesterExternalId = actor.externalId;
  });

  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await db?.close();
    await migrateDb?.close();
  });

  // This suite used to close its handles and leave everything it created in
  // the database. The managed systems in particular ('perm-decision-%',
  // 'deny-scope-%') outlived the run and made `db/__tests__/seed` fail its
  // exact-match assertion on the seeded Slice 2 managed systems, because that
  // suite happens to run later in the same process pool (#205).
  //
  // Deletion order follows the FK graph into core.actors: requests, grants and
  // denies, then the per-actor session/idempotency/rate-limit rows, then the
  // audit rows (migrate role — fops_app holds no DELETE on core.audit_log by
  // design, ADR-0008/0019), and only then the actors themselves.
  async function cleanupFixtures(): Promise<void> {
    const actorPattern = `(external_id like 'mock-dev-read-perm-decision-%'
                            or external_id like 'perm-self-%')`;
    const actorIds = `select id from core.actors
                       where workspace_id = $1 and ${actorPattern}`;

    await db.pool.query(
      `delete from permission.permission_requests
        where workspace_id = $1 and requester_actor_id in (${actorIds})`,
      [WORKSPACE_ID],
    );
    await db.pool.query(
      `delete from permission.permission_denies
        where workspace_id = $1 and actor_id in (${actorIds})`,
      [WORKSPACE_ID],
    );
    await db.pool.query(
      `delete from permission.permission_grants
        where workspace_id = $1 and actor_id in (${actorIds})`,
      [WORKSPACE_ID],
    );
    await db.pool.query(
      `delete from core.idempotency_keys where actor_id in (${actorIds})`,
      [WORKSPACE_ID],
    );
    await db.pool.query(
      `delete from core.sessions where actor_id in (${actorIds})`,
      [WORKSPACE_ID],
    );
    await migrateDb.pool.query(
      `delete from core.audit_log where actor_id in (${actorIds})`,
      [WORKSPACE_ID],
    );
    await db.pool.query(
      `delete from core.actors where workspace_id = $1 and ${actorPattern}`,
      [WORKSPACE_ID],
    );
    await db.pool.query(
      `delete from core.managed_systems
        where workspace_id = $1
          and (slug like 'perm-decision-%' or slug like 'deny-scope-%')`,
      [WORKSPACE_ID],
    );
  }

  async function seedRequest(
    input: {
      capability?: string;
      managedSystemId?: string | null;
      status?: string;
      requesterActorId?: string;
    } = {},
  ): Promise<string> {
    const inserted = await db.pool.query<{ id: string }>(
      `insert into permission.permission_requests
        (workspace_id, requester_actor_id, requested_capability, requested_managed_system_id, reason, status)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        WORKSPACE_ID,
        input.requesterActorId ?? requesterId,
        input.capability ?? 'voc.read',
        input.managedSystemId ?? null,
        `${TEST_REASON}${randomUUID()}`,
        input.status ?? 'pending',
      ],
    );
    return inserted.rows[0]?.id ?? '';
  }

  function decide(
    id: string,
    action: 'approve' | 'reject' | 'need-more-info' | 'deny',
    payload: Record<string, unknown>,
    cookie = adminCookie,
    key?: string,
  ) {
    return app.inject({
      method: 'POST',
      url: `/permissions/requests/${id}/${action}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        ...(key ? { 'idempotency-key': key } : {}),
      },
      payload,
    });
  }

  async function requestStatus(id: string): Promise<string> {
    const result = await db.pool.query<{ status: string }>(
      'select status from permission.permission_requests where id = $1',
      [id],
    );
    return result.rows[0]?.status ?? '';
  }

  async function isPendingInMine(id: string, cookie: string): Promise<boolean> {
    const response = await app.inject({
      method: 'GET',
      url: '/permission-requests/mine',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      requests: Array<{ id: string; status: string }>;
    }>();
    return body.requests.some((request) => request.id === id && request.status === 'pending');
  }

  async function insertAdmin(
    externalId: string,
  ): Promise<{ id: string; externalId: string; cookie: string }> {
    const result = await db.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, 'Self approval admin', 'admin', 'internal_member') returning id`,
      [WORKSPACE_ID, externalId, `${externalId}@example.test`],
    );
    const id = result.rows[0]?.id ?? '';
    if (!id) throw new Error('self approval admin seed failed');
    return { id, externalId, cookie: await loginAs(app, externalId) };
  }

  async function patchWorkspaceSettings(payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: '/workspace/settings',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
      },
      payload,
    });
  }

  it('approve mints workspace and managed-system grants consumed by check-service', async () => {
    const workspaceRequest = await seedRequest();
    expect((await decide(workspaceRequest, 'approve', {})).statusCode).toBe(200);
    const check = createCheckService({ db: db.db });
    expect(
      await check.checkCapability(
        {
          actor_id: requesterId,
          workspace_id: WORKSPACE_ID,
          role_level: 'developer',
        },
        'voc.read',
        { workspace_id: WORKSPACE_ID },
      ),
    ).toMatchObject({ allow: true, via: 'direct_grant' });
    const approvalAudit = await db.pool.query<{ count: string }>(
      `select count(*) from core.audit_log where subject_id = $1 and event_type = 'permission_approved'`,
      [workspaceRequest],
    );
    expect(Number(approvalAudit.rows[0]?.count)).toBe(1);

    const managedSystem = await db.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, 'Decision Test MS') returning id`,
      [WORKSPACE_ID, `perm-decision-${randomUUID()}`],
    );
    const msId = managedSystem.rows[0]?.id ?? '';
    const scopedRequest = await seedRequest({
      managedSystemId: msId,
      capability: 'finding.read',
    });
    expect((await decide(scopedRequest, 'approve', {})).statusCode).toBe(200);
    expect(
      await check.checkCapability(
        {
          actor_id: requesterId,
          workspace_id: WORKSPACE_ID,
          role_level: 'developer',
        },
        'finding.read',
        { workspace_id: WORKSPACE_ID, managed_system_id: msId },
      ),
    ).toMatchObject({ allow: true, via: 'managed_system_scope' });
  });

  it('deny overrides an existing grant, transitions rejected, and is audited once', async () => {
    const id = await seedRequest();
    await db.pool.query(
      `insert into permission.permission_grants
        (workspace_id, actor_id, capability, granted_by_actor_id) values ($1, $2, 'voc.read', $3)`,
      [WORKSPACE_ID, requesterId, adminId],
    );
    const response = await decide(
      id,
      'deny',
      { reason: 'Access explicitly denied.' },
      adminCookie,
      randomUUID(),
    );
    expect(response.statusCode).toBe(200);
    expect(await requestStatus(id)).toBe('rejected');
    const decision = await createCheckService({ db: db.db }).checkCapability(
      {
        actor_id: requesterId,
        workspace_id: WORKSPACE_ID,
        role_level: 'developer',
      },
      'voc.read',
      { workspace_id: WORKSPACE_ID },
    );
    expect(decision).toMatchObject({ allow: false, reason: 'explicit_deny' });
    const audit = await db.pool.query<{ count: string }>(
      `select count(*) from core.audit_log where subject_id = $1 and event_type = 'permission_denied'`,
      [id],
    );
    expect(Number(audit.rows[0]?.count)).toBe(1);
  });

  it('reject and need-more-info only transition the request and mint no grant', async () => {
    const rejected = await seedRequest();
    const moreInfo = await seedRequest({ capability: 'finding.read' });
    expect((await decide(rejected, 'reject', { reason: 'Not justified.' })).statusCode).toBe(200);
    expect(
      (
        await decide(moreInfo, 'need-more-info', {
          note: 'Please provide scope.',
        })
      ).statusCode,
    ).toBe(200);
    expect(await requestStatus(rejected)).toBe('rejected');
    expect(await requestStatus(moreInfo)).toBe('needs_more_info');
    const grants = await db.pool.query<{ count: string }>(
      `select count(*) from permission.permission_grants where actor_id = $1 and capability in ('voc.read', 'finding.read')`,
      [requesterId],
    );
    expect(Number(grants.rows[0]?.count)).toBe(0);
    const audit = await db.pool.query<{ event_type: string; count: string }>(
      `select event_type, count(*) from core.audit_log
        where subject_id in ($1, $2)
        group by event_type`,
      [rejected, moreInfo],
    );
    expect(audit.rows).toEqual(
      expect.arrayContaining([
        { event_type: 'permission_rejected', count: '1' },
        { event_type: 'permission_needs_more_info', count: '1' },
      ]),
    );
  });

  it('denies only the managed-system scope requested', async () => {
    const systems = await Promise.all(
      ['A', 'B'].map(async (name) => {
        const result = await db.pool.query<{ id: string }>(
          `insert into core.managed_systems (workspace_id, slug, name)
           values ($1, $2, $3) returning id`,
          [WORKSPACE_ID, `deny-scope-${name}-${randomUUID()}`, `Deny Scope ${name}`],
        );
        return result.rows[0]?.id ?? '';
      }),
    );
    const [msA, msB] = systems;
    if (!msA || !msB) throw new Error('managed systems missing');
    const denied = await seedRequest({
      capability: 'finding.read',
      managedSystemId: msA,
    });
    expect((await decide(denied, 'deny', { reason: 'Denied for A.' })).statusCode).toBe(200);
    const granted = await seedRequest({
      capability: 'finding.read',
      managedSystemId: msB,
    });
    expect((await decide(granted, 'approve', {})).statusCode).toBe(200);
    const check = createCheckService({ db: db.db });
    const actor = {
      actor_id: requesterId,
      workspace_id: WORKSPACE_ID,
      role_level: 'developer',
    };
    await expect(
      check.checkCapability(actor, 'finding.read', {
        workspace_id: WORKSPACE_ID,
        managed_system_id: msA,
      }),
    ).resolves.toMatchObject({ allow: false, reason: 'explicit_deny' });
    await expect(
      check.checkCapability(actor, 'finding.read', {
        workspace_id: WORKSPACE_ID,
        managed_system_id: msB,
      }),
    ).resolves.toMatchObject({ allow: true, via: 'managed_system_scope' });
  });

  it('requires admin for every decision route and review list status filter', async () => {
    const developerCookie = await loginAs(app, requesterExternalId);
    for (const action of ['approve', 'reject', 'need-more-info', 'deny'] as const) {
      const id = await seedRequest({
        capability:
          action === 'approve'
            ? 'voc.read'
            : action === 'reject'
              ? 'finding.read'
              : action === 'need-more-info'
                ? 'finding.manage'
                : 'workspace.read',
      });
      const payload =
        action === 'need-more-info' ? { note: 'n' } : action === 'approve' ? {} : { reason: 'r' };
      expect((await decide(id, action, payload, developerCookie)).statusCode).toBe(403);
    }
    const list = await app.inject({
      method: 'GET',
      url: '/permissions/requests?status=approved',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${developerCookie}` },
    });
    expect(list.statusCode).toBe(403);
  });

  it('returns stale-write for a second decision', async () => {
    const approved = await seedRequest();
    expect((await decide(approved, 'approve', {})).statusCode).toBe(200);
    const stale = await decide(approved, 'reject', { reason: 'late' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('conflict.stale_write');
  });

  it('returns the specific duplicate-grant conflict', async () => {
    const first = await seedRequest();
    expect((await decide(first, 'approve', {})).statusCode).toBe(200);
    const duplicate = await seedRequest();
    expect((await decide(duplicate, 'approve', {})).statusCode).toBe(409);
    expect((await decide(duplicate, 'approve', {})).json().code).toBe(
      'conflict.capability_already_granted',
    );
  });

  it('returns the specific duplicate-deny conflict', async () => {
    const first = await seedRequest();
    expect((await decide(first, 'deny', { reason: 'First deny.' })).statusCode).toBe(200);
    const duplicate = await seedRequest();
    const response = await decide(duplicate, 'deny', {
      reason: 'Duplicate deny.',
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('conflict.capability_already_denied');
  });

  it('replays an idempotent approval without a second grant', async () => {
    const keyed = await seedRequest({ capability: 'finding.manage' });
    const key = randomUUID();
    const first = await decide(keyed, 'approve', {}, adminCookie, key);
    const replay = await decide(keyed, 'approve', {}, adminCookie, key);
    expect(replay.json()).toEqual(first.json());
    const grantCount = await db.pool.query<{ count: string }>(
      `select count(*) from permission.permission_grants where actor_id = $1 and capability = 'finding.manage'`,
      [requesterId],
    );
    expect(Number(grantCount.rows[0]?.count)).toBe(1);
  });

  it.each([
    ['reject', 'finding.read', { reason: '' }],
    ['deny', 'finding.manage', { reason: '' }],
    ['need-more-info', 'workspace.read', { note: '' }],
  ] as const)('requires a reason for %s', async (action, capability, payload) => {
    const response = await decide(await seedRequest({ capability }), action, payload);
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation.failed');
  });

  it('requires a reason for sensitive approval but not non-sensitive approval', async () => {
    const sensitive = await seedRequest({ capability: 'workspace.admin' });
    const sensitiveResponse = await decide(sensitive, 'approve', {});
    expect(sensitiveResponse.statusCode).toBe(422);
    expect(sensitiveResponse.json().code).toBe('validation.sensitive_reason_required');
    const nonSensitive = await seedRequest({ capability: 'workspace.read' });
    expect((await decide(nonSensitive, 'approve', {})).statusCode).toBe(200);
  });

  it('allows a self-approval with its envelope, audits it, and mints an effective grant by default', async () => {
    await migrateDb.pool.query('delete from core.workspace_settings where workspace_id = $1', [WORKSPACE_ID]);
    const settingsRow = await db.pool.query(
      'select 1 from core.workspace_settings where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(settingsRow.rowCount).toBe(0);
    const self = await insertAdmin(`perm-self-allowed-${randomUUID()}`);
    const request = await seedRequest({
      requesterActorId: self.id,
      capability: 'workspace.read',
    });
    const envelope = {
      policy_citation: 'POL-196 section 1',
      peer_reviewer_absence: 'No peer reviewer is available for this workspace.',
    };

    const response = await decide(request, 'approve', { self_approval: envelope }, self.cookie);
    expect(response.statusCode).toBe(200);
    expect(await requestStatus(request)).toBe('approved');
    const audit = await db.pool.query<{ detail: unknown }>(
      `select detail from core.audit_log where subject_id = $1 and event_type = 'permission_approved'`,
      [request],
    );
    expect(audit.rows).toEqual([
      expect.objectContaining({ detail: expect.objectContaining({ self_approval: envelope }) }),
    ]);
    await db.pool.query("update core.actors set role_level = 'developer' where id = $1", [self.id]);
    const developerCookie = await loginAs(app, self.externalId);
    expect(developerCookie).toBeTruthy();
    expect(
      await createCheckService({ db: db.db }).checkCapability(
        {
          actor_id: self.id,
          workspace_id: WORKSPACE_ID,
          role_level: 'developer',
        },
        'workspace.read',
        { workspace_id: WORKSPACE_ID },
      ),
    ).toMatchObject({ allow: true, via: 'direct_grant' });
  });

  it('rejects a self-approval missing its envelope and leaves the request pending', async () => {
    const self = await insertAdmin(`perm-self-missing-${randomUUID()}`);
    const request = await seedRequest({ requesterActorId: self.id });
    const response = await decide(request, 'approve', {}, self.cookie);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    expect(response.json()).toMatchObject({
      code: 'validation.failed',
      detail: { fields: [{ path: ['self_approval'] }] },
    });
    expect(await isPendingInMine(request, self.cookie)).toBe(true);
  });

  it('forbids self-approval by policy but lets a separate admin approve without an envelope', async () => {
    expect(
      (await patchWorkspaceSettings({ permission_self_approval: 'forbidden' })).statusCode,
    ).toBe(200);
    const self = await insertAdmin(`perm-self-forbidden-${randomUUID()}`);
    const request = await seedRequest({
      requesterActorId: self.id,
      capability: 'workspace.read',
    });
    const denied = await decide(
      request,
      'approve',
      {
        self_approval: {
          policy_citation: 'POL-196 section 2',
          peer_reviewer_absence: 'No peer reviewer is available.',
        },
      },
      self.cookie,
    );
    expect(denied.statusCode).toBeGreaterThanOrEqual(400);
    expect(denied.statusCode).toBeLessThan(500);
    expect(denied.json()).toMatchObject({ code: 'permission.denied' });
    expect(await isPendingInMine(request, self.cookie)).toBe(true);
    expect((await decide(request, 'approve', {}, adminCookie)).statusCode).toBe(200);
  });

  it('rejects a self-approval envelope from a non-self approver', async () => {
    const request = await seedRequest();
    const response = await decide(request, 'approve', {
      self_approval: {
        policy_citation: 'POL-196 section 3',
        peer_reviewer_absence: 'Not applicable.',
      },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    expect(response.json()).toMatchObject({ code: 'validation.failed' });
    const requesterCookie = await loginAs(app, requesterExternalId);
    expect(await isPendingInMine(request, requesterCookie)).toBe(true);
  });

  it('returns not-found for an unknown request', async () => {
    const response = await decide(randomUUID(), 'approve', {});
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('not_found.record');
  });
});
