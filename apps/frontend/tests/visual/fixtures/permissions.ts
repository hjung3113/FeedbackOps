import { listActorsResponseSchema, permissionDecisionResultSchema } from '@fops/shared';
import { z } from 'zod';

import type { AdminPermissionRequestRow } from '../../../src/lib/api';
import { adminSettingsFixtureSchema } from './admin-settings';

// The permission-review visual scenario needs self-approval to remain decidable.
// Admin-settings scenarios retain their explicit forbidden fixture instead.
export const permissionSettingsFixture = adminSettingsFixtureSchema.parse({
  permission_self_approval: 'allowed',
  survey_anonymity_threshold: 9,
});

export const PERMISSION_IDS = {
  pendingSensitive: '11111111-1111-4111-8111-111111111111',
  pendingRead: '22222222-2222-4222-8222-222222222222',
  selfApproval: '88888888-8888-4888-8888-888888888888',
  needsMoreInfo: '33333333-3333-4333-8333-333333333333',
  approved: '44444444-4444-4444-8444-444444444444',
  rejected: '55555555-5555-4555-8555-555555555555',
  grant: '66666666-6666-4666-8666-666666666666',
  deny: '77777777-7777-4777-8777-777777777777',
} as const;

export const workspaceActorsFixture = listActorsResponseSchema.parse({
  actors: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      display_name: 'Named Requester',
      email: 'named.requester@example.test',
      role_level: 'developer',
    },
    {
      id: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      display_name: 'Admin One',
      email: 'admin.one@example.test',
      role_level: 'admin',
    },
    {
      id: '22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      display_name: 'Admin Two',
      email: 'admin.two@example.test',
      role_level: 'admin',
    },
  ],
});

export const permissionRequests: AdminPermissionRequestRow[] = [
  {
    id: PERMISSION_IDS.pendingSensitive,
    requester_actor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    requested_capability: 'workspace.admin',
    requested_managed_system_id: null,
    reason: '워크스페이스 설정을 검토해야 합니다.',
    status: 'pending',
    created_at: '2026-07-06T09:00:00.000Z',
  },
  {
    id: PERMISSION_IDS.pendingRead,
    requester_actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    requested_capability: 'workspace.read',
    requested_managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    reason: '운영 현황을 확인해야 합니다.',
    status: 'pending',
    created_at: '2026-07-05T09:00:00.000Z',
  },
  {
    id: PERMISSION_IDS.selfApproval,
    requester_actor_id: '22222222-2222-4222-8222-222222222222',
    requested_capability: 'task.self_approve_request',
    requested_managed_system_id: null,
    reason: '정시 release를 위해 self-approval 감사 캡처가 필요합니다.',
    status: 'pending',
    created_at: '2026-07-05T08:00:00.000Z',
  },
  {
    id: PERMISSION_IDS.needsMoreInfo,
    requester_actor_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    requested_capability: 'voc.triage',
    requested_managed_system_id: null,
    reason: '추가 검토 정보를 보완 중입니다.',
    status: 'needs_more_info',
    created_at: '2026-07-04T09:00:00.000Z',
  },
  {
    id: PERMISSION_IDS.approved,
    requester_actor_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    requested_capability: 'workspace.read',
    requested_managed_system_id: null,
    reason: '승인된 읽기 권한입니다.',
    status: 'approved',
    created_at: '2026-07-03T09:00:00.000Z',
  },
  {
    id: PERMISSION_IDS.rejected,
    requester_actor_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    requested_capability: 'finding.manage',
    requested_managed_system_id: null,
    reason: '거절된 삭제 권한입니다.',
    status: 'rejected',
    created_at: '2026-07-02T09:00:00.000Z',
  },
];

export const emptyPermissionRequests: AdminPermissionRequestRow[] = [];

// These schema-parsed templates keep mock decision responses contract-valid at fixture load.
export const permissionDecisionResultTemplates = {
  approve: permissionDecisionResultSchema.parse({
    id: PERMISSION_IDS.pendingRead,
    status: 'approved',
    grant_id: PERMISSION_IDS.grant,
  }),
  reject: permissionDecisionResultSchema.parse({
    id: PERMISSION_IDS.pendingRead,
    status: 'rejected',
  }),
  'need-more-info': permissionDecisionResultSchema.parse({
    id: PERMISSION_IDS.pendingRead,
    status: 'needs_more_info',
  }),
  deny: permissionDecisionResultSchema.parse({
    id: PERMISSION_IDS.pendingRead,
    status: 'rejected',
    deny_id: PERMISSION_IDS.deny,
  }),
};

export type PermissionScenarioName =
  | 'populated'
  | 'empty'
  | 'permission-request-detail-named'
  | 'blocked-contact-admin';

export const permissionVisualScenarios = z
  .array(z.enum(['permission-request-detail-named', 'blocked-contact-admin']))
  .parse(['permission-request-detail-named', 'blocked-contact-admin']);

export function createPermissionRequestsScenario(
  name: PermissionScenarioName = 'populated',
): AdminPermissionRequestRow[] {
  return structuredClone(name === 'empty' ? emptyPermissionRequests : permissionRequests);
}
