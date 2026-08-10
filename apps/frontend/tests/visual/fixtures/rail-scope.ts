import { z } from 'zod';

const railScopeManagedSystemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      workspace_id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      external_key: z.string().nullable(),
      default_owner_actor_id: z.string().uuid().nullable(),
      default_owner_team_id: z.string().uuid().nullable(),
      archived_at: z.string().datetime().nullable(),
      archived_by_actor_id: z.string().uuid().nullable(),
      created_at: z.string().datetime(),
      updated_at: z.string().datetime(),
    }),
  ),
  total: z.number().int().nonnegative(),
});

export const railScopeManagedSystems = railScopeManagedSystemsSchema.parse({
  items: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      workspace_id: '11111111-1111-4111-8111-111111111111',
      slug: 'identity',
      name: 'Identity Platform',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: '2026-01-15T09:00:00.000Z',
      updated_at: '2026-01-16T10:30:00.000Z',
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      workspace_id: '11111111-1111-4111-8111-111111111111',
      slug: 'finance',
      name: 'Finance Analytics',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: '2026-01-15T09:00:00.000Z',
      updated_at: '2026-01-16T10:30:00.000Z',
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      workspace_id: '11111111-1111-4111-8111-111111111111',
      slug: 'sales',
      name: 'Sales Operations',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: '2026-01-15T09:00:00.000Z',
      updated_at: '2026-01-16T10:30:00.000Z',
    },
  ],
  total: 3,
});

export const railScopeSnapshots = [
  'rail-scope-voc.png',
  'rail-scope-options.png',
  'rail-scope-saved-views.png',
  'rail-scope-granted-partial.png',
] as const;
