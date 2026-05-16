// Mapping-table tests for `toFrontendState`. Pin every branch including the
// Slice 1 dead branches (hidden_existence, rejected, expired, revoked,
// summary_visible) so S1.2/S1.4 don't drift the contract.

import { describe, expect, it } from 'vitest';

import type { Decision } from '../check-service.js';
import { toFrontendState } from '../state-mapper.js';

const WS = '11111111-1111-1111-1111-111111111111';

describe('toFrontendState', () => {
  it('allow → approved', () => {
    const d: Decision = { allow: true, via: 'role' };
    expect(toFrontendState(d, null)).toBe('approved');
    expect(toFrontendState({ allow: true, via: 'direct_grant', grant_id: 'g' }, null)).toBe(
      'approved',
    );
  });

  it('workspace_mismatch → hidden_existence (dead branch in Slice 1 UI)', () => {
    const d: Decision = { allow: false, reason: 'workspace_mismatch', requestable: null };
    expect(toFrontendState(d, null)).toBe('hidden_existence');
  });

  it('explicit_deny → blocked_non_requestable', () => {
    const d: Decision = { allow: false, reason: 'explicit_deny', requestable: null };
    expect(toFrontendState(d, null)).toBe('blocked_non_requestable');
  });

  it('no_grant with requestable and no open request → request_access', () => {
    const d: Decision = {
      allow: false,
      reason: 'no_grant',
      requestable: [{ workspace_id: WS }],
    };
    expect(toFrontendState(d, null)).toBe('request_access');
  });

  it('no_grant with open pending request → pending_request', () => {
    const d: Decision = {
      allow: false,
      reason: 'no_grant',
      requestable: [{ workspace_id: WS }],
    };
    expect(toFrontendState(d, { status: 'pending' })).toBe('pending_request');
  });

  it('no_grant with needs_more_info → pending_request', () => {
    const d: Decision = {
      allow: false,
      reason: 'no_grant',
      requestable: [{ workspace_id: WS }],
    };
    expect(toFrontendState(d, { status: 'needs_more_info' })).toBe('pending_request');
  });

  it('no_grant with rejected → rejected (dead branch in Slice 1)', () => {
    const d: Decision = {
      allow: false,
      reason: 'no_grant',
      requestable: [{ workspace_id: WS }],
    };
    expect(toFrontendState(d, { status: 'rejected' })).toBe('rejected');
  });

  it('no_grant with empty/null requestable → blocked_non_requestable', () => {
    expect(toFrontendState({ allow: false, reason: 'no_grant', requestable: [] }, null)).toBe(
      'blocked_non_requestable',
    );
    expect(toFrontendState({ allow: false, reason: 'no_grant', requestable: null }, null)).toBe(
      'blocked_non_requestable',
    );
  });

  it('grant_expired → expired (dead branch in Slice 1)', () => {
    const d: Decision = { allow: false, reason: 'grant_expired', requestable: null };
    expect(toFrontendState(d, null)).toBe('expired');
  });

  it('grant_revoked → revoked (dead branch in Slice 1)', () => {
    const d: Decision = { allow: false, reason: 'grant_revoked', requestable: null };
    expect(toFrontendState(d, null)).toBe('revoked');
  });

  it('sensitive_reason_missing → blocked_non_requestable (Slice 1 dead branch)', () => {
    const d: Decision = {
      allow: false,
      reason: 'sensitive_reason_missing',
      requestable: null,
    };
    expect(toFrontendState(d, null)).toBe('blocked_non_requestable');
  });

  // summary_visible is not producible from any Decision in Slice 1; the
  // mapper has no branch for it. Pin the contract by exhaustively asserting
  // every branch above returns something OTHER than summary_visible.
  it('does not produce summary_visible in Slice 1', () => {
    const inputs: Array<[Decision, null | { status: 'pending' }]> = [
      [{ allow: true, via: 'role' }, null],
      [{ allow: false, reason: 'workspace_mismatch', requestable: null }, null],
      [{ allow: false, reason: 'explicit_deny', requestable: null }, null],
      [{ allow: false, reason: 'no_grant', requestable: [{ workspace_id: WS }] }, null],
      [
        { allow: false, reason: 'no_grant', requestable: [{ workspace_id: WS }] },
        { status: 'pending' },
      ],
      [{ allow: false, reason: 'grant_expired', requestable: null }, null],
      [{ allow: false, reason: 'grant_revoked', requestable: null }, null],
      [{ allow: false, reason: 'sensitive_reason_missing', requestable: null }, null],
    ];
    for (const [d, r] of inputs) {
      expect(toFrontendState(d, r)).not.toBe('summary_visible');
    }
  });
});
