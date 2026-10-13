import type { AdminPermissionRequestRow } from '@/lib/api';
import {
  permissionRequestAdminDetailSchema,
  permissionRequestOwnerDetailSchema,
} from '@fops/shared';
import type { PermissionRequestAdminDetail } from '@fops/shared';

export type AdminDetailFixtureOverrides = Partial<
  Pick<
    PermissionRequestAdminDetail,
    | 'requester'
    | 'effective_access'
    | 'administrative_authority'
    | 'matching_denies'
    | 'risk_indicators'
    | 'allowed_actions'
  >
>;

const selectedFields = {
  requested_object_type: null,
  requested_object_id: null,
  source_object_type: null,
  source_object_id: null,
  source_action_id: null,
  return_route_intent: '/home',
  source_summary: null,
  updated_at: '2026-10-13T00:00:00.000Z',
};

export function adminDetailFixture(
  row: AdminPermissionRequestRow,
  isRequester = false,
  policy: 'allowed' | 'forbidden' = 'allowed',
  overrides: AdminDetailFixtureOverrides = {},
) {
  return permissionRequestAdminDetailSchema.parse({
    ...selectedFields,
    ...row,
    requester: { id: row.requester_actor_id, display_name: '', role_level: 'user' },
    effective_access: {
      decision: { allow: false, reason: 'no_grant', requestable: null },
      scope: { kind: 'scoped', managed_system_ids: [] },
      expires_at: null,
      granted_managed_system_id: null,
    },
    administrative_authority: {
      capability: 'workspace.admin',
      allowed: true,
      is_requester: isRequester,
      permission_self_approval: policy,
      self_approval_required: isRequester,
    },
    approval_scope_candidates: [{ managed_system_id: row.requested_managed_system_id }],
    matching_denies: [],
    risk_indicators: [],
    allowed_actions:
      row.status === 'pending' || row.status === 'needs_more_info'
        ? ['approve', 'reject', 'need_more_info', 'deny']
        : [],
    ...overrides,
  });
}

export function ownerDetailFixture(status: 'pending' | 'needs_more_info' = 'pending') {
  return permissionRequestOwnerDetailSchema.parse({
    ...selectedFields,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    requester_actor_id: '11111111-1111-4111-8111-111111111111',
    requested_capability: 'finding.manage',
    requested_managed_system_id: null,
    reason: 'original reason',
    requested_expiration: '2099-12-31T23:59:59.000Z',
    status,
    revision: 7,
    created_at: '2026-10-12T00:00:00.000Z',
    latest_admin_question:
      status === 'needs_more_info'
        ? { note: '최신 질문입니다', created_at: '2026-10-13T00:00:00.000Z' }
        : null,
    editable_scope_candidates: [
      { managed_system_id: null },
      { managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    ],
    allowed_actions: [status === 'pending' ? 'edit' : 'supplement', 'withdraw'],
  });
}
