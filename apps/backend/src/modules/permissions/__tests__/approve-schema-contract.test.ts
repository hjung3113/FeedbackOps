import {
  approvePermissionRequestSchema,
  denyPermissionRequestSchema,
  needMoreInfoPermissionRequestSchema,
  permissionApprovedDetailSchema,
  rejectPermissionRequestSchema,
  submitMoreInfoPermissionRequestSchema,
} from '@fops/shared';
import { describe, expect, test } from 'vitest';

import { approvePermissionRequestBodySchema } from '../routes.js';

describe('permission decision schema contracts', () => {
  test('AC-1 accepts the strict self-approval envelope and rejects unsupported keys', () => {
    expect(
      approvePermissionRequestSchema.safeParse({
        expected_revision: 1,
        reason: 'approved with audit context',
        self_approval: {
          policy_citation: 'workspace policy §4.3',
          peer_reviewer_absence: 'all peer reviewers are unavailable',
        },
      }).success,
    ).toBe(true);
    expect(
      approvePermissionRequestSchema.safeParse({
        expected_revision: 1,
        reason: 'approved',
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      approvePermissionRequestSchema.safeParse({
        expected_revision: 1,
        self_approval: {
          policy_citation: 'workspace policy §4.3',
          peer_reviewer_absence: 'all peer reviewers are unavailable',
          unexpected: true,
        },
      }).success,
    ).toBe(false);
    expect(
      rejectPermissionRequestSchema.safeParse({
        expected_revision: 1,
        self_approval: {
          policy_citation: 'workspace policy §4.3',
          peer_reviewer_absence: 'all peer reviewers are unavailable',
        },
      }).success,
    ).toBe(false);
    expect(
      denyPermissionRequestSchema.safeParse({
        expected_revision: 1,
        self_approval: {
          policy_citation: 'workspace policy §4.3',
          peer_reviewer_absence: 'all peer reviewers are unavailable',
        },
      }).success,
    ).toBe(false);
  });

  test.each([
    approvePermissionRequestSchema,
    rejectPermissionRequestSchema,
    denyPermissionRequestSchema,
    needMoreInfoPermissionRequestSchema,
    submitMoreInfoPermissionRequestSchema,
  ])('requires a positive integer revision and forbids object keys', (schema) => {
    for (const expected_revision of [undefined, 0, -1, 1.5, '1']) {
      expect(schema.safeParse({ expected_revision }).success).toBe(false);
    }
    expect(schema.safeParse({ expected_revision: 1 }).success).toBe(true);
    expect(schema.safeParse({ expected_revision: 1, requested_object_id: null }).success).toBe(
      false,
    );
  });

  test('AC-2 uses the shared approve schema in the permission route', () => {
    expect(approvePermissionRequestBodySchema).toBe(approvePermissionRequestSchema);
  });

  test('AC-3 accepts an optional nullable approval expiration and audits requested and granted values', () => {
    expect(
      approvePermissionRequestSchema.safeParse({
        expected_revision: 1,
        expiration: '2027-01-31T23:59:59.000Z',
      }).success,
    ).toBe(true);
    expect(
      approvePermissionRequestSchema.safeParse({ expected_revision: 1, expiration: null }).success,
    ).toBe(true);
    expect(
      approvePermissionRequestSchema.safeParse({ expected_revision: 1, expiration: '2027-01-31' })
        .success,
    ).toBe(false);
    expect(
      permissionApprovedDetailSchema.safeParse({
        previous_revision: 1,
        revision: 2,
        requested_managed_system_id: null,
        granted_managed_system_id: null,
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
