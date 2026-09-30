import {
  approvePermissionRequestSchema,
  denyPermissionRequestSchema,
  permissionApprovedDetailSchema,
  rejectPermissionRequestSchema,
} from '@fops/shared';
import { describe, expect, test } from 'vitest';

import { approvePermissionRequestBodySchema } from '../routes.js';

describe('permission decision schema contracts', () => {
  test('AC-1 accepts the strict self-approval envelope and rejects unsupported keys', () => {
    expect(
      approvePermissionRequestSchema.safeParse({
        reason: 'approved with audit context',
        self_approval: {
          policy_citation: 'workspace policy §4.3',
          peer_reviewer_absence: 'all peer reviewers are unavailable',
        },
      }).success,
    ).toBe(true);
    expect(
      approvePermissionRequestSchema.safeParse({ reason: 'approved', unexpected: true }).success,
    ).toBe(false);
    expect(
      approvePermissionRequestSchema.safeParse({
        self_approval: {
          policy_citation: 'workspace policy §4.3',
          peer_reviewer_absence: 'all peer reviewers are unavailable',
          unexpected: true,
        },
      }).success,
    ).toBe(false);
    expect(
      rejectPermissionRequestSchema.safeParse({
        self_approval: {
          policy_citation: 'workspace policy §4.3',
          peer_reviewer_absence: 'all peer reviewers are unavailable',
        },
      }).success,
    ).toBe(false);
    expect(
      denyPermissionRequestSchema.safeParse({
        self_approval: {
          policy_citation: 'workspace policy §4.3',
          peer_reviewer_absence: 'all peer reviewers are unavailable',
        },
      }).success,
    ).toBe(false);
  });

  test('AC-2 uses the shared approve schema in the permission route', () => {
    expect(approvePermissionRequestBodySchema).toBe(approvePermissionRequestSchema);
  });

  test('AC-3 accepts an optional nullable approval expiration and audits requested and granted values', () => {
    expect(
      approvePermissionRequestSchema.safeParse({ expiration: '2027-01-31T23:59:59.000Z' }).success,
    ).toBe(true);
    expect(approvePermissionRequestSchema.safeParse({ expiration: null }).success).toBe(true);
    expect(approvePermissionRequestSchema.safeParse({ expiration: '2027-01-31' }).success).toBe(
      false,
    );
    expect(
      permissionApprovedDetailSchema.safeParse({
        capability: 'workspace.read',
        managed_system_id: null,
        requester_actor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        reason: null,
        grant_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        requested_expiration: '2026-12-31T23:59:59.000Z',
        granted_expiration: null,
      }).success,
    ).toBe(true);
  });
});
