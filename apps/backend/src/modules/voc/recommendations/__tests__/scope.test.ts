// Unit coverage for the dismissal scope key (#168 step 4, ADR-0034 D3).
//
// The SQL twin (`dismissalScopeKeySql`) is proved to agree with this one by
// `recommendations.integration.test.ts`: a dismissal written with the key
// produced here is only suppressed by the read query if the query derives the
// same key for the same candidate row.

import { describe, expect, it } from 'vitest';

import type { Scope } from '../../repo-read.js';
import { dismissalScopeKey, isVocVisible } from '../scope.js';

const MS_A = '11111111-2222-3333-4444-555555555555';
const MS_B = '66666666-7777-8888-9999-000000000000';
const ACTOR = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OTHER_ACTOR = 'ffffffff-1111-2222-3333-444444444444';

describe('dismissalScopeKey (#168)', () => {
  it('uses the Managed System arm for an admin, whose scope is the workspace', () => {
    const scope: Scope = { kind: 'all' };
    expect(dismissalScopeKey(scope, ACTOR, MS_A)).toBe(`ms:${MS_A}`);
  });

  it('uses the Managed System arm when the candidate system is in voc.read scope', () => {
    const scope: Scope = { kind: 'scoped', managedSystemIds: [MS_A] };
    expect(dismissalScopeKey(scope, ACTOR, MS_A)).toBe(`ms:${MS_A}`);
  });

  it('falls back to the personal arm when only reporter ownership grants visibility', () => {
    const scope: Scope = { kind: 'scoped', managedSystemIds: [MS_A] };
    // The candidate is in MS_B, which this actor has no voc.read on. They can
    // only be seeing it because they reported it, so their dismissal must not
    // suppress the pair for the triagers who own MS_B.
    expect(dismissalScopeKey(scope, ACTOR, MS_B)).toBe(`actor:${ACTOR}`);
  });

  it('gives two actors scoped to the same system the same key', () => {
    const a: Scope = { kind: 'scoped', managedSystemIds: [MS_A, MS_B] };
    const b: Scope = { kind: 'scoped', managedSystemIds: [MS_A] };
    expect(dismissalScopeKey(a, ACTOR, MS_A)).toBe(dismissalScopeKey(b, OTHER_ACTOR, MS_A));
  });

  it('gives two reporters different keys', () => {
    const scope: Scope = { kind: 'scoped', managedSystemIds: [] };
    expect(dismissalScopeKey(scope, ACTOR, MS_A)).not.toBe(
      dismissalScopeKey(scope, OTHER_ACTOR, MS_A),
    );
  });
});

describe('isVocVisible (#168, ADR-0031 predicate)', () => {
  const voc = { primary_managed_system_id: MS_B, reporter_id: OTHER_ACTOR };

  it('admits everything for workspace-wide scope', () => {
    expect(isVocVisible({ kind: 'all' }, ACTOR, voc)).toBe(true);
  });

  it('admits a VOC whose Managed System is in scope', () => {
    expect(isVocVisible({ kind: 'scoped', managedSystemIds: [MS_B] }, ACTOR, voc)).toBe(true);
  });

  it('admits a VOC the actor reported, without scope', () => {
    expect(isVocVisible({ kind: 'scoped', managedSystemIds: [MS_A] }, OTHER_ACTOR, voc)).toBe(true);
  });

  it('rejects a VOC that is neither in scope nor reported by the actor', () => {
    expect(isVocVisible({ kind: 'scoped', managedSystemIds: [MS_A] }, ACTOR, voc)).toBe(false);
  });
});
