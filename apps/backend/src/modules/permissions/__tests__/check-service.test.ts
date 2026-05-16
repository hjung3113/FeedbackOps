// Check service tests for issue #4 acceptance criteria.
//
// Run against the dev Postgres in the same pattern as
// db/__tests__/role-grants.integration.test.ts: when DATABASE_URL +
// WORKSPACE_ID are set, the suite executes against the seeded workspace
// (mock-admin-1, mock-user-1, system). On bare developer machines it skips.

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { actors } from '../../../db/schema/core.js';
import { permissionDenies, permissionGrants } from '../../../db/schema/permission.js';
import { type ActorContext, createCheckService } from '../check-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('checkCapability', () => {
  let handle: DbHandle;
  let svc: ReturnType<typeof createCheckService>;
  let adminActor: ActorContext;
  let userActor: ActorContext;
  // A temp actor we create at suite start so direct-grant / expired /
  // revoked branches exercise a non-seeded row (the seeded user has role
  // 'user' which implicitly satisfies workspace.read via role — we need a
  // capability where role alone does NOT satisfy to test direct_grant).
  let tempActorId: string;
  const tempExternalId = `test-permcheck-${randomUUID()}`;

  beforeAll(async () => {
    handle = createDb(APP_URL);
    svc = createCheckService({ db: handle.db });

    const adminRows = await handle.db
      .select({ id: actors.id, roleLevel: actors.roleLevel })
      .from(actors)
      .where(and(eq(actors.workspaceId, WORKSPACE_ID), eq(actors.externalId, 'mock-admin-1')))
      .limit(1);
    const userRows = await handle.db
      .select({ id: actors.id, roleLevel: actors.roleLevel })
      .from(actors)
      .where(and(eq(actors.workspaceId, WORKSPACE_ID), eq(actors.externalId, 'mock-user-1')))
      .limit(1);

    if (!adminRows[0] || !userRows[0]) {
      throw new Error('Seed missing: run `pnpm --filter @fops/backend db:seed`.');
    }
    adminActor = {
      actor_id: adminRows[0].id,
      workspace_id: WORKSPACE_ID,
      role_level: adminRows[0].roleLevel,
    };
    userActor = {
      actor_id: userRows[0].id,
      workspace_id: WORKSPACE_ID,
      role_level: userRows[0].roleLevel,
    };

    const inserted = await handle.db
      .insert(actors)
      .values({
        workspaceId: WORKSPACE_ID,
        externalId: tempExternalId,
        email: `${tempExternalId}@feedbackops.local`,
        displayName: 'Permcheck Test User',
        roleLevel: 'user',
        actorType: 'internal_member',
      })
      .returning({ id: actors.id });
    const row = inserted[0];
    if (!row) throw new Error('failed to insert temp actor');
    tempActorId = row.id;
  });

  afterEach(async () => {
    // Drop any rows planted in permission_grants / permission_denies for the
    // temp actor between tests so each case starts clean.
    await handle.pool.query('delete from permission.permission_grants where actor_id = $1', [
      tempActorId,
    ]);
    await handle.pool.query('delete from permission.permission_denies where actor_id = $1', [
      tempActorId,
    ]);
    await handle.pool.query('delete from permission.permission_denies where actor_id = $1', [
      userActor.actor_id,
    ]);
  });

  afterAll(async () => {
    await handle.pool.query('delete from permission.permission_grants where actor_id = $1', [
      tempActorId,
    ]);
    await handle.pool.query('delete from permission.permission_denies where actor_id = $1', [
      tempActorId,
    ]);
    await handle.pool.query('delete from core.actors where id = $1', [tempActorId]);
    await handle?.close();
  });

  it('admin allow on workspace.admin via role', async () => {
    const d = await svc.checkCapability(adminActor, 'workspace.admin', {
      workspace_id: WORKSPACE_ID,
    });
    expect(d).toEqual({ allow: true, via: 'role' });
  });

  it('admin allow on workspace.read via role', async () => {
    const d = await svc.checkCapability(adminActor, 'workspace.read', {
      workspace_id: WORKSPACE_ID,
    });
    expect(d).toEqual({ allow: true, via: 'role' });
  });

  it('user allow on workspace.read via role', async () => {
    const d = await svc.checkCapability(userActor, 'workspace.read', {
      workspace_id: WORKSPACE_ID,
    });
    expect(d).toEqual({ allow: true, via: 'role' });
  });

  it('user deny on workspace.admin → no_grant with requestable', async () => {
    const d = await svc.checkCapability(userActor, 'workspace.admin', {
      workspace_id: WORKSPACE_ID,
    });
    expect(d.allow).toBe(false);
    if (d.allow) return;
    expect(d.reason).toBe('no_grant');
    expect(d.requestable).toEqual([{ workspace_id: WORKSPACE_ID }]);
  });

  it('workspace_mismatch when actor is bound to a different workspace', async () => {
    const foreign: ActorContext = {
      actor_id: userActor.actor_id,
      workspace_id: '99999999-9999-9999-9999-999999999999',
      role_level: 'user',
    };
    const d = await svc.checkCapability(foreign, 'workspace.read', {
      workspace_id: WORKSPACE_ID,
    });
    expect(d).toEqual({
      allow: false,
      reason: 'workspace_mismatch',
      requestable: null,
    });
  });

  it('explicit deny → explicit_deny, requestable null', async () => {
    // Plant an active deny row for the user on workspace.read (which they
    // would otherwise satisfy via role). Explicit deny overrides allow per
    // 05-policy:33.
    await handle.db.insert(permissionDenies).values({
      workspaceId: WORKSPACE_ID,
      actorId: userActor.actor_id,
      capability: 'workspace.read',
      reason: 'test',
      createdByActorId: adminActor.actor_id,
    });
    const d = await svc.checkCapability(userActor, 'workspace.read', {
      workspace_id: WORKSPACE_ID,
    });
    expect(d).toEqual({
      allow: false,
      reason: 'explicit_deny',
      requestable: null,
    });
  });

  it('direct grant on a non-role-derived capability returns via direct_grant', async () => {
    const tempActor: ActorContext = {
      actor_id: tempActorId,
      workspace_id: WORKSPACE_ID,
      role_level: 'user',
    };
    const inserted = await handle.db
      .insert(permissionGrants)
      .values({
        workspaceId: WORKSPACE_ID,
        actorId: tempActorId,
        capability: 'workspace.admin',
        grantedByActorId: adminActor.actor_id,
      })
      .returning({ id: permissionGrants.id });
    const d = await svc.checkCapability(tempActor, 'workspace.admin', {
      workspace_id: WORKSPACE_ID,
    });
    expect(d).toEqual({ allow: true, via: 'direct_grant', grant_id: inserted[0]?.id });
  });

  it('grant expired → grant_expired', async () => {
    const tempActor: ActorContext = {
      actor_id: tempActorId,
      workspace_id: WORKSPACE_ID,
      role_level: 'user',
    };
    await handle.db.insert(permissionGrants).values({
      workspaceId: WORKSPACE_ID,
      actorId: tempActorId,
      capability: 'workspace.admin',
      grantedByActorId: adminActor.actor_id,
      expiresAt: sql`now() - interval '1 second'`,
    });
    const d = await svc.checkCapability(tempActor, 'workspace.admin', {
      workspace_id: WORKSPACE_ID,
    });
    expect(d).toEqual({
      allow: false,
      reason: 'grant_expired',
      requestable: null,
    });
  });

  it('grant revoked → grant_revoked', async () => {
    const tempActor: ActorContext = {
      actor_id: tempActorId,
      workspace_id: WORKSPACE_ID,
      role_level: 'user',
    };
    await handle.db.insert(permissionGrants).values({
      workspaceId: WORKSPACE_ID,
      actorId: tempActorId,
      capability: 'workspace.admin',
      grantedByActorId: adminActor.actor_id,
      revokedAt: sql`now()`,
      revokedByActorId: adminActor.actor_id,
    });
    const d = await svc.checkCapability(tempActor, 'workspace.admin', {
      workspace_id: WORKSPACE_ID,
    });
    expect(d).toEqual({
      allow: false,
      reason: 'grant_revoked',
      requestable: null,
    });
  });
});
