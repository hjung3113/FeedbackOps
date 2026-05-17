// C1: second-workspace seed fixture. Reuses the production seed shape so
// cross-workspace negative tests look exactly like cross-workspace traffic
// in production. Returns enough material to issue a session cookie for the
// new workspace's admin or user.
//
// Field names mirror apps/backend/src/db/schema/core.ts (drizzle camelCase
// over snake_case DB columns):
//   - workspaces: id, name (no slug column in MVP schema).
//   - actors: externalId (not authProviderSubject), actorType (not kind);
//     role_level CHECK vocabulary is ('admin','developer','user').
//
// Idempotent via onConflictDoNothing on the PK / unique index used by the
// production seed so repeat calls within a single test DB are safe.

import { and, eq } from 'drizzle-orm';

import type { DbHandle } from '../db/client.js';
import { actors, workspaces } from '../db/schema/core.js';

export interface SecondWorkspaceSeed {
  workspaceId: string;
  adminActorId: string;
  userActorId: string;
}

export async function seedSecondWorkspace(handle: DbHandle): Promise<SecondWorkspaceSeed> {
  const workspaceId = '22222222-2222-2222-2222-222222222222';
  const adminActorId = '22222222-aaaa-aaaa-aaaa-222222222222';
  const userActorId = '22222222-bbbb-bbbb-bbbb-222222222222';

  const { db } = handle;

  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: 'Workspace Two' })
    .onConflictDoNothing({ target: workspaces.id });

  for (const a of [
    {
      id: adminActorId,
      externalId: 'mock-admin-2',
      email: 'admin-2@feedbackops.local',
      displayName: 'Mock Admin 2',
      roleLevel: 'admin',
      actorType: 'internal_member',
    },
    {
      id: userActorId,
      externalId: 'mock-user-2',
      email: 'user-2@feedbackops.local',
      displayName: 'Mock User 2',
      roleLevel: 'user',
      actorType: 'internal_member',
    },
  ] as const) {
    await db
      .insert(actors)
      .values({
        id: a.id,
        workspaceId,
        externalId: a.externalId,
        email: a.email,
        displayName: a.displayName,
        roleLevel: a.roleLevel,
        actorType: a.actorType,
      })
      .onConflictDoNothing({ target: [actors.workspaceId, actors.externalId] });
  }

  // Resolve the actor ids by (workspace_id, external_id) rather than trusting
  // the named UUIDs above so a prior partial seed (different id at same
  // external_id) still yields a correct return value.
  const adminRows = await db
    .select({ id: actors.id })
    .from(actors)
    .where(and(eq(actors.workspaceId, workspaceId), eq(actors.externalId, 'mock-admin-2')));
  const userRows = await db
    .select({ id: actors.id })
    .from(actors)
    .where(and(eq(actors.workspaceId, workspaceId), eq(actors.externalId, 'mock-user-2')));

  const resolvedAdminId = adminRows[0]?.id;
  const resolvedUserId = userRows[0]?.id;
  if (!resolvedAdminId || !resolvedUserId) {
    throw new Error('seedSecondWorkspace: expected admin/user actors to exist after upsert.');
  }

  return {
    workspaceId,
    adminActorId: resolvedAdminId,
    userActorId: resolvedUserId,
  };
}
