// Unit tests for `applyAdminModuleBypass` (issue #372).
//
// No database: the function is pure, and the whole point of it is that the
// advisory `GET /me/permissions/check` decision matches what the *enforcing*
// domain module would answer. These tests pin the per-capability rule table
// declared in `CAPABILITY_META.adminModuleBypass`.

import { CAPABILITIES, type Capability } from '@fops/shared';
import { describe, expect, it } from 'vitest';

import { type Decision, applyAdminModuleBypass } from '../check-service.js';

const noGrant: Decision = { allow: false, reason: 'no_grant', requestable: null };
const explicitDeny: Decision = { allow: false, reason: 'explicit_deny', requestable: null };
const workspaceMismatch: Decision = {
  allow: false,
  reason: 'workspace_mismatch',
  requestable: null,
};

/** Capabilities a module lets the admin role through on, and how. */
const ALWAYS: Capability[] = ['finding.read', 'finding.manage', 'task_request.self_approve'];
const UNLESS_DENIED: Capability[] = ['survey.read', 'survey.manage'];
const NONE: Capability[] = [
  'workspace.read',
  'workspace.admin',
  'voc.triage',
  'voc.read',
  'survey.read_personal_responses',
  'survey.export',
];

describe('applyAdminModuleBypass', () => {
  it('covers every capability exactly once across the three rule buckets', () => {
    // Guards the table below: a new capability must be classified, not
    // silently inherit `none` and re-open the #372 divergence.
    const classified = [...ALWAYS, ...UNLESS_DENIED, ...NONE].sort();
    expect(classified).toEqual([...CAPABILITIES].sort());
  });

  it.each(ALWAYS)('%s — admin is allowed even over an explicit deny', (capability) => {
    // `findings/authorization.ts` and `task-requests/service.ts` short-circuit
    // on role BEFORE consulting Permission, so a deny row never gets read.
    expect(applyAdminModuleBypass('admin', capability, noGrant)).toEqual({
      allow: true,
      via: 'role',
    });
    expect(applyAdminModuleBypass('admin', capability, explicitDeny)).toEqual({
      allow: true,
      via: 'role',
    });
  });

  it.each(UNLESS_DENIED)('%s — admin is allowed, but an explicit deny still wins', (capability) => {
    // `surveys/authorization.ts` runs the scoped check first and returns it
    // verbatim when the reason is `explicit_deny` (ADR-0033 §C).
    expect(applyAdminModuleBypass('admin', capability, noGrant)).toEqual({
      allow: true,
      via: 'role',
    });
    expect(applyAdminModuleBypass('admin', capability, explicitDeny)).toBe(explicitDeny);
  });

  it.each(NONE)('%s — admin gets nothing beyond roleSatisfies', (capability) => {
    expect(applyAdminModuleBypass('admin', capability, noGrant)).toBe(noGrant);
    expect(applyAdminModuleBypass('admin', capability, explicitDeny)).toBe(explicitDeny);
  });

  it.each(['developer', 'user'])('%s role is never bypassed', (roleLevel) => {
    for (const capability of CAPABILITIES) {
      expect(applyAdminModuleBypass(roleLevel, capability, noGrant)).toBe(noGrant);
    }
  });

  it('never bypasses workspace_mismatch — a foreign actor is not this workspace admin', () => {
    for (const capability of CAPABILITIES) {
      expect(applyAdminModuleBypass('admin', capability, workspaceMismatch)).toBe(
        workspaceMismatch,
      );
    }
  });

  it('leaves an already-allowed decision untouched, preserving its attribution', () => {
    const granted: Decision = { allow: true, via: 'direct_grant', grant_id: 'g-1' };
    expect(applyAdminModuleBypass('admin', 'survey.manage', granted)).toBe(granted);
  });
});
