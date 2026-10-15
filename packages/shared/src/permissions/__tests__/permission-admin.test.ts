import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';
import { notificationDtoSchema, notificationEventTypeSchema } from '../../notifications.js';
import {
  directPermissionGrantSchema,
  listPermissionDeniesResponseSchema,
  listPermissionGrantsResponseSchema,
  permissionDenyAdminItemSchema,
  permissionGrantAdminItemSchema,
  permissionGrantOptionsSchema,
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

  it('validates the revoke result', () => {
    expect(revokePermissionResultSchema.parse({ id: ID, revoked_at: CREATED_AT })).toEqual({
      id: ID,
      revoked_at: CREATED_AT,
    });
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
    const selfLiftDenyDetail = { ...denyDetail, self_lift: true };
    expect(AUDIT_EVENT_DETAIL_SCHEMAS.permission_revoked.parse(grantDetail)).toEqual(grantDetail);
    expect(AUDIT_EVENT_DETAIL_SCHEMAS.permission_deny_revoked.parse(denyDetail)).toEqual(
      denyDetail,
    );
    expect(AUDIT_EVENT_DETAIL_SCHEMAS.permission_deny_revoked.parse(selfLiftDenyDetail)).toEqual(
      selfLiftDenyDetail,
    );
    expect(() =>
      AUDIT_EVENT_DETAIL_SCHEMAS.permission_deny_revoked.parse({
        ...denyDetail,
        self_lift: false,
      }),
    ).toThrow(z.ZodError);
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

describe('governed direct grant contracts (ADR-0066)', () => {
  it('requires a trimmed reason and a strict known-capability direct body', () => {
    const body = { actor_id: ACTOR_ID, capability: 'voc.read', reason: '  Approved access  ' };
    expect(directPermissionGrantSchema.parse(body)).toEqual({ ...body, reason: 'Approved access' });
    for (const override of [
      { reason: ' ' },
      { reason: 'x'.repeat(2001) },
      { capability: 'unknown' },
      { workspace_id: WORKSPACE_ID },
      { expiration: null },
      { object_id: ID },
      { self_approval: { policy_citation: ' ', peer_reviewer_absence: 'none' } },
    ]) {
      expect(directPermissionGrantSchema.safeParse({ ...body, ...override }).success).toBe(false);
    }
  });

  it('registers strict create/reissue audit provenance and paired self metadata', () => {
    const detail = {
      grant_id: ID,
      grantee_actor_id: ACTOR_ID,
      capability: 'voc.read',
      managed_system_id: MANAGED_SYSTEM_ID,
      reason: 'Approved access',
      expires_at: null,
      mode: 'create',
    };
    const schema = AUDIT_EVENT_DETAIL_SCHEMAS.permission_granted;
    expect(schema.parse(detail)).toEqual(detail);
    const reissue = { ...detail, mode: 'reissue', previous_grant_id: WORKSPACE_ID };
    expect(schema.parse(reissue)).toEqual(reissue);
    for (const invalid of [
      { ...detail, mode: 'reissue' },
      { ...detail, previous_grant_id: WORKSPACE_ID },
      { ...detail, self_grant: true },
      { ...detail, extra: true },
      { ...detail, self_approval: { policy_citation: 'Policy', peer_reviewer_absence: 'None' } },
    ])
      expect(schema.safeParse(invalid).success).toBe(false);
    const self = {
      ...detail,
      self_grant: true,
      self_approval: { policy_citation: 'Policy', peer_reviewer_absence: 'None' },
    };
    expect(schema.parse(self)).toEqual(self);
  });

  it('carries optional voc.read prerequisites and rejects an unknown state', () => {
    const recipient = {
      id: ACTOR_ID,
      display_name: 'Dev',
      role_level: 'developer' as const,
    };
    const triage = {
      capability: 'voc.triage' as const,
      managed_system_id: MANAGED_SYSTEM_ID,
      governance_required: false,
      preflight: { state: 'available' as const },
      prerequisites: [
        {
          capability: 'voc.read' as const,
          managed_system_id: MANAGED_SYSTEM_ID,
          state: 'missing' as const,
        },
      ],
    };
    const { prerequisites: _omitted, ...withoutPrerequisites } = triage;
    const envelope = {
      recipient,
      self_policy: 'allowed' as const,
      self_approval_required: false,
    };
    expect(
      permissionGrantOptionsSchema.parse({ ...envelope, candidates: [triage] }).candidates[0],
    ).toEqual(triage);
    expect(
      permissionGrantOptionsSchema.parse({ ...envelope, candidates: [withoutPrerequisites] })
        .candidates[0],
    ).toEqual(withoutPrerequisites);
    expect(
      permissionGrantOptionsSchema.safeParse({
        ...envelope,
        candidates: [
          {
            ...withoutPrerequisites,
            prerequisites: [{ ...triage.prerequisites[0], state: 'blocked' }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
