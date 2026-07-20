import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../voc/__tests__/_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const BASIC_EXTERNAL_ID = `it-workspace-settings-user-${randomUUID().slice(0, 8)}`;

interface SettingsBody {
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
  });

  afterAll(async () => {
    await cleanupFixtures();
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
    const result = await appHandle.pool.query<{ count: string }>(
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
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 5,
    });
    const row = await appHandle.pool.query('select * from core.workspace_settings where workspace_id = $1', [
      WORKSPACE_ID,
    ]);
    expect(row.rowCount).toBe(0);
  });

  it('denies non-admin GET and PATCH without creating a row', async () => {
    const getResponse = await request('GET', basicCookie);
    const patchResponse = await request('PATCH', basicCookie, { survey_anonymity_threshold: 7 });

    expect(getResponse.statusCode).toBe(403);
    expect(getResponse.json<{ code: string }>().code).toBe('permission.denied');
    expect(patchResponse.statusCode).toBe(403);
    expect(patchResponse.json<{ code: string }>().code).toBe('permission.denied');
    const row = await appHandle.pool.query('select * from core.workspace_settings where workspace_id = $1', [
      WORKSPACE_ID,
    ]);
    expect(row.rowCount).toBe(0);
  });

  it('patches the threshold, resolves it on GET, and audits only that field', async () => {
    const patchResponse = await request('PATCH', adminCookie, { survey_anonymity_threshold: 7 });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json<SettingsBody>()).toEqual({
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 7,
    });
    const getResponse = await request('GET', adminCookie);
    expect(getResponse.json<SettingsBody>()).toEqual({
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 7,
    });
    const audit = await appHandle.pool.query<{ event_type: string; detail: unknown }>(
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
    const row = await appHandle.pool.query('select * from core.workspace_settings where workspace_id = $1', [
      WORKSPACE_ID,
    ]);
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
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 5,
    });
    const row = await appHandle.pool.query('select * from core.workspace_settings where workspace_id = $1', [
      WORKSPACE_ID,
    ]);
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
    const getResponse = await request('GET', adminCookie);
    expect(getResponse.json<SettingsBody>()).toEqual({
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 5,
    });
  });

  it('does not append an audit event for an effective no-op PATCH', async () => {
    const initial = await request('PATCH', adminCookie, { survey_anonymity_threshold: 7 });
    expect(initial.statusCode).toBe(200);
    const before = await auditCount();

    const response = await request('PATCH', adminCookie, { survey_anonymity_threshold: 7 });

    expect(response.statusCode).toBe(200);
    expect(response.json<SettingsBody>()).toEqual({
      permission_self_approval: 'allowed',
      survey_anonymity_threshold: 7,
    });
    expect(await auditCount()).toBe(before);
  });

  it('persists permission self-approval and records its exact audit change', async () => {
    const patchResponse = await request('PATCH', adminCookie, {
      permission_self_approval: 'forbidden',
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json<SettingsBody>()).toEqual({
      permission_self_approval: 'forbidden',
      survey_anonymity_threshold: 5,
    });
    const getResponse = await request('GET', adminCookie);
    expect(getResponse.json<SettingsBody>()).toEqual({
      permission_self_approval: 'forbidden',
      survey_anonymity_threshold: 5,
    });
    const audit = await appHandle.pool.query<{ detail: unknown }>(
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
      permission_self_approval: 'forbidden',
      survey_anonymity_threshold: 9,
    });
  });
});
