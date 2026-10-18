// Permission-owned scope adapter for read-model filtering. The capability rule
// lives in check-service.ts and is shared with GET /me/permissions/scope.
import type { Capability } from '@fops/shared';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { resolveCapabilityScope } from './check-service.js';

export type Scope = { kind: 'all' } | { kind: 'scoped'; managedSystemIds: string[] };

export function scopeIncludes(scope: Scope, managedSystemId: string): boolean {
  return scope.kind === 'all' || scope.managedSystemIds.includes(managedSystemId);
}

export function scopeIsNonEmpty(scope: Scope): boolean {
  return scope.kind === 'all' || scope.managedSystemIds.length > 0;
}

export function unionScopes(a: Scope, b: Scope): Scope {
  if (a.kind === 'all' || b.kind === 'all') return { kind: 'all' };
  return {
    kind: 'scoped',
    managedSystemIds: [...new Set([...a.managedSystemIds, ...b.managedSystemIds])],
  };
}

export interface ScopeActorContext {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

/**
 * Module bypass first, then denies, broad role/grant allow or scoped grants,
 * minus Managed System denies. Admin has no unconditional scope bypass:
 * Finding's `always` and Survey's `unless_denied` follow CAPABILITY_META.
 * Accepts a plain db/transaction handle; callers need no CheckService instance.
 */
export async function actorScopeForCapability(
  db: Db | Tx,
  actor: ScopeActorContext,
  capability: Capability,
): Promise<Scope> {
  const scope = await resolveCapabilityScope(db, actor, capability);
  return scope.kind === 'all'
    ? scope
    : { kind: 'scoped', managedSystemIds: scope.managed_system_ids };
}
