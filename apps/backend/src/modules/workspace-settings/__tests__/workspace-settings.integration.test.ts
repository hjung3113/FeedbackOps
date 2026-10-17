import { randomUUID } from 'node:crypto';

import type { CoverageThresholds } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { denyCapability, grantCapability } from '../../../test-support/permissions-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const BASIC_EXTERNAL_ID = `it-workspace-settings-user-${randomUUID().slice(0, 8)}`;

const defaultBands = {
  'voc-task': { good_min_percent: 75, warn_min_percent: 40 },
  'finding-execution': { good_min_percent: 75, warn_min_percent: 40 },
  'high-followup': { good_min_percent: 75, warn_min_percent: 40 },
  'released-update': { good_min_percent: 75, warn_min_percent: 40 },
  'analytics-area': { good_min_percent: 75, warn_min_percent: 40 },
};

interface SettingsBody {
  voc_cluster_suggestions_enabled: boolean;
  coverage_thresholds: CoverageThresholds;
  permission_self_approval: 'allowed' | 'forbidden';
  survey_anonymity_threshold: number;
}

describe.skipIf(!runIntegration)('workspace settings (#195)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let basicActorId: string;
  let basicCookie: string;
  const extraActors: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    const basic = await appHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, 'Workspace Settings User', 'user', 'internal_member')
       returning id`,
      [WORKSPACE_ID, BASIC_EXTERNAL_ID, `${BASIC_EXTERNAL_ID}@local`],
    );
    basicActorId = basic.rows[0]?.id ?? '';
    if (!basicActorId) throw new Error('workspace settings basic actor seed failed');
    basicCookie = await loginAs(app, BASIC_EXTERNAL_ID);
  });

  beforeEach(async () => {
    await cleanupFixtures();
    await migrateHandle.pool.query('delete from core.rate_limits');
  });

  afterAll(async () => {
    await cleanupFixtures();
    for (const actorId of extraActors) {
      await migrateHandle.pool.query(
        'delete from permission.permission_grants where actor_id = $1',
        [actorId],
      );
      await migrateHandle.pool.query(
        'delete from permission.permission_denies where actor_id = $1',
        [actorId],
      );
      await migrateHandle.pool.query('delete from core.sessions where actor_id = $1', [actorId]);
      await migrateHandle.pool.query('delete from core.actors where id = $1', [actorId]);
    }
    await migrateHandle.pool.query('delete from core.sessions where actor_id = $1', [basicActorId]);
    await migrateHandle.pool.query('delete from core.actors where id = $1', [basicActorId]);
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where workspace_id = $1
          and subject_type = 'workspace'
          and subject_id = $1
          and event_type = 'workspace_settings_updated'`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query('delete from core.workspace_settings where workspace_id = $1', [
      WORKSPACE_ID,
    ]);
    await migrateHandle.pool.query(
      `delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
  }

  async function request(
    method: 'GET' | 'PATCH',
    cookie: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      method,
      url: '/workspace/settings',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        ...(payload ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload ? { payload } : {}),
    });
  }

  async function auditCount(): Promise<number> {
    const result = await migrateHandle.pool.query<{ count: string }>(
      `select count(*)::text as count
         from core.audit_log
        where workspace_id = $1
          and subject_type = 'workspace'
          and subject_id = $1
          and event_type = 'workspace_settings_updated'`,
      [WORKSPACE_ID],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  it('GET resolves defaults when no storage row exists', async () => {
    const response = await request('GET', adminCookie);

    expect(response.statusCode).toBe(200);
    expect(response.json<SettingsBody>()).toEqual({
      voc_cluster_suggestions_enabled: false,
      coverage_thresholds: defaultBands,
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 5,
    });
    const row = await appHandle.pool.query(
      'select * from core.workspace_settings where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(row.rowCount).toBe(0);
  });

  it('merges a complete partial Coverage pair and audits effective metrics only', async () => {
    const payload = {
      coverage_thresholds: { 'voc-task': { good_min_percent: 80, warn_min_percent: 50 } },
    };
    const response = await request('PATCH', adminCookie, payload);
    expect(response.statusCode).toBe(200);
    expect(response.json<SettingsBody>().coverage_thresholds).toEqual({
      ...defaultBands,
      'voc-task': { good_min_percent: 80, warn_min_percent: 50 },
    });
    const audit = await migrateHandle.pool.query<{ detail: unknown }>(
      "select detail from core.audit_log where workspace_id = $1 and event_type = 'workspace_settings_updated'",
      [WORKSPACE_ID],
    );
    expect(audit.rows).toEqual([
      {
        detail: {
          changes: {
            coverage_thresholds: {
              'voc-task': {
                from: { good_min_percent: 75, warn_min_percent: 40 },
                to: { good_min_percent: 80, warn_min_percent: 50 },
              },
            },
          },
        },
      },
    ]);
    expect((await request('PATCH', adminCookie, payload)).statusCode).toBe(200);
    expect(await auditCount()).toBe(1);
  });

  it.each([
    {},
    { 'voc-task': { good_min_percent: 80 } },
    { unknown: { good_min_percent: 80, warn_min_percent: 50 } },
    { 'milestone-outcome': { good_min_percent: 80, warn_min_percent: 50 } },
    { 'voc-task': { good_min_percent: 80, warn_min_percent: 50, extra: 1 } },
    { 'voc-task': { good_min_percent: 80.5, warn_min_percent: 50 } },
    { 'voc-task': { good_min_percent: 101, warn_min_percent: 50 } },
    { 'voc-task': { good_min_percent: 80, warn_min_percent: -1 } },
    { 'voc-task': { good_min_percent: 50, warn_min_percent: 50 } },
    { 'voc-task': { good_min_percent: 40, warn_min_percent: 50 } },
  ])(
    'rejects invalid Coverage map %j without settings or audit mutation',
    async (coverage_thresholds) => {
      const response = await request('PATCH', adminCookie, { coverage_thresholds });
      expect(response.statusCode).toBe(422);
      expect(response.json<{ code: string }>().code).toBe('validation.failed');
      expect((await request('GET', adminCookie)).json<SettingsBody>().coverage_thresholds).toEqual(
        defaultBands,
      );
      expect(await auditCount()).toBe(0);
      expect(
        (
          await appHandle.pool.query(
            'select * from core.workspace_settings where workspace_id = $1',
            [WORKSPACE_ID],
          )
        ).rowCount,
      ).toBe(0);
    },
  );

  it('resolves missing stored metric keys without materializing a no-op', async () => {
    await migrateHandle.pool.query(
      'insert into core.workspace_settings (workspace_id, coverage_thresholds) values ($1, $2::jsonb)',
      [
        WORKSPACE_ID,
        JSON.stringify({ 'voc-task': { good_min_percent: 80, warn_min_percent: 50 } }),
      ],
    );
    const before = await appHandle.pool.query(
      'select coverage_thresholds, updated_at from core.workspace_settings where workspace_id = $1',
      [WORKSPACE_ID],
    );
    const response = await request('PATCH', adminCookie, {
      coverage_thresholds: { 'high-followup': { good_min_percent: 75, warn_min_percent: 40 } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<SettingsBody>().coverage_thresholds).toEqual({
      ...defaultBands,
      'voc-task': { good_min_percent: 80, warn_min_percent: 50 },
    });
    expect(
      (
        await appHandle.pool.query(
          'select coverage_thresholds, updated_at from core.workspace_settings where workspace_id = $1',
          [WORKSPACE_ID],
        )
      ).rows,
    ).toEqual(before.rows);
    expect(await auditCount()).toBe(0);
  });

  async function actorCookie(roleLevel: 'admin' | 'developer' | 'user', denied = false) {
    const externalId = `it-settings-${randomUUID()}`;
    const actor = await insertActorRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      externalId,
      roleLevel,
    });
    extraActors.push(actor.id);
    if (roleLevel === 'developer') {
      const system = await migrateHandle.pool.query<{ id: string }>(
        'select id from core.managed_systems where workspace_id = $1 and archived_at is null limit 1',
        [WORKSPACE_ID],
      );
      if (!system.rows[0]) throw new Error('seed Managed System missing for scoped Developer');
      await grantCapability(
        migrateHandle,
        WORKSPACE_ID,
        actor.id,
        'voc.read',
        system.rows[0].id,
        actor.id,
      );
    }
    if (denied)
      await denyCapability(
        migrateHandle,
        WORKSPACE_ID,
        actor.id,
        'workspace.admin',
        null,
        actor.id,
      );
    return loginAs(app, externalId);
  }

  it.each(['developer', 'user', 'denied-admin'] as const)(
    'rejects %s GET/PATCH without settings or audit changes',
    async (persona) => {
      const cookie = await actorCookie(
        persona === 'denied-admin' ? 'admin' : persona,
        persona === 'denied-admin',
      );
      for (const method of ['GET', 'PATCH'] as const) {
        const response = await request(
          method,
          cookie,
          method === 'PATCH'
            ? {
                coverage_thresholds: { 'voc-task': { good_min_percent: 80, warn_min_percent: 50 } },
              }
            : undefined,
        );
        expect(response.statusCode).toBe(403);
        expect(response.json<{ code: string }>().code).toBe('permission.denied');
      }
      expect(await auditCount()).toBe(0);
      expect(
        (
          await appHandle.pool.query(
            'select * from core.workspace_settings where workspace_id = $1',
            [WORKSPACE_ID],
          )
        ).rowCount,
      ).toBe(0);
    },
  );

  it('serializes overlapping route PATCHes and preserves disjoint metrics and unrelated fields', async () => {
    await migrateHandle.pool.query(
      'insert into core.workspace_settings (workspace_id) values ($1)',
      [WORKSPACE_ID],
    );
    const [firstCookie, secondCookie, thirdCookie] = await Promise.all([
      actorCookie('admin'),
      actorCookie('admin'),
      actorCookie('admin'),
    ]);
    const blocker = await migrateHandle.pool.connect();
    let requests: ReturnType<typeof request>[] = [];
    try {
      await blocker.query('begin');
      await blocker.query(
        'select workspace_id from core.workspace_settings where workspace_id = $1 for update',
        [WORKSPACE_ID],
      );
      requests = [
        request('PATCH', firstCookie, {
          coverage_thresholds: { 'voc-task': { good_min_percent: 80, warn_min_percent: 50 } },
        }),
        request('PATCH', secondCookie, {
          coverage_thresholds: { 'high-followup': { good_min_percent: 90, warn_min_percent: 60 } },
        }),
        request('PATCH', thirdCookie, { survey_anonymity_threshold: 9 }),
      ];
      // Start Fastify injection then prove all three transactions wait on the held singleton.
      const running = Promise.all(requests);
      let waiting = 0;
      for (let attempt = 0; attempt < 200 && waiting < 3; attempt++) {
        const locks = await migrateHandle.pool.query<{ count: string }>(
          `select count(distinct w.pid)::text as count from pg_locks w join pg_locks t on t.pid = w.pid where not w.granted and t.relation = 'core.workspace_settings'::regclass`,
        );
        waiting = Number(locks.rows[0]?.count ?? 0);
        if (waiting < 3) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(3);
      await blocker.query('commit');
      expect((await running).map((response) => response.statusCode)).toEqual([200, 200, 200]);
    } finally {
      await blocker.query('rollback');
      blocker.release();
      await Promise.all(requests);
    }
    const settings = (await request('GET', adminCookie)).json<SettingsBody>();
    expect(settings).toEqual({
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 9,
      voc_cluster_suggestions_enabled: false,
      coverage_thresholds: {
        ...defaultBands,
        'voc-task': { good_min_percent: 80, warn_min_percent: 50 },
        'high-followup': { good_min_percent: 90, warn_min_percent: 60 },
      },
    });
    const audits = await migrateHandle.pool.query<{ detail: unknown }>(
      "select detail from core.audit_log where workspace_id = $1 and event_type = 'workspace_settings_updated'",
      [WORKSPACE_ID],
    );
    expect(audits.rows).toHaveLength(3);
    expect(audits.rows).toEqual(
      expect.arrayContaining([
        {
          detail: {
            changes: {
              coverage_thresholds: {
                'voc-task': {
                  from: defaultBands['voc-task'],
                  to: { good_min_percent: 80, warn_min_percent: 50 },
                },
              },
            },
          },
        },
        {
          detail: {
            changes: {
              coverage_thresholds: {
                'high-followup': {
                  from: defaultBands['high-followup'],
                  to: { good_min_percent: 90, warn_min_percent: 60 },
                },
              },
            },
          },
        },
        { detail: { changes: { survey_anonymity_threshold: { from: 5, to: 9 } } } },
      ]),
    );
  });

  it('denies non-admin GET and PATCH without creating a row', async () => {
    const getResponse = await request('GET', basicCookie);
    const patchResponse = await request('PATCH', basicCookie, { survey_anonymity_threshold: 7 });

    expect(getResponse.statusCode).toBe(403);
    expect(getResponse.json<{ code: string }>().code).toBe('permission.denied');
    expect(patchResponse.statusCode).toBe(403);
    expect(patchResponse.json<{ code: string }>().code).toBe('permission.denied');
    const row = await appHandle.pool.query(
      'select * from core.workspace_settings where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(row.rowCount).toBe(0);
  });

  it('patches the threshold, resolves it on GET, and audits only that field', async () => {
    const patchResponse = await request('PATCH', adminCookie, { survey_anonymity_threshold: 7 });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json<SettingsBody>()).toEqual({
      voc_cluster_suggestions_enabled: false,
      coverage_thresholds: defaultBands,
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 7,
    });
    const getResponse = await request('GET', adminCookie);
    expect(getResponse.json<SettingsBody>()).toEqual({
      voc_cluster_suggestions_enabled: false,
      coverage_thresholds: defaultBands,
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 7,
    });
    const audit = await migrateHandle.pool.query<{ event_type: string; detail: unknown }>(
      `select event_type, detail from core.audit_log
        where workspace_id = $1 and event_type = 'workspace_settings_updated'`,
      [WORKSPACE_ID],
    );
    expect(audit.rows).toEqual([
      {
        event_type: 'workspace_settings_updated',
        detail: { changes: { survey_anonymity_threshold: { from: 5, to: 7 } } },
      },
    ]);
  });

  it('rejects invalid and empty PATCH bodies', async () => {
    for (const body of [
      { survey_anonymity_threshold: 4 },
      { survey_anonymity_threshold: 51 },
      { permission_self_approval: 'maybe' },
      {},
    ]) {
      const response = await request('PATCH', adminCookie, body);
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    }
    const row = await appHandle.pool.query(
      'select * from core.workspace_settings where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(row.rowCount).toBe(0);
  });

  it('rejects unknown PATCH keys without changing resolved settings', async () => {
    const response = await request('PATCH', adminCookie, {
      survey_anonymity_threshold: 7,
      bogus: 1,
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    const getResponse = await request('GET', adminCookie);
    expect(getResponse.json<SettingsBody>()).toEqual({
      voc_cluster_suggestions_enabled: false,
      coverage_thresholds: defaultBands,
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 5,
    });
    const row = await appHandle.pool.query(
      'select * from core.workspace_settings where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(row.rowCount).toBe(0);
  });

  it('does not audit a row-absent PATCH equal to the resolved defaults', async () => {
    const initialRow = await appHandle.pool.query(
      'select * from core.workspace_settings where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(initialRow.rowCount).toBe(0);
    const before = await auditCount();

    const response = await request('PATCH', adminCookie, {
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 5,
    });

    expect(response.statusCode).toBe(200);
    expect(await auditCount()).toBe(before);
    expect(
      (
        await appHandle.pool.query(
          'select * from core.workspace_settings where workspace_id = $1',
          [WORKSPACE_ID],
        )
      ).rowCount,
    ).toBe(0);
    const getResponse = await request('GET', adminCookie);
    expect(getResponse.json<SettingsBody>()).toEqual({
      voc_cluster_suggestions_enabled: false,
      coverage_thresholds: defaultBands,
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 5,
    });
  });

  it('does not append an audit event for an effective no-op PATCH', async () => {
    const initial = await request('PATCH', adminCookie, { survey_anonymity_threshold: 7 });
    expect(initial.statusCode).toBe(200);
    const before = await auditCount();
    const storedBefore = await appHandle.pool.query(
      'select updated_at from core.workspace_settings where workspace_id = $1',
      [WORKSPACE_ID],
    );

    const response = await request('PATCH', adminCookie, { survey_anonymity_threshold: 7 });

    expect(response.statusCode).toBe(200);
    expect(response.json<SettingsBody>()).toEqual({
      voc_cluster_suggestions_enabled: false,
      coverage_thresholds: defaultBands,
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 7,
    });
    expect(await auditCount()).toBe(before);
    expect(
      (
        await appHandle.pool.query(
          'select updated_at from core.workspace_settings where workspace_id = $1',
          [WORKSPACE_ID],
        )
      ).rows,
    ).toEqual(storedBefore.rows);
  });

  it('persists permission self-approval and records its exact audit change', async () => {
    const patchResponse = await request('PATCH', adminCookie, {
      permission_self_approval: 'forbidden',
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json<SettingsBody>()).toEqual({
      voc_cluster_suggestions_enabled: false,
      coverage_thresholds: defaultBands,
      permission_self_approval: 'forbidden',
      survey_anonymity_threshold: 5,
    });
    const getResponse = await request('GET', adminCookie);
    expect(getResponse.json<SettingsBody>()).toEqual({
      voc_cluster_suggestions_enabled: false,
      coverage_thresholds: defaultBands,
      permission_self_approval: 'forbidden',
      survey_anonymity_threshold: 5,
    });
    const audit = await migrateHandle.pool.query<{ detail: unknown }>(
      `select detail from core.audit_log
        where workspace_id = $1 and event_type = 'workspace_settings_updated'`,
      [WORKSPACE_ID],
    );
    expect(audit.rows).toEqual([
      {
        detail: {
          changes: { permission_self_approval: { from: 'allowed', to: 'forbidden' } },
        },
      },
    ]);
  });

  it('preserves a prior partial PATCH when updating the other field', async () => {
    const thresholdResponse = await request('PATCH', adminCookie, {
      survey_anonymity_threshold: 9,
    });
    expect(thresholdResponse.statusCode).toBe(200);

    const approvalResponse = await request('PATCH', adminCookie, {
      permission_self_approval: 'forbidden',
    });
    expect(approvalResponse.statusCode).toBe(200);

    const getResponse = await request('GET', adminCookie);
    expect(getResponse.json<SettingsBody>()).toEqual({
      voc_cluster_suggestions_enabled: false,
      coverage_thresholds: defaultBands,
      permission_self_approval: 'forbidden',
      survey_anonymity_threshold: 9,
    });
  });

  it('keeps a missing-row false policy PATCH entirely inert', async () => {
    const response = await request('PATCH', adminCookie, {
      voc_cluster_suggestions_enabled: false,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<SettingsBody>().voc_cluster_suggestions_enabled).toBe(false);
    expect(await auditCount()).toBe(0);
    expect(
      (
        await appHandle.pool.query(
          'select * from core.workspace_settings where workspace_id = $1',
          [WORKSPACE_ID],
        )
      ).rowCount,
    ).toBe(0);
  });

  it('audits boolean opt-in and disable while preserving unrelated settings and operational state', async () => {
    expect(
      (
        await request('PATCH', adminCookie, {
          permission_self_approval: 'forbidden',
          survey_anonymity_threshold: 9,
          coverage_thresholds: { 'voc-task': { good_min_percent: 80, warn_min_percent: 50 } },
        })
      ).statusCode,
    ).toBe(200);
    const system = await migrateHandle.pool.query<{ id: string }>(
      'select id from core.managed_systems where workspace_id = $1 limit 1',
      [WORKSPACE_ID],
    );
    const systemId = system.rows[0]?.id;
    if (!systemId) throw new Error('seed Managed System missing');
    try {
      await migrateHandle.pool.query(
        'insert into voc.voc_cluster_suggestion_counters (workspace_id, eligible_pending_count) values ($1, 2)',
        [WORKSPACE_ID],
      );
      await migrateHandle.pool.query(
        'insert into voc.voc_cluster_suggestion_admissions (workspace_id, primary_managed_system_id, window_start, new_admissions) values ($1, $2, $3, 3)',
        [WORKSPACE_ID, systemId, '2026-10-13T00:00:00Z'],
      );
      await migrateHandle.pool.query(
        'insert into voc.voc_cluster_suggestion_cursors (workspace_id, primary_managed_system_id, embedding_version, embedding_watermark, last_voc_id) values ($1, $2, 1, $3, $4)',
        [WORKSPACE_ID, systemId, '2026-10-13T00:00:00Z', randomUUID()],
      );
      async function operationalSnapshot() {
        return Promise.all(
          [
            'voc_cluster_suggestions',
            'voc_cluster_suggestion_counters',
            'voc_cluster_suggestion_admissions',
            'voc_cluster_suggestion_cursors',
          ].map(
            async (table) =>
              (
                await appHandle.pool.query(
                  `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) as rows
         from voc.${table} t where workspace_id = $1`,
                  [WORKSPACE_ID],
                )
              ).rows,
          ),
        );
      }
      const operationalBefore = await operationalSnapshot();
      for (const enabled of [true, false]) {
        const response = await request('PATCH', await actorCookie('admin'), {
          voc_cluster_suggestions_enabled: enabled,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json<SettingsBody>()).toEqual({
          voc_cluster_suggestions_enabled: enabled,
          permission_self_approval: 'forbidden',
          survey_anonymity_threshold: 9,
          coverage_thresholds: {
            ...defaultBands,
            'voc-task': { good_min_percent: 80, warn_min_percent: 50 },
          },
        });
        const before = await appHandle.pool.query(
          'select * from core.workspace_settings where workspace_id = $1',
          [WORKSPACE_ID],
        );
        const count = await auditCount();
        expect(
          (
            await request('PATCH', await actorCookie('admin'), {
              voc_cluster_suggestions_enabled: enabled,
            })
          ).statusCode,
        ).toBe(200);
        expect(await auditCount()).toBe(count);
        expect(
          (
            await appHandle.pool.query(
              'select * from core.workspace_settings where workspace_id = $1',
              [WORKSPACE_ID],
            )
          ).rows,
        ).toEqual(before.rows);
      }
      const audits = await migrateHandle.pool.query<{ detail: unknown }>(
        `select detail from core.audit_log where workspace_id = $1 and event_type = 'workspace_settings_updated'
       and detail->'changes' ? 'voc_cluster_suggestions_enabled' order by created_at`,
        [WORKSPACE_ID],
      );
      expect(audits.rows).toEqual([
        { detail: { changes: { voc_cluster_suggestions_enabled: { from: false, to: true } } } },
        { detail: { changes: { voc_cluster_suggestions_enabled: { from: true, to: false } } } },
      ]);
      expect(await operationalSnapshot()).toEqual(operationalBefore);
    } finally {
      for (const table of [
        'voc_cluster_suggestion_counters',
        'voc_cluster_suggestion_admissions',
        'voc_cluster_suggestion_cursors',
      ]) {
        await migrateHandle.pool.query(`delete from voc.${table} where workspace_id = $1`, [
          WORKSPACE_ID,
        ]);
      }
    }
  });

  it.each(['developer', 'user', 'denied-admin'] as const)(
    'denies suggestion opt-in for %s without row/audit side effects',
    async (persona) => {
      const cookie = await actorCookie(
        persona === 'denied-admin' ? 'admin' : persona,
        persona === 'denied-admin',
      );
      const response = await request('PATCH', cookie, { voc_cluster_suggestions_enabled: true });
      expect(response.statusCode).toBe(403);
      expect(response.json<{ code: string }>().code).toBe('permission.denied');
      expect(await auditCount()).toBe(0);
      expect(
        (
          await appHandle.pool.query(
            'select * from core.workspace_settings where workspace_id = $1',
            [WORKSPACE_ID],
          )
        ).rowCount,
      ).toBe(0);
    },
  );

  it.each([null, 'true', 1])(
    'rejects nonboolean suggestion policy %j without side effects',
    async (value) => {
      const response = await request('PATCH', adminCookie, {
        voc_cluster_suggestions_enabled: value,
      });
      expect(response.statusCode).toBe(422);
      expect(response.json<{ code: string }>().code).toBe('validation.failed');
      expect(await auditCount()).toBe(0);
      expect(
        (
          await appHandle.pool.query(
            'select * from core.workspace_settings where workspace_id = $1',
            [WORKSPACE_ID],
          )
        ).rowCount,
      ).toBe(0);
    },
  );

  it('preserves Coverage and suggestion policy through concurrent partial PATCHes', async () => {
    const [coverageCookie, policyCookie] = await Promise.all([
      actorCookie('admin'),
      actorCookie('admin'),
    ]);
    const responses = await Promise.all([
      request('PATCH', coverageCookie, {
        coverage_thresholds: { 'voc-task': { good_min_percent: 80, warn_min_percent: 50 } },
      }),
      request('PATCH', policyCookie, { voc_cluster_suggestions_enabled: true }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect((await request('GET', adminCookie)).json<SettingsBody>()).toEqual({
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 5,
      voc_cluster_suggestions_enabled: true,
      coverage_thresholds: {
        ...defaultBands,
        'voc-task': { good_min_percent: 80, warn_min_percent: 50 },
      },
    });
    expect(await auditCount()).toBe(2);
  });
});
