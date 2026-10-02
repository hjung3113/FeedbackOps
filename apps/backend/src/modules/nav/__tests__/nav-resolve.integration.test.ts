import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { navResolveResponseSchema } from '@fops/shared';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow, insertDevActor } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { seedSecondWorkspace } from '../../../test-support/seed-second-workspace.js';
import { insertTaskRequestRow, insertTaskRow } from '../../../test-support/task-fixtures.js';
import { cleanupReadTestTables, insertVocDirectly } from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = 'it-nav-resolve';

type Scenario = {
  vocId: string;
  vocDisplay: string;
  findingId: string;
  findingDisplay: string;
  requestId: string;
  requestDisplay: string;
  taskId: string;
  taskDisplay: string;
};

type EntityType = 'voc' | 'finding' | 'task_request' | 'task';

const CASES: ReadonlyArray<{
  entity_type: EntityType;
  display: (s: Scenario) => string;
  id: (s: Scenario) => string;
}> = [
  { entity_type: 'voc', display: (s) => s.vocDisplay, id: (s) => s.vocId },
  { entity_type: 'finding', display: (s) => s.findingDisplay, id: (s) => s.findingId },
  { entity_type: 'task_request', display: (s) => s.requestDisplay, id: (s) => s.requestId },
  { entity_type: 'task', display: (s) => s.taskDisplay, id: (s) => s.taskId },
];

function routeIntentFor(entityType: EntityType, id: string) {
  if (entityType === 'voc') {
    return { route: '/vocs', search: { view: 'inbox', selected: id } };
  }
  if (entityType === 'finding') {
    return { route: '/findings', search: { selected: id } };
  }
  if (entityType === 'task_request') {
    return { route: '/tasks', search: { view: 'requests', selected: id } };
  }
  return { route: '/tasks', search: { view: 'board', selected: id } };
}

describe.skipIf(!runIntegration)('GET /nav/resolve (#731)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let reporterCookie: string;
  let adminActorId: string;
  let reporterId: string;
  let foreignWorkspaceId: string;
  let foreignUserActorId: string;

  const headers = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const resolveVia = async (cookie: string, displayId: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/nav/resolve?display_id=${encodeURIComponent(displayId)}`,
      headers: headers(cookie),
    });
    return { response, body: response.json<Record<string, unknown>>() };
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    reporterCookie = await loginAs(app, 'mock-user-1');
    adminActorId = (
      await dbHandle.pool.query<{ id: string }>(
        `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
        [WORKSPACE_ID],
      )
    ).rows[0]!.id;
    reporterId = (
      await dbHandle.pool.query<{ id: string }>(
        `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
        [WORKSPACE_ID],
      )
    ).rows[0]!.id;
    const foreign = await seedSecondWorkspace(dbHandle);
    foreignWorkspaceId = foreign.workspaceId;
    foreignUserActorId = foreign.userActorId;
  });

  async function cleanupNavResolveFixtures() {
    if (!migrateHandle || !dbHandle || !foreignWorkspaceId) return;
    const msSub = `select id from core.managed_systems where workspace_id = $1 and slug like $2`;
    await migrateHandle.pool.query(
      `delete from task_request.task_requests where workspace_id = $1 and primary_managed_system_id in (${msSub})`,
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task.tasks where workspace_id = $1 and primary_managed_system_id in (${msSub})`,
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from finding.findings where workspace_id = $1 and primary_managed_system_id in (${msSub})`,
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, PREFIX);
    await dbHandle.pool.query(
      `delete from voc.vocs where workspace_id = $1 and primary_managed_system_id in (${msSub})`,
      [foreignWorkspaceId, `${PREFIX}%`],
    );
    await dbHandle.pool.query(
      `delete from core.managed_systems where workspace_id = $1 and slug like $2`,
      [foreignWorkspaceId, `${PREFIX}%`],
    );
  }

  beforeEach(cleanupNavResolveFixtures);
  afterAll(async () => {
    await cleanupNavResolveFixtures();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  /** Seeds one record per prefix on a fresh Managed System; the VOC reporter is mock-user-1. */
  async function seedScenario(): Promise<Scenario> {
    const ms = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${PREFIX}-${uid('ms')}`,
      'Nav resolve MS',
    );
    const voc = await insertVocDirectly(dbHandle, WORKSPACE_ID, ms, reporterId, 'Nav resolve VOC');
    const vocDisplay = (
      await dbHandle.pool.query<{ display_id: string }>(
        'select display_id from voc.vocs where id = $1',
        [voc.id],
      )
    ).rows[0]!.display_id;
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: ms,
      sourceId: voc.id,
      createdBy: adminActorId,
    });
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: ms,
      createdBy: adminActorId,
    });
    const request = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'finding',
      sourceId: finding.id,
      primaryManagedSystemId: ms,
      requesterActorId: adminActorId,
    });
    return {
      vocId: voc.id,
      vocDisplay,
      findingId: finding.id,
      findingDisplay: finding.display_id,
      requestId: request.id,
      requestDisplay: request.display_id,
      taskId: task.id,
      taskDisplay: task.display_id,
    };
  }

  /** Fresh dev actor with full read authority on one Managed System. */
  async function scopedDeveloperCookie(msId: string): Promise<string> {
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('scope'));
    for (const capability of ['voc.read', 'finding.read', 'finding.manage']) {
      await grantCapability(dbHandle, WORKSPACE_ID, devId, capability, msId, adminActorId);
    }
    return loginAs(app, externalId);
  }

  /** Fresh plain user with no grants who is not the seeded VOC reporter (core seed has no mock-user-2). */
  async function plainUserCookie(): Promise<string> {
    const externalId = `mock-user-plain-${uid('plain')}`;
    await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'user' });
    return loginAs(app, externalId);
  }

  async function blindDeveloperCookie(): Promise<string> {
    const { externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('blind'));
    return loginAs(app, externalId);
  }

  /**
   * Display id matching the accepted grammar that no row in any workspace
   * currently uses (verified, not assumed — counters start at 1000).
   */
  async function unusedDisplayId(prefix: 'VOC' | 'TASK', table: string): Promise<string> {
    let n = 900001;
    while (
      (
        await dbHandle.pool.query(`select 1 from ${table} where display_id = $1 limit 1`, [
          `${prefix}-${n}`,
        ])
      ).rowCount
    ) {
      n += 1;
    }
    return `${prefix}-${n}`;
  }

  it.each(CASES)('resolves a $entity_type display id for an admin', async (c) => {
    const seed = await seedScenario();

    const { response, body } = await resolveVia(adminCookie, c.display(seed));

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-cache');
    // Parses with the shared contract and carries identity + intent only.
    expect(navResolveResponseSchema.parse(body)).toEqual({
      entity_type: c.entity_type,
      id: c.id(seed),
      display_id: c.display(seed),
      route_intent: routeIntentFor(c.entity_type, c.id(seed)),
    });
  });

  it('normalises case and whitespace before resolving', async () => {
    const seed = await seedScenario();
    const noisy = ` voc-${seed.vocDisplay.slice(4)} `;

    const { response, body } = await resolveVia(adminCookie, noisy);

    expect(response.statusCode).toBe(200);
    expect(navResolveResponseSchema.parse(body)).toEqual({
      entity_type: 'voc',
      id: seed.vocId,
      display_id: seed.vocDisplay,
      route_intent: routeIntentFor('voc', seed.vocId),
    });
  });

  it.each([
    ['missing param', '/nav/resolve'],
    ['unknown key', '/nav/resolve?display_id=VOC-1&extra=1'],
    ['unknown prefix', '/nav/resolve?display_id=SRV-1'],
    ['zero counter', '/nav/resolve?display_id=VOC-0'],
    ['non-numeric counter', '/nav/resolve?display_id=VOC-abc'],
    ['empty string', '/nav/resolve?display_id='],
  ])('rejects %s with 422 invalid_display_id', async (_label, url) => {
    const response = await app.inject({ method: 'GET', url, headers: headers(adminCookie) });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      code: 'validation.failed',
      message: 'invalid display id',
      detail: { fields: [{ path: ['display_id'], code: 'invalid_display_id' }] },
    });
  });

  it('returns the identical 404 body for missing, cross-workspace, and unreadable records', async () => {
    const seed = await seedScenario();
    const missingDisplayId = await unusedDisplayId('TASK', 'task.tasks');

    // Display id that exists ONLY in the second workspace.
    const foreignOnlyDisplayId = await unusedDisplayId('VOC', 'voc.vocs');
    const foreignMs = await insertMsDirectly(
      dbHandle,
      foreignWorkspaceId,
      `${PREFIX}-foreign`,
      'Nav resolve foreign MS',
    );
    await dbHandle.pool.query(
      `insert into voc.vocs (
          workspace_id, primary_managed_system_id, reporter_id, display_id, title,
          description_rich_content, source_context, reporter_facing_status, triage_state
        )
        values (
          $1, $2, $3, $4, 'Foreign workspace VOC',
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}'::jsonb,
          'direct_use', 'received', 'untriaged'
        )`,
      [foreignWorkspaceId, foreignMs, foreignUserActorId, foreignOnlyDisplayId],
    );

    const missing = await resolveVia(adminCookie, missingDisplayId);
    const crossWorkspace = await resolveVia(adminCookie, foreignOnlyDisplayId);
    const unreadable = await resolveVia(await plainUserCookie(), seed.taskDisplay);

    expect(missing.response.statusCode).toBe(404);
    expect(crossWorkspace.response.statusCode).toBe(404);
    expect(unreadable.response.statusCode).toBe(404);
    expect(missing.body).toEqual(crossWorkspace.body);
    expect(missing.body).toEqual(unreadable.body);
    expect(missing.response.headers['cache-control']).toBe('private, no-cache');
  });

  it.each(CASES)(
    'keeps a developer with the record Managed System scope able to resolve $entity_type',
    async (c) => {
      const seed = await seedScenario();
      const msId = (
        await dbHandle.pool.query<{ id: string }>(
          `select id from core.managed_systems where workspace_id = $1 and slug like $2 limit 1`,
          [WORKSPACE_ID, `${PREFIX}%`],
        )
      ).rows[0]!.id;
      const cookie = await scopedDeveloperCookie(msId);

      const { response } = await resolveVia(cookie, c.display(seed));

      expect(response.statusCode).toBe(200);
    },
  );

  it.each(CASES)(
    'hides $entity_type display ids from a developer without the record Managed System scope',
    async (c) => {
      const seed = await seedScenario();
      const cookie = await blindDeveloperCookie();

      const { response } = await resolveVia(cookie, c.display(seed));

      expect(response.statusCode).toBe(404);
    },
  );

  it.each(CASES)(
    'hides $entity_type display ids from a plain user who is not the reporter',
    async (c) => {
      const seed = await seedScenario();

      const { response } = await resolveVia(await plainUserCookie(), c.display(seed));

      expect(response.statusCode).toBe(404);
    },
  );

  it('lets the VOC reporter resolve their own VOC without any grant', async () => {
    const seed = await seedScenario();

    const { response, body } = await resolveVia(reporterCookie, seed.vocDisplay);

    expect(response.statusCode).toBe(200);
    expect(navResolveResponseSchema.parse(body)).toEqual({
      entity_type: 'voc',
      id: seed.vocId,
      display_id: seed.vocDisplay,
      route_intent: routeIntentFor('voc', seed.vocId),
    });
  });

  it('writes no audit rows for a resolve', async () => {
    const seed = await seedScenario();
    const auditCount = () =>
      migrateHandle.pool.query<{ n: number }>('select count(*)::int as n from core.audit_log');

    const before = await auditCount();
    const { response } = await resolveVia(adminCookie, seed.vocDisplay);
    const after = await auditCount();

    expect(response.statusCode).toBe(200);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });
});
