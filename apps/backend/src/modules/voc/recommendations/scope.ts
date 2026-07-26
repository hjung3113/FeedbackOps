// Dismissal scope keys (#168 step 4, ADR-0034 D3).
//
// ADR-0034 D3 scopes a dismissal to "(source VOC, candidate VOC, actor scope)".
// "Actor scope" is not the actor: it is *which arm of the ADR-0031 visibility
// predicate let this actor see the candidate at all*. There are exactly two:
//
//   ms:<managed system uuid>
//     The candidate's Managed System is in the actor's voc.read scope (or the
//     actor is an admin, whose scope is the whole workspace). This is a shared
//     triage judgement — "these two are not the same issue" — and every actor
//     scoped to that Managed System sees the suppression.
//
//   actor:<actor uuid>
//     The actor could see the candidate only because they reported it. This
//     arm is personal by construction. A reporter must not be able to suppress
//     a pair for the triagers who own the system; conversely, an MS-scoped
//     dismissal must not silently hide a pair from the reporter's own view
//     produced by a different visibility arm.
//
// The key is derived, never stored on the actor and never chosen by a caller,
// so a dismissal recorded under one arm can never be replayed under the other.
//
// Two implementations of one rule live here: `dismissalScopeKey` for the write
// path (which has already loaded the candidate row) and `dismissalScopeKeySql`
// for the read path (which must derive it per candidate row inside the
// similarity query). They are kept adjacent because they must not drift:
// `__tests__/scope.test.ts` pins the TypeScript rule, and
// `__tests__/recommendations.integration.test.ts` proves the SQL twin agrees —
// a dismissal written under the TypeScript key only suppresses the pair if the
// query derives the same key for the same candidate row.
//
// Agreement has to be proved once per arm, and an admin does not exercise the
// same SQL as a scoped actor: `kind: 'all'` returns a bare concatenation while
// `kind: 'scoped'` returns a CASE whose two branches are separately reachable.
// A test written only against an admin leaves the CASE untested even though it
// is the arm ordinary triagers actually run. All three arms now have a
// suppression test; keep it that way when editing either twin.

import { sql } from 'drizzle-orm';

import type { Scope } from '../repo-read.js';

export function sqlUuidArray(ids: string[]): ReturnType<typeof sql> {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  const items = ids.map((id) => sql`${id}::uuid`);
  return sql`ARRAY[${sql.join(items, sql`, `)}]::uuid[]`;
}

/** TypeScript twin of `dismissalScopeKeySql`, for the write path. */
export function dismissalScopeKey(
  readScope: Scope,
  actorId: string,
  candidateManagedSystemId: string,
): string {
  if (readScope.kind === 'all') return `ms:${candidateManagedSystemId}`;
  return readScope.managedSystemIds.includes(candidateManagedSystemId)
    ? `ms:${candidateManagedSystemId}`
    : `actor:${actorId}`;
}

/**
 * SQL twin of `dismissalScopeKey`, evaluated per candidate row.
 *
 * `candidateManagedSystemColumn` is a column reference, not a value — the
 * caller supplies e.g. sql`c.primary_managed_system_id`.
 */
export function dismissalScopeKeySql(
  readScope: Scope,
  actorId: string,
  candidateManagedSystemColumn: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  if (readScope.kind === 'all') {
    return sql`('ms:' || ${candidateManagedSystemColumn}::text)`;
  }
  return sql`(CASE
    WHEN ${candidateManagedSystemColumn} = ANY(${sqlUuidArray(readScope.managedSystemIds)})
      THEN 'ms:' || ${candidateManagedSystemColumn}::text
    ELSE 'actor:' || ${actorId}::text
  END)`;
}

/**
 * The ADR-0031 peer visibility predicate, restated for the recommendation read
 * model over an arbitrary VOC alias.
 *
 * Deliberately identical in meaning to `similarPeerVisibilityPredicate` in
 * `repo-read.ts` — ADR-0034 D4 says the recommendation surface *reuses* that
 * rule rather than deriving one of its own. It is restated here only because
 * the recommendation query aliases the candidate VOC differently.
 *
 * If the rule itself ever changes, both must change together, and **nothing
 * currently fails if they diverge**: `__tests__/recommendations.integration.
 * test.ts` pins this copy's behaviour (scope arm, reporter arm, and the total),
 * but no test puts the two surfaces on one fixture and asserts they agree.
 * Closing that needs a fixture spanning both read models; until then this
 * comment is the only thing holding the two in step.
 */
export function candidateVisibilityPredicate(
  readScope: Scope,
  actorId: string,
  vocAlias: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  if (readScope.kind === 'all') return sql`TRUE`;
  return sql`(
    ${vocAlias}.primary_managed_system_id = ANY(${sqlUuidArray(readScope.managedSystemIds)})
    OR ${vocAlias}.reporter_id = ${actorId}
  )`;
}

/** Non-SQL twin of `candidateVisibilityPredicate`, for already-loaded rows. */
export function isVocVisible(
  readScope: Scope,
  actorId: string,
  voc: { primary_managed_system_id: string; reporter_id: string },
): boolean {
  return (
    readScope.kind === 'all' ||
    readScope.managedSystemIds.includes(voc.primary_managed_system_id) ||
    voc.reporter_id === actorId
  );
}
