// apps/backend/src/modules/voc/authorization.ts
//
// The VOC authorization boundary. Scope resolution reads
// permission.permission_grants only through actorScopeForCapability; this file
// must not import the permissions schema or repo-read.ts.

import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { sqlUuidArray } from '../../db/sql-arrays.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { CheckService } from '../permissions/check-service.js';
import { isRequestableDenial } from '../permissions/index.js';
import {
  type Scope,
  type ScopeActorContext,
  actorScopeForCapability,
} from '../permissions/scope-service.js';

export type { Scope };

// ── Actor context ─────────────────────────────────────────────────────────────

export interface ActorContextLite {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

// ── Scope resolvers ───────────────────────────────────────────────────────────

/**
 * Effective scope: union of deny-aware voc.read and voc.triage scopes.
 * Admin role-derived scope honours explicit denies on each capability.
 *
 * WHY: using undefined (any capability) let future non-VOC capabilities
 * widen VOC summary visibility, creating an unintended existence-probe
 * surface. Restricting to voc.read ∪ voc.triage bounds the effective
 * scope to capabilities that are semantically relevant to VOC reads (M1).
 *
 * Used for out_of_scope_summary visibility and detail-existence-probe defense.
 */
export async function actorEffectiveScope(db: Db | Tx, actor: ActorContextLite): Promise<Scope> {
  const [readScope, triageScope] = await Promise.all([
    actorScopeForCapability(db, actor as ScopeActorContext, 'voc.read'),
    actorScopeForCapability(db, actor as ScopeActorContext, 'voc.triage'),
  ]);
  // Union: if either is 'all', effective scope is 'all'.
  if (readScope.kind === 'all' || triageScope.kind === 'all') {
    return { kind: 'all' };
  }
  const unionIds = [...new Set([...readScope.managedSystemIds, ...triageScope.managedSystemIds])];
  return { kind: 'scoped', managedSystemIds: unionIds };
}

/**
 * Deny-aware voc.read scope, including Admin role-derived access.
 * Broad allow without denies → 'all'; otherwise scoped ids after deny subtraction.
 */
export async function actorReadScope(db: Db | Tx, actor: ActorContextLite): Promise<Scope> {
  return actorScopeForCapability(db, actor as ScopeActorContext, 'voc.read');
}

/** Deny-aware voc.triage scope, independent of voc.read. */
export async function actorTriageScope(db: Db | Tx, actor: ActorContextLite): Promise<Scope> {
  return actorScopeForCapability(db, actor as ScopeActorContext, 'voc.triage');
}

// ── Similar VOC visibility predicate (ADR-0031) ──────────────────────────────

/**
 * SQL face of the single ADR-0031 VOC visibility rule. The object form is
 * `isVocVisibleToActor`; the two forms must change together.
 *
 * A VOC other than the actor's own source is visible when its Managed System
 * is in the actor's `voc.read` scope, or the actor reported it. Both the
 * ADR-0031 similar-peer projections below and the ADR-0034 recommendation read
 * model (`recommendations/repo.ts`) call this one function; ADR-0034 D4 says
 * the recommendation surface *reuses* this rule rather than deriving one of
 * its own, and reuse means calling it, not restating it.
 *
 * It was briefly restated in `recommendations/scope.ts` because that query
 * aliases the VOC differently — which is why the alias is a parameter now. A
 * second body is not worth an aliasing difference: a future change to the
 * scope semantics (a team-based arm, a different resolution of `kind: 'all'`)
 * would be made in one copy, the other would keep authorizing under the old
 * rule, and the divergence would leak VOC existence with nothing failing.
 *
 * `vocAlias` is a table alias, not a value — callers supply e.g. sql`p`.
 * `__tests__/voc-visibility-predicate.integration.test.ts` pins the verdict
 * matrix and asserts both surfaces admit the same VOCs on one fixture.
 */
export function similarVocVisibilityPredicate(
  readScope: Scope,
  actorId: string,
  vocAlias: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  if (readScope.kind === 'all') return sql`true`;
  return sql`(
    ${vocAlias}.primary_managed_system_id = ANY(${sqlUuidArray(readScope.managedSystemIds)})
    OR ${vocAlias}.reporter_id = ${actorId}
  )`;
}

/**
 * Object face of the single ADR-0031 VOC visibility rule. The SQL form is
 * `similarVocVisibilityPredicate`; the two forms must change together.
 */
export function isVocVisibleToActor(
  readScope: Scope,
  actorId: string,
  voc: { primary_managed_system_id: string; reporter_id: string },
): boolean {
  if (readScope.kind === 'all') return true;
  return (
    readScope.managedSystemIds.includes(voc.primary_managed_system_id) ||
    voc.reporter_id === actorId
  );
}

/** Shared caller gate for triage mutation and advisory owner candidates. */
export async function assertVocTriage(
  tx: Tx,
  checkService: CheckService,
  actor: ActorContextLite,
  managedSystemId: string,
): Promise<void> {
  const decision = await checkService.checkCapability(
    { actor_id: actor.actor_id, workspace_id: actor.workspace_id, role_level: actor.role_level },
    'voc.triage',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    { tx },
  );
  if (decision.allow !== true) {
    // F1: `no_grant`, `grant_revoked`, and `grant_expired` map to
    // `permission.scope_required` for developers (ADR-0061 §6).
    // Explicit deny and workspace mismatch remain denied.
    if (isRequestableDenial(decision.reason) && actor.role_level === 'developer') {
      throw new HttpError(
        'permission.scope_required',
        'voc.triage capability required; developer needs MS-scoped grant',
        {
          requiredScope: [managedSystemId],
          requestable_permission: {
            permission: 'voc.triage',
            managed_system_id: managedSystemId,
            reason_required: false,
          },
        },
      );
    }
    // Explicit deny, workspace mismatch, and non-developer denials stay generic.
    throw new HttpError('permission.denied', `voc.triage denied: ${decision.reason}`, {
      reason: decision.reason,
    });
  }
}
