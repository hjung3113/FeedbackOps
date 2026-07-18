import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import type { CheckService, Decision } from '../permissions/check-service.js';
import {
  type Scope,
  type ScopeActorContext,
  actorScopeForCapability,
} from '../permissions/scope-service.js';

/**
 * Canonical Finding authorization boundary.
 *
 * Finding owns the meaning of its read and manage capabilities; other modules
 * must consume these helpers instead of rebuilding a capability predicate.
 */
export type FindingAuthorizationActor = ScopeActorContext;

export async function actorFindingReadScope(
  db: Db | Tx,
  actor: FindingAuthorizationActor,
): Promise<Scope> {
  return actorScopeForCapability(db, actor, 'finding.read');
}

export function isFindingInReadScope(scope: Scope, managedSystemId: string): boolean {
  return scope.kind === 'all' || scope.managedSystemIds.includes(managedSystemId);
}

export async function checkFindingManage(
  checkService: CheckService,
  actor: FindingAuthorizationActor,
  managedSystemId: string,
  options?: Parameters<CheckService['checkCapability']>[3],
): Promise<Decision> {
  // Preserve the workspace-admin bypass before delegating scoped decisions to
  // Permission. This mirrors the Finding policy and avoids needless DB reads.
  if (actor.role_level === 'admin') return { allow: true, via: 'role' };
  return checkService.checkCapability(
    actor,
    'finding.manage',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    options,
  );
}
