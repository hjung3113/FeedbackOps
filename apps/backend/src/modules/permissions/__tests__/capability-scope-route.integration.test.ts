import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { createCheckService } from '../check-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const A = '21500000-0000-4000-8000-000000000001';
const B = '21500000-0000-4000-8000-000000000002';
const C = '21500000-0000-4000-8000-000000000003';
const ACTORS = {
  admin: {
    id: '21500000-0000-4000-8000-000000000011',
    external: 'scope-215-admin',
    role: 'admin',
  },
  developer: {
    id: '21500000-0000-4000-8000-000000000012',
    external: 'scope-215-developer',
    role: 'developer',
  },
  wide: {
    id: '21500000-0000-4000-8000-000000000013',
    external: 'scope-215-wide',
    role: 'developer',
  },
  wideDeny: {
    id: '21500000-0000-4000-8000-000000000014',
    external: 'scope-215-wide-deny',
    role: 'developer',
  },
  denied: {
    id: '21500000-0000-4000-8000-000000000015',
    external: 'scope-215-denied',
    role: 'admin',
  },
  inactive: {
    id: '21500000-0000-4000-8000-000000000016',
    external: 'scope-215-inactive',
    role: 'developer',
  },
} as const;

function cookie(setCookie: string | string[] | undefined): string {
  const value = (Array.isArray(setCookie) ? setCookie : [setCookie])
    .find(Boolean)
    ?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
  if (!value) throw new Error('mock-login did not return a session');
  return value;
}

describe.skipIf(!runIntegration)('GET /me/permissions/scope', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let migratePool: Pool;
  const ids = Object.values(ACTORS).map((actor) => actor.id);
  const login = async (external: string) =>
    cookie(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/mock-login',
          headers: { 'user-agent': 'scope-215' },
          payload: { external_id: external },
        })
      ).headers['set-cookie'],
    );
  const scope = async (external: string) =>
    (
      await app.inject({
        method: 'GET',
        url: '/me/permissions/scope?capability=voc.read',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${await login(external)}` },
      })
    ).json().scope as { kind: 'all' } | { kind: 'scoped'; managed_system_ids: string[] };
  const grant = async (actorId: string, managedSystemId: string | null, extra = '') =>
    dbHandle.pool.query(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id, ${extra || 'granted_at'}) values ($1,$2,'voc.read',$3,$4${extra ? ", now() - interval '1 day'" : ', now()'})`,
      [WORKSPACE_ID, actorId, managedSystemId, ACTORS.admin.id],
    );

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migratePool = new Pool({ connectionString: MIGRATE_URL });
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    for (const actor of Object.values(ACTORS))
      await dbHandle.pool.query(
        'insert into core.actors (id, workspace_id, external_id, email, display_name, role_level) values ($1,$2,$3,$4,$3,$5)',
        [actor.id, WORKSPACE_ID, actor.external, `${actor.external}@test.invalid`, actor.role],
      );
    for (const [id, slug] of [
      [A, 'scope-215-a'],
      [B, 'scope-215-b'],
      [C, 'scope-215-c'],
    ] as const)
      await dbHandle.pool.query(
        'insert into core.managed_systems (id, workspace_id, slug, name) values ($1,$2,$3,$3)',
        [id, WORKSPACE_ID, slug],
      );
  });
  beforeEach(async () => {
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'scope-215'`,
    );
    await dbHandle.pool.query(
      'delete from permission.permission_denies where actor_id = any($1::uuid[])',
      [ids],
    );
    await dbHandle.pool.query(
      'delete from permission.permission_grants where actor_id = any($1::uuid[])',
      [ids],
    );
  });
  afterAll(async () => {
    await dbHandle.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [ids]);
    await dbHandle.pool.query(
      'delete from permission.permission_denies where actor_id = any($1::uuid[])',
      [ids],
    );
    await dbHandle.pool.query(
      'delete from permission.permission_grants where actor_id = any($1::uuid[])',
      [ids],
    );
    await migratePool.query('delete from core.audit_log where actor_id = any($1::uuid[])', [ids]);
    await dbHandle.pool.query('delete from core.managed_systems where id = any($1::uuid[])', [
      [A, B, C],
    ]);
    await dbHandle.pool.query('delete from core.actors where id = any($1::uuid[])', [ids]);
    await app.close();
    await dbHandle.close();
    await migratePool.end();
  });

  it('returns all for an admin without enumerating managed systems', async () => {
    expect(await scope(ACTORS.admin.external)).toEqual({ kind: 'all' });
  });
  it('returns the developer grant id and excludes sibling ids before checking count', async () => {
    await grant(ACTORS.developer.id, A);
    const result = await scope(ACTORS.developer.external);
    expect(result).toMatchObject({ kind: 'scoped' });
    if (result.kind === 'scoped') {
      expect(result.managed_system_ids).toContain(A);
      expect(result.managed_system_ids).not.toContain(B);
      expect(result.managed_system_ids).not.toContain(C);
      expect(result.managed_system_ids).toHaveLength(1);
    }
  });
  it('returns all for a workspace grant but enumerates around an MS deny', async () => {
    await grant(ACTORS.wide.id, null);
    expect(await scope(ACTORS.wide.external)).toEqual({ kind: 'all' });
    await grant(ACTORS.wideDeny.id, null);
    await dbHandle.pool.query(
      `insert into permission.permission_denies (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id) values ($1,$2,'voc.read',$3,'test',$4)`,
      [WORKSPACE_ID, ACTORS.wideDeny.id, B, ACTORS.admin.id],
    );
    const result = await scope(ACTORS.wideDeny.external);
    if (result.kind !== 'scoped') throw new Error('expected scoped');
    expect(result.managed_system_ids).toContain(A);
    expect(result.managed_system_ids).toContain(C);
    expect(result.managed_system_ids).not.toContain(B);
    const workspaceManagedSystemIds = new Set(
      (
        await dbHandle.pool.query('select id from core.managed_systems where workspace_id = $1', [
          WORKSPACE_ID,
        ])
      ).rows.map((row) => row.id as string),
    );
    workspaceManagedSystemIds.delete(B);
    const returnedIds = new Set(result.managed_system_ids);
    const unexpectedIds = [...returnedIds].filter((id) => !workspaceManagedSystemIds.has(id));
    const missingIds = [...workspaceManagedSystemIds].filter((id) => !returnedIds.has(id));
    expect(unexpectedIds, `unexpected managed system ids: ${unexpectedIds.join(', ')}`).toEqual([]);
    expect(missingIds, `missing managed system ids: ${missingIds.join(', ')}`).toEqual([]);
  });
  it('returns no ids for a workspace deny and ignores revoked or expired grants', async () => {
    await grant(ACTORS.denied.id, null);
    await dbHandle.pool.query(
      `insert into permission.permission_denies (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id) values ($1,$2,'voc.read',null,'test',$3)`,
      [WORKSPACE_ID, ACTORS.denied.id, ACTORS.admin.id],
    );
    expect(
      await scope(ACTORS.denied.external),
      'workspace-wide deny overrides general allow',
    ).toEqual({
      kind: 'scoped',
      managed_system_ids: [],
    });
    await dbHandle.pool.query(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id, revoked_at) values ($1,$2,'voc.read',$3,$4,now())`,
      [WORKSPACE_ID, ACTORS.inactive.id, A, ACTORS.admin.id],
    );
    await dbHandle.pool.query(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id, expires_at) values ($1,$2,'voc.read',$3,$4,now() - interval '1 second')`,
      [WORKSPACE_ID, ACTORS.inactive.id, B, ACTORS.admin.id],
    );
    expect(await scope(ACTORS.inactive.external)).toEqual({
      kind: 'scoped',
      managed_system_ids: [],
    });
  });
  it('matches checkCapability for every actor and managed system pair', async () => {
    await grant(ACTORS.developer.id, A);
    await grant(ACTORS.wide.id, null);
    await grant(ACTORS.wideDeny.id, null);
    await dbHandle.pool.query(
      `insert into permission.permission_denies (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id) values ($1,$2,'voc.read',$3,'test',$4)`,
      [WORKSPACE_ID, ACTORS.wideDeny.id, B, ACTORS.admin.id],
    );
    await dbHandle.pool.query(
      `insert into permission.permission_denies (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id) values ($1,$2,'voc.read',null,'test',$3)`,
      [WORKSPACE_ID, ACTORS.denied.id, ACTORS.admin.id],
    );
    await grant(ACTORS.denied.id, null);
    const check = createCheckService({ db: dbHandle.db });
    for (const actor of Object.values(ACTORS)) {
      const result = await scope(actor.external);
      const idsInScope =
        result.kind === 'all' ? new Set([A, B, C]) : new Set(result.managed_system_ids);
      for (const managedSystemId of [A, B, C])
        expect(idsInScope.has(managedSystemId), `${actor.external} ${managedSystemId}`).toBe(
          (
            await check.checkCapability(
              {
                actor_id: actor.id,
                workspace_id: WORKSPACE_ID,
                role_level: actor.role,
              },
              'voc.read',
              {
                workspace_id: WORKSPACE_ID,
                managed_system_id: managedSystemId,
              },
            )
          ).allow,
        );
    }
  });
  it('returns the check validation envelope for unknown capability and 401 without a session', async () => {
    const authorized = await app.inject({
      method: 'GET',
      url: '/me/permissions/scope?capability=nope',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${await login(ACTORS.admin.external)}`,
      },
    });
    expect(authorized.statusCode).toBe(422);
    expect(authorized.json().code).toBe('validation.unknown_capability');
    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/me/permissions/scope?capability=voc.read',
    });
    expect(unauthenticated.statusCode).toBe(401);
  });
});
