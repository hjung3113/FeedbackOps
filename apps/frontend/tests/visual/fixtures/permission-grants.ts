import {
  permissionDenyAdminItemSchema,
  permissionGrantAdminItemSchema,
  permissionGrantOptionsSchema,
} from '@fops/shared';

export const PERMISSION_GRANTS_IDS = {
  grant: '66666666-6666-4666-8666-666666666666',
  deny: '77777777-7777-4777-8777-777777777777',
  actor: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  denyActor: '22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  admin: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
} as const;

export const permissionGrants = [
  permissionGrantAdminItemSchema.parse({
    id: PERMISSION_GRANTS_IDS.grant,
    actor_id: PERMISSION_GRANTS_IDS.actor,
    capability: 'voc.triage',
    managed_system_id: null,
    granted_by_actor_id: PERMISSION_GRANTS_IDS.admin,
    granted_at: '2026-07-05T09:00:00.000Z',
    expires_at: '2026-12-31T23:59:59.000Z',
  }),
];

export const permissionDenies = [
  permissionDenyAdminItemSchema.parse({
    id: PERMISSION_GRANTS_IDS.deny,
    actor_id: PERMISSION_GRANTS_IDS.denyActor,
    capability: 'finding.manage',
    managed_system_id: null,
    reason: '외부 공유를 제한해야 합니다.',
    created_by_actor_id: PERMISSION_GRANTS_IDS.admin,
    created_at: '2026-07-04T09:00:00.000Z',
  }),
];

export const directGrantPermissionOptions = permissionGrantOptionsSchema.parse({
  recipient: {
    id: PERMISSION_GRANTS_IDS.actor,
    display_name: 'Named Requester',
    role_level: 'developer',
  },
  self_policy: 'allowed',
  self_approval_required: false,
  candidates: [
    {
      capability: 'workspace.admin',
      managed_system_id: null,
      governance_required: true,
      preflight: { state: 'available' },
    },
  ],
});

export type PermissionGrantsScenarioName = 'populated' | 'empty' | 'direct-grant-form';

export function createPermissionGrantsScenario(name: PermissionGrantsScenarioName = 'populated') {
  return {
    grants: structuredClone(name === 'empty' ? [] : permissionGrants),
    denies: structuredClone(name === 'empty' ? [] : permissionDenies),
  };
}
