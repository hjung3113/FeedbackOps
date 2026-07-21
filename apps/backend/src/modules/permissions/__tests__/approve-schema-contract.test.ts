import {
  approvePermissionRequestSchema,
  denyPermissionRequestSchema,
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
});
