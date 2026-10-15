import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { cleanupTestActorsByExternalIdPrefix } from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = 'it-1170b-tri';

describe.skipIf(!runIntegration)('GET /vocs?view=triage requests the missing read (#1170b)', () => {
  let handle: DbHandle;
  let app: FastifyInstance;
  let admin: string;
  let developer: string;
  let msA: string;
  let msB: string;
  let devCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    handle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: handle });
    await app.ready();
    admin = (
      await insertActorRow(handle, {
        workspaceId: WORKSPACE_ID,
        externalId: `${PREFIX}-admin`,
        roleLevel: 'admin',
      })
    ).id;
    developer = (
      await insertActorRow(handle, {
        workspaceId: WORKSPACE_ID,
        externalId: `${PREFIX}-developer`,
        roleLevel: 'developer',
      })
    ).id;
    msA = await insertMsDirectly(handle, WORKSPACE_ID, `${PREFIX}-a`, '1170b triage A');
    msB = await insertMsDirectly(handle, WORKSPACE_ID, `${PREFIX}-b`, '1170b triage B');
    devCookie = await loginAs(app, `${PREFIX}-developer`);
  });

  beforeEach(async () => {
    await handle.pool.query(
      'delete from permission.permission_grants where actor_id = any($1::uuid[])',
      [[developer]],
    );
    await handle.pool.query('delete from core.rate_limits where key = any($1::text[])', [
      [`${WORKSPACE_ID}:${admin}`, `${WORKSPACE_ID}:${developer}`],
    ]);
  });

  afterAll(async () => {
    await handle.pool.query(
      'delete from permission.permission_grants where actor_id = any($1::uuid[])',
      [[developer, admin]],
    );
    await handle.pool.query(
      'delete from permission.permission_denies where actor_id = any($1::uuid[])',
      [[developer, admin]],
    );
    await handle.pool.query('delete from core.rate_limits where key = any($1::text[])', [
      [`${WORKSPACE_ID}:${admin}`, `${WORKSPACE_ID}:${developer}`],
    ]);
    await cleanupTestActorsByExternalIdPrefix(handle, WORKSPACE_ID, PREFIX);
    await deleteRecoveryFixtureParents(
      handle,
      'delete from core.managed_systems where id = any($1::uuid[])',
      [[msA, msB]],
    );
    await app.close();
    await handle.close();
  });

  async function grant(capability: 'voc.read' | 'voc.triage', system: 'A' | 'B') {
    await grantCapability(
      handle,
      WORKSPACE_ID,
      developer,
      capability,
      system === 'A' ? msA : msB,
      admin,
    );
  }

  it.each([
    {
      name: 'triage on MS-A and no read, no System',
      grants: [['voc.triage', 'A']] as const,
      path: '/vocs?view=triage',
      code: 'permission.denied',
      permission: 'voc.read',
      system: 'A',
    },
    {
      name: 'triage on A and B and no read, no System',
      grants: [
        ['voc.triage', 'A'],
        ['voc.triage', 'B'],
      ] as const,
      path: '/vocs?view=triage',
      code: 'permission.denied',
      permission: 'voc.read',
      system: null,
    },
    {
      name: 'triage on MS-A and no read, MS-A selected',
      grants: [['voc.triage', 'A']] as const,
      path: 'selected-a',
      code: 'permission.denied',
      permission: 'voc.read',
      system: 'A',
    },
    {
      name: 'triage on A and B, read only on B, select A',
      grants: [
        ['voc.triage', 'A'],
        ['voc.triage', 'B'],
        ['voc.read', 'B'],
      ] as const,
      path: 'selected-a',
      code: 'permission.scope_required',
      permission: 'voc.read',
      system: 'A',
    },
    {
      name: 'selection lacking triage',
      grants: [
        ['voc.triage', 'B'],
        ['voc.read', 'B'],
      ] as const,
      path: 'selected-a',
      code: 'permission.scope_required',
      permission: 'voc.triage',
      system: 'A',
    },
    {
      name: 'no triage anywhere',
      grants: [] as const,
      path: '/vocs?view=triage',
      code: 'permission.denied',
      permission: 'voc.triage',
      system: null,
    },
  ])('$name → $code $permission', async ({ grants, path, code, permission, system }) => {
    for (const [capability, managedSystem] of grants) {
      await grant(capability, managedSystem);
    }
    const url = path === 'selected-a' ? `/vocs?view=triage&managed_system_id=${msA}` : path;
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code,
      requestable_permission: {
        permission,
        managed_system_id: system === 'A' ? msA : null,
      },
    });
  });
});
