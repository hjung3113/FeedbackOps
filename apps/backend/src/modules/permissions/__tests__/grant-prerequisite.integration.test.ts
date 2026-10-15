import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import {
  denyCapability,
  expireCapabilityGrant,
  grantCapability,
} from '../../../test-support/permissions-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { cleanupTestActorsByExternalIdPrefix } from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = 'it-1170b-opt';

type GrantCandidate = {
  capability: string;
  managed_system_id: string | null;
  prerequisites?: Array<{
    capability: string;
    managed_system_id: string | null;
    state: string;
  }>;
};

describe.skipIf(!runIntegration)(
  'GET /permissions/grant-options voc.read prerequisites (#1170b)',
  () => {
    let handle: DbHandle;
    let app: FastifyInstance;
    let admin: string;
    let developer: string;
    let msA: string;
    let adminCookie: string;

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
      msA = await insertMsDirectly(handle, WORKSPACE_ID, `${PREFIX}-a`, '1170b A');
      adminCookie = await loginAs(app, `${PREFIX}-admin`);
    });

    beforeEach(async () => {
      await handle.pool.query(
        'delete from permission.permission_denies where actor_id = any($1::uuid[])',
        [[developer]],
      );
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
        'delete from permission.permission_denies where actor_id = any($1::uuid[])',
        [[developer, admin]],
      );
      await handle.pool.query(
        'delete from permission.permission_grants where actor_id = any($1::uuid[])',
        [[developer, admin]],
      );
      await handle.pool.query('delete from core.rate_limits where key = any($1::text[])', [
        [`${WORKSPACE_ID}:${admin}`, `${WORKSPACE_ID}:${developer}`],
      ]);
      await cleanupTestActorsByExternalIdPrefix(handle, WORKSPACE_ID, PREFIX);
      await deleteRecoveryFixtureParents(
        handle,
        'delete from core.managed_systems where id = any($1::uuid[])',
        [[msA]],
      );
      await app.close();
      await handle.close();
    });

    async function options(): Promise<{ candidates: GrantCandidate[] }> {
      const response = await app.inject({
        method: 'GET',
        url: `/permissions/grant-options?actor_id=${developer}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      });
      expect(response.statusCode).toBe(200);
      return response.json();
    }

    function triageOnA(body: { candidates: GrantCandidate[] }): GrantCandidate {
      const candidate = body.candidates.find(
        (item) => item.capability === 'voc.triage' && item.managed_system_id === msA,
      );
      if (!candidate) throw new Error('voc.triage · MS-A candidate missing');
      return candidate;
    }

    it.each([
      ['missing', 'none'],
      ['held', 'grant'],
      ['denied', 'deny'],
      ['missing', 'expired'],
    ] as const)(
      'voc.triage · MS-A prerequisite is %s when voc.read is %s',
      async (state, setup) => {
        if (setup === 'grant' || setup === 'expired') {
          const grantId = await grantCapability(
            handle,
            WORKSPACE_ID,
            developer,
            'voc.read',
            msA,
            admin,
          );
          if (setup === 'expired') await expireCapabilityGrant(handle, grantId);
        }
        if (setup === 'deny') {
          await denyCapability(handle, WORKSPACE_ID, developer, 'voc.read', msA, admin);
        }
        expect(triageOnA(await options()).prerequisites).toEqual([
          { capability: 'voc.read', managed_system_id: msA, state },
        ]);
      },
    );

    it('omits prerequisites on every non-triage candidate', async () => {
      const body = await options();
      const others = body.candidates.filter((candidate) => candidate.capability !== 'voc.triage');
      expect(others.length).toBeGreaterThan(0);
      for (const candidate of others) {
        expect(candidate).not.toHaveProperty('prerequisites');
      }
      expect(triageOnA(body).prerequisites).toEqual([
        { capability: 'voc.read', managed_system_id: msA, state: 'missing' },
      ]);
    });
  },
);
