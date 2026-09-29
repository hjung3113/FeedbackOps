// VOC list view scope resolution and shared scope membership helper.
import type { ListVocsQuery } from '@fops/shared';
import { HttpError } from '../../../lib/errors.js';
import type { Scope } from '../authorization.js';
import type { ReadActorContext } from '../read-service.js';

// ── Scope helpers ────────────────────────────────────────────────────────────

export function msInScope(scope: Scope, msId: string): boolean {
  if (scope.kind === 'all') return true;
  return scope.managedSystemIds.includes(msId);
}

function intersectScopes(a: Scope, b: Scope): Scope {
  if (a.kind === 'all' && b.kind === 'all') return { kind: 'all' };
  const aIds = a.kind === 'all' ? null : a.managedSystemIds;
  const bIds = b.kind === 'all' ? null : b.managedSystemIds;
  if (aIds === null && bIds !== null) return { kind: 'scoped', managedSystemIds: bIds };
  if (bIds === null && aIds !== null) return { kind: 'scoped', managedSystemIds: aIds };
  if (aIds !== null && bIds !== null) {
    const bSet = new Set(bIds);
    return { kind: 'scoped', managedSystemIds: aIds.filter((id) => bSet.has(id)) };
  }
  return { kind: 'all' };
}

type ResolvedVocListScope = {
  scopeFilter: Scope;
  actorIdForMyFilter?: string;
};

/** Shared view-to-scope decision for VOC lists and their navigation counts. */
export function resolveVocListScope(args: {
  actor: ReadActorContext;
  query: Pick<ListVocsQuery, 'view' | 'managed_system_id'>;
  readScope: Scope;
  triageScope: Scope | undefined;
}): ResolvedVocListScope {
  const { actor, query, readScope, triageScope } = args;
  const { view, managed_system_id } = query;

  if (view === 'my') {
    if (managed_system_id === 'all') {
      throw new HttpError('validation.failed', 'managed_system_id=all not allowed for view=my', {
        fields: [{ path: ['managed_system_id'], code: 'invalid' }],
      });
    }
    return {
      scopeFilter:
        managed_system_id && managed_system_id !== 'all'
          ? { kind: 'scoped', managedSystemIds: [managed_system_id] }
          : { kind: 'all' },
      actorIdForMyFilter: actor.actor_id,
    };
  }

  if (view === 'inbox') {
    if (readScope.kind === 'scoped' && readScope.managedSystemIds.length === 0) {
      if (actor.role_level === 'developer') {
        throw new HttpError(
          'permission.scope_required',
          'voc.read capability required; developer needs MS-scoped grant',
          {
            requiredScope: [],
            requestable_permission: { permission: 'voc.read', managed_system_id: null },
          },
        );
      }
      throw new HttpError('permission.denied', 'no voc.read scope for actor', {
        reason: 'no_grant',
      });
    }
    if (managed_system_id && managed_system_id !== 'all') {
      if (!msInScope(readScope, managed_system_id)) {
        throw new HttpError(
          'permission.scope_required',
          'managed_system_id not in voc.read scope',
          {
            requiredScope: [managed_system_id],
            requestable_permission: { permission: 'voc.read', managed_system_id },
          },
        );
      }
      return { scopeFilter: { kind: 'scoped', managedSystemIds: [managed_system_id] } };
    }
    return { scopeFilter: readScope };
  }

  const intersected = intersectScopes(readScope, triageScope!);
  if (intersected.kind === 'scoped' && intersected.managedSystemIds.length === 0) {
    throw new HttpError('permission.denied', 'no voc.triage scope for actor', {
      requestable_permission: { permission: 'voc.triage', managed_system_id: null },
    });
  }
  if (managed_system_id && managed_system_id !== 'all') {
    if (!msInScope(intersected, managed_system_id)) {
      throw new HttpError(
        'permission.scope_required',
        'managed_system_id not in voc.triage scope',
        {
          requiredScope: [managed_system_id],
          requestable_permission: { permission: 'voc.triage', managed_system_id },
        },
      );
    }
    return { scopeFilter: { kind: 'scoped', managedSystemIds: [managed_system_id] } };
  }
  return { scopeFilter: intersected };
}
