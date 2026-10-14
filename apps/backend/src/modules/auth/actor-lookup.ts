// Workspace-scoped actor-by-id lookup (#514 A7).
//
// Auth owns the actor identity surface (see list-actors-routes.ts header), so
// the core.actors SELECT lives here. Modules that validate a workspace-scoped
// actor id import through '../auth/index.js' — never a repo, and never their
// own copy of the SQL.

import { type SQL, and, eq, inArray, sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { actors } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';

export interface WorkspaceActor {
  id: string;
  role_level: 'admin' | 'developer' | 'user';
  actor_type: 'internal_member' | 'system';
}

export async function findWorkspaceActor(
  db: Db | Tx,
  input: { workspaceId: string; actorId: string },
): Promise<WorkspaceActor | null> {
  const rows = await db
    .select({ id: actors.id, role_level: actors.roleLevel, actor_type: actors.actorType })
    .from(actors)
    .where(and(eq(actors.workspaceId, input.workspaceId), eq(actors.id, input.actorId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.role_level !== 'admin' && row.role_level !== 'developer' && row.role_level !== 'user') {
    throw new Error(`unexpected role_level for actor ${row.id}: ${row.role_level}`);
  }
  if (row.actor_type !== 'internal_member' && row.actor_type !== 'system') {
    throw new Error(`unexpected actor_type for actor ${row.id}: ${row.actor_type}`);
  }
  return { id: row.id, role_level: row.role_level, actor_type: row.actor_type };
}

export async function listWorkspaceAdminActorIds(tx: Tx, workspaceId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: actors.id })
    .from(actors)
    .where(and(eq(actors.workspaceId, workspaceId), eq(actors.roleLevel, 'admin')));
  return rows.map((row) => row.id);
}

export async function findWorkspaceActorIds(
  tx: Tx,
  workspaceId: string,
  actorIds: readonly string[],
): Promise<Set<string>> {
  if (actorIds.length === 0) return new Set();

  const rows = await tx
    .select({ id: actors.id })
    .from(actors)
    .where(and(eq(actors.workspaceId, workspaceId), inArray(actors.id, [...actorIds])));
  return new Set(rows.map((row) => row.id));
}

/** Workspace-filtered recipient lock. Call before request/policy/grant locks. */
export async function lockWorkspaceActor(
  tx: Tx,
  input: { workspaceId: string; actorId: string },
): Promise<(WorkspaceActor & { actor_type: string }) | null> {
  const rows = await tx
    .select({ id: actors.id, role_level: actors.roleLevel, actor_type: actors.actorType })
    .from(actors)
    .where(and(eq(actors.workspaceId, input.workspaceId), eq(actors.id, input.actorId)))
    .for('update');
  const row = rows[0];
  if (!row) return null;
  if (row.role_level !== 'admin' && row.role_level !== 'developer' && row.role_level !== 'user') {
    throw new Error(`unexpected role_level for actor ${row.id}: ${row.role_level}`);
  }
  if (row.actor_type !== 'internal_member' && row.actor_type !== 'system') {
    throw new Error(`unexpected actor_type for actor ${row.id}: ${row.actor_type}`);
  }
  return { id: row.id, role_level: row.role_level, actor_type: row.actor_type };
}

/** Selected review identity projection. Never exposes the Actor email or Actor type. */
export async function findWorkspaceActorDisplay(
  db: Db | Tx,
  input: { workspaceId: string; actorId: string },
): Promise<(Omit<WorkspaceActor, 'actor_type'> & { display_name: string }) | null> {
  const rows = await db
    .select({
      id: actors.id,
      role_level: actors.roleLevel,
      actor_type: actors.actorType,
      display_name: actors.displayName,
    })
    .from(actors)
    .where(and(eq(actors.workspaceId, input.workspaceId), eq(actors.id, input.actorId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.role_level !== 'admin' && row.role_level !== 'developer' && row.role_level !== 'user') {
    throw new Error('unexpected requester Role Level');
  }
  if (row.actor_type !== 'internal_member' && row.actor_type !== 'system') {
    throw new Error(`unexpected actor_type for actor ${row.id}: ${row.actor_type}`);
  }
  // Callers place this projection in strict DTOs: keep it to the shipped identity fields.
  return { id: row.id, role_level: row.role_level, display_name: row.display_name };
}

/** Bounded display-only SQL for authorized projections; caller owns disclosure gating. */
export function workspaceActorDisplayNameSql(workspaceId: SQL, actorId: SQL): SQL {
  return sql`(SELECT requester.display_name FROM core.actors requester
    WHERE requester.workspace_id = ${workspaceId} AND requester.id = ${actorId} LIMIT 1)`;
}
