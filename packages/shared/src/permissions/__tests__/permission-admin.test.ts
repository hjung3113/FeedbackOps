import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AUDIT_EVENT_DETAIL_SCHEMAS, AUDIT_EVENT_TYPES } from '../../enums/audit-events.js';
import { errorCodeSchema } from '../../errors/codes.js';
import { notificationDtoSchema, notificationEventTypeSchema } from '../../notifications.js';
import {
  listPermissionDeniesResponseSchema,
  listPermissionGrantsResponseSchema,
  permissionDenyAdminItemSchema,
  permissionGrantAdminItemSchema,
} from '../admin.js';
import { revokePermissionBodySchema, revokePermissionResultSchema } from '../decisions.js';

const ID = '01919b8c-0000-7000-8000-000000000001';
const WORKSPACE_ID = '01919b8c-0000-7000-8000-000000000002';
const ACTOR_ID = '01919b8c-0000-7000-8000-000000000003';
const MANAGED_SYSTEM_ID = '01919b8c-0000-7000-8000-000000000004';
const CREATED_AT = '2026-10-05T00:00:00.000Z';

describe('Admin permission revocation contracts (ADR-0061)', () => {
  it('trims and strictly validates the required reason', () => {
    expect(revokePermissionBodySchema.parse({ reason: '  Approved transfer ended.  ' })).toEqual({
      reason: 'Approved transfer ended.',
    });
    expect(() => revokePermissionBodySchema.parse({ reason: '  ' })).toThrow(z.ZodError);
    expect(() => revokePermissionBodySchema.parse({ reason: 'x'.repeat(2001) })).toThrow(
      z.ZodError,
    );
    expect(() => revokePermissionBodySchema.parse({ reason: 'valid', extra: true })).toThrow(
      z.ZodError,
    );
  });

  it('validates strict grant and deny list items and envelopes', () => {
    const grant = {
      id: ID,
      actor_id: ACTOR_ID,
      capability: 'finding.manage',
      managed_system_id: MANAGED_SYSTEM_ID,
      granted_by_actor_id: WORKSPACE_ID,
      granted_at: CREATED_AT,
      expires_at: null,
    };
    const deny = {
      id: ID,
      actor_id: ACTOR_ID,
      capability: 'finding.manage',
      managed_system_id: null,
      reason: 'Policy hold',
      created_by_actor_id: WORKSPACE_ID,
      created_at: CREATED_AT,
    };

    expect(permissionGrantAdminItemSchema.parse(grant)).toEqual(grant);
    expect(permissionDenyAdminItemSchema.parse(deny)).toEqual(deny);
    expect(listPermissionGrantsResponseSchema.parse({ items: [grant] })).toEqual({
      items: [grant],
    });
    expect(listPermissionDeniesResponseSchema.parse({ items: [deny] })).toEqual({
      items: [deny],
    });
    expect(() =>
      permissionGrantAdminItemSchema.parse({ ...grant, revoked_at: CREATED_AT }),
    ).toThrow(z.ZodError);
    expect(() => listPermissionDeniesResponseSchema.parse({ items: [deny], count: 1 })).toThrow(
      z.ZodError,
    );
  });

  it('validates the revoke result and the new conflict code', () => {
    expect(revokePermissionResultSchema.parse({ id: ID, revoked_at: CREATED_AT })).toEqual({
      id: ID,
      revoked_at: CREATED_AT,
    });
    expect(errorCodeSchema.parse('conflict.permission_not_active')).toBe(
      'conflict.permission_not_active',
    );
  });

  it('registers strict revoke audit details and the grant notification subject', () => {
    const grantDetail = {
      grant_id: ID,
      capability: 'finding.manage',
      managed_system_id: MANAGED_SYSTEM_ID,
      grantee_actor_id: ACTOR_ID,
      reason: 'Approved transfer ended.',
    };
    const denyDetail = {
      deny_id: ID,
      capability: 'finding.manage',
      managed_system_id: null,
      denied_actor_id: ACTOR_ID,
      reason: 'Policy hold ended.',
    };
    expect(AUDIT_EVENT_TYPES).toContain('permission_revoked');
    expect(AUDIT_EVENT_TYPES).toContain('permission_deny_revoked');
    expect(AUDIT_EVENT_DETAIL_SCHEMAS.permission_revoked.parse(grantDetail)).toEqual(grantDetail);
    expect(AUDIT_EVENT_DETAIL_SCHEMAS.permission_deny_revoked.parse(denyDetail)).toEqual(
      denyDetail,
    );
    expect(() =>
      AUDIT_EVENT_DETAIL_SCHEMAS.permission_revoked.parse({ ...grantDetail, extra: true }),
    ).toThrow(z.ZodError);
    expect(notificationEventTypeSchema.parse('permission_grant.revoked')).toBe(
      'permission_grant.revoked',
    );
    expect(
      notificationDtoSchema.parse({
        id: ID,
        event_type: 'permission_grant.revoked',
        subject_type: 'permission_grant',
        subject_id: ACTOR_ID,
        summary: '권한이 취소되었습니다.',
        detail: { permission_grant_id: ACTOR_ID },
        created_at: CREATED_AT,
        read_at: null,
        archived_at: null,
      }).subject_type,
    ).toBe('permission_grant');
  });
});
