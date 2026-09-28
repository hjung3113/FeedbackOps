import { z } from 'zod';

export const VOC_CREATE_IDS = {
  workspace: '29300000-0000-4000-8000-000000000001',
  actor: '29300000-0000-4000-8000-000000000002',
  managedSystem: '29300000-0000-4000-8000-000000000003',
  analyticsArea: '29300000-0000-4000-8000-000000000004',
  firstPeer: '29300000-0000-4000-8000-000000000005',
  secondPeer: '29300000-0000-4000-8000-000000000006',
} as const;

const managedSystemSchema = z.object({
  id: z.string().uuid(), workspace_id: z.string().uuid(), slug: z.string(), name: z.string(),
  external_key: z.string().nullable(), default_owner_actor_id: z.string().uuid().nullable(),
  default_owner_team_id: z.string().uuid().nullable(), archived_at: z.string().datetime().nullable(),
  archived_by_actor_id: z.string().uuid().nullable(), created_at: z.string().datetime(), updated_at: z.string().datetime(),
}).strict();
const analyticsAreaSchema = z.object({
  id: z.string().uuid(), workspace_id: z.string().uuid(), managed_system_id: z.string().uuid(), slug: z.string(), name: z.string(),
  owner_team_id: z.string().uuid().nullable(), archived_at: z.string().datetime().nullable(), archived_by_actor_id: z.string().uuid().nullable(), created_at: z.string().datetime(), updated_at: z.string().datetime(),
}).strict();
const peerSchema = z.object({ id: z.string().uuid(), display_id: z.string(), title: z.string(), created_at: z.string().datetime() }).strict();

export const vocCreateManagedSystems = z.object({ items: z.array(managedSystemSchema), total: z.number().int() }).strict().parse({
  items: [{ id: VOC_CREATE_IDS.managedSystem, workspace_id: VOC_CREATE_IDS.workspace, slug: 'tableau', name: 'Tableau', external_key: null, default_owner_actor_id: null, default_owner_team_id: null, archived_at: null, archived_by_actor_id: null, created_at: '2026-07-18T00:00:00.000Z', updated_at: '2026-07-18T00:00:00.000Z' }],
  total: 1,
});

export const vocCreateAnalyticsAreas = z.object({ items: z.array(analyticsAreaSchema), total: z.number().int() }).strict().parse({
  items: [{ id: VOC_CREATE_IDS.analyticsArea, workspace_id: VOC_CREATE_IDS.workspace, managed_system_id: VOC_CREATE_IDS.managedSystem, slug: 'revenue', name: 'Revenue', owner_team_id: null, archived_at: null, archived_by_actor_id: null, created_at: '2026-07-18T00:00:00.000Z', updated_at: '2026-07-18T00:00:00.000Z' }],
  total: 1,
});

// Keyed by `string`, not by the literal id: the mock reads the id off the
// request query, where it is an arbitrary string.
export const vocCreatePeersByManagedSystem = new Map<string, { items: z.infer<typeof peerSchema>[] }>([[VOC_CREATE_IDS.managedSystem, z.object({ items: z.array(peerSchema) }).strict().parse({
  items: [
    { id: VOC_CREATE_IDS.firstPeer, display_id: 'VOC-2931', title: 'Tableau 새로고침 실패', created_at: '2026-07-20T08:00:00.000Z' },
    { id: VOC_CREATE_IDS.secondPeer, display_id: 'VOC-2932', title: '대시보드 알림 지연', created_at: '2026-07-19T08:00:00.000Z' },
  ],
})]]);
