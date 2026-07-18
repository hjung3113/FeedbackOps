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
export type FindingPointAuthorizationPolicy = { requireElevatedRole: boolean };
export function hasElevatedFindingRole(actor: FindingAuthorizationActor): boolean {
  return actor.role_level === 'admin' || actor.role_level === 'developer';
}

export async function actorFindingReadScope(
  db: Db | Tx,
  actor: FindingAuthorizationActor,
  policy: FindingPointAuthorizationPolicy,
): Promise<Scope> {
  if (policy.requireElevatedRole && !hasElevatedFindingRole(actor)) {
    return { kind: 'scoped', managedSystemIds: [] };
  }
  return actorScopeForCapability(db, actor, 'finding.read');
}

export function isFindingInReadScope(scope: Scope, managedSystemId: string): boolean {
  return scope.kind === 'all' || scope.managedSystemIds.includes(managedSystemId);
}

const findingRoleDenied: Decision = {
  allow: false,
  reason: 'no_grant',
  requestable: null,
};

/**
 * Point authorization for a single Finding or Finding-governed target.
 *
 * This deliberately uses CheckService rather than scope resolution: point
 * checks retain its injected application clock and do not exclude archived
 * Managed Systems while expanding a workspace-wide grant around denies.
 */
export async function checkFindingRead(
  checkService: CheckService,
  actor: FindingAuthorizationActor,
  managedSystemId: string,
  policy: FindingPointAuthorizationPolicy,
  options?: Parameters<CheckService['checkCapability']>[3],
): Promise<Decision> {
  if (actor.role_level === 'admin') return { allow: true, via: 'role' };
  if (policy.requireElevatedRole && actor.role_level !== 'developer') return findingRoleDenied;
  return checkService.checkCapability(
    actor,
    'finding.read',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    options,
  );
}

export async function checkFindingManage(
  checkService: CheckService,
  actor: FindingAuthorizationActor,
  managedSystemId: string,
  policy: FindingPointAuthorizationPolicy,
  options?: Parameters<CheckService['checkCapability']>[3],
): Promise<Decision> {
  // Preserve the workspace-admin bypass before delegating scoped decisions to
  // Permission. This mirrors the Finding policy and avoids needless DB reads.
  if (actor.role_level === 'admin') return { allow: true, via: 'role' };
  if (policy.requireElevatedRole && actor.role_level !== 'developer') return findingRoleDenied;
  return checkService.checkCapability(
    actor,
    'finding.manage',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    options,
  );
}
