// apps/backend/src/modules/voc/authorization.ts
//
// The VOC authorization boundary. Scope resolution reads
// permission.permission_grants only through actorScopeForCapability; this file
// must not import the permissions schema or repo-read.ts.

import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
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
 * Effective scope: union of voc.read and voc.triage grants for the actor.
 * Admin role → 'all'. MS-scoped grants → union of both capability MS lists.
 *
 * WHY: using undefined (any capability) let future non-VOC capabilities
 * widen VOC summary visibility, creating an unintended existence-probe
 * surface. Restricting to voc.read ∪ voc.triage bounds the effective
 * scope to capabilities that are semantically relevant to VOC reads (M1).
 *
 * Used for out_of_scope_summary visibility and detail-existence-probe defense.
 */
export async function actorEffectiveScope(
  db: Db | Tx,
  actor: ActorContextLite,
): Promise<Scope> {
  if (actor.role_level === 'admin') {
    return { kind: 'all' };
  }
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
 * voc.read scope. Admin → 'all'. Otherwise: workspace-wide voc.read grant →
 * 'all'; MS-scoped voc.read grants → scoped list. Empty list → scoped:[].
 */
export async function actorReadScope(
  db: Db | Tx,
  actor: ActorContextLite,
): Promise<Scope> {
  return actorScopeForCapability(db, actor as ScopeActorContext, 'voc.read');
}

/** voc.triage scope. Same shape as actorReadScope; admin → 'all'. */
export async function actorTriageScope(
  db: Db | Tx,
  actor: ActorContextLite,
): Promise<Scope> {
  return actorScopeForCapability(db, actor as ScopeActorContext, 'voc.triage');
}

// ── SQL array helper ──────────────────────────────────────────────────────────
// Drizzle's sql`` tag serializes JS arrays as postgres row/record literals, not
// postgres array literals. To safely use ANY($arr::uuid[]), we build
// ARRAY[v1, v2, ...]::uuid[] with individual parameterised slots.
// This avoids string interpolation of user-supplied values.

// Identical to the private helper in repo-read.ts; not exported.
function sqlUuidArray(ids: string[]): ReturnType<typeof sql> {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  const items = ids.map((id) => sql`${id}::uuid`);
  return sql`ARRAY[${sql.join(items, sql`, `)}]::uuid[]`;
}

// ── Similar VOC visibility predicate (ADR-0031) ──────────────────────────────

/**
 * The ADR-0031 VOC visibility rule, and the only copy of it.
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
