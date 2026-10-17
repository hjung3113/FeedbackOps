import {
  listActorsResponseSchema,
  managedSystemDefaultCandidatesSchema,
  managedSystemDefaultDiagnosticsSchema,
} from '@fops/shared';
import { z } from 'zod';

export const managedSystemOwnerVisualScenario = z
  .literal('ms-register-with-owner')
  .parse('ms-register-with-owner');

export const managedSystemOwnerActors = listActorsResponseSchema.parse({
  actors: [
    {
      id: '11111111-1111-4111-8111-111111111274',
      display_name: 'Default Owner Visual Name',
      email: 'visual-email-must-not-render@example.test',
      role_level: 'developer',
      actor_type: 'internal_member',
    },
  ],
});

export const registerManagedSystemVisualBodySchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    external_key: z.string().nullable().optional(),
    default_owner_actor_id: z.string().uuid().nullable().optional(),
    default_owner_team_id: z.string().uuid().nullable().optional(),
    default_reviewer_actor_id: z.string().uuid().nullable().optional(),
    default_reviewer_team_id: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine(
    (body) => !(body.default_owner_actor_id && body.default_owner_team_id),
    'default owner actor and team are mutually exclusive',
  )
  .refine(
    (body) => !(body.default_reviewer_actor_id && body.default_reviewer_team_id),
    'default reviewer actor and team are mutually exclusive',
  );

export const managedSystemVisualSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    external_key: z.string().nullable(),
    default_owner_actor_id: z.string().uuid().nullable(),
    default_owner_team_id: z.string().uuid().nullable(),
    default_reviewer_actor_id: z.string().uuid().nullable(),
    default_reviewer_team_id: z.string().uuid().nullable(),
    archived_at: z.string().datetime().nullable(),
    archived_by_actor_id: z.string().uuid().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export const managedSystemOwnerList = z
  .object({
    items: z.array(managedSystemVisualSchema),
    total: z.number().int().nonnegative(),
  })
  .strict()
  .parse({
    items: [],
    total: 0,
  });

export const managedSystemOwnerCandidates = managedSystemDefaultCandidatesSchema.parse({
  owners: managedSystemOwnerActors.actors.map(({ id, display_name }) => ({
    id,
    display_name,
    eligible: true,
  })),
  reviewers: managedSystemOwnerActors.actors.map(({ id, display_name }) => ({
    id,
    display_name,
    eligible: true,
  })),
});

export const managedSystemDiagnosticsList = {
  items: [
    managedSystemVisualSchema.parse({
      id: '22222222-2222-4222-8222-222222221146',
      workspace_id: '33333333-3333-4333-8333-333333331146',
      slug: 'diagnostics-system',
      name: 'Analytics Operations Managed System',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
      default_reviewer_actor_id: null,
      default_reviewer_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: '2026-07-18T00:00:00.000Z',
      updated_at: '2026-07-18T00:00:00.000Z',
    }),
  ],
  total: 1,
};

export const managedSystemDiagnostics = managedSystemDefaultDiagnosticsSchema.parse({
  items: [
    {
      managed_system_id: '22222222-2222-4222-8222-222222221146',
      workflow: 'voc',
      responsibility: 'owner',
      rule: 'managed_system_owner',
      category: 'missing',
      origin: 'configuration',
      count: 1,
      last_failed_at: null,
    },
    ...(['managed_system_reviewer', 'managed_system_owner', 'analytics_area_owner'] as const).map(
      (rule) => ({
        managed_system_id: '22222222-2222-4222-8222-222222221146',
        workflow: 'task_request',
        responsibility: 'reviewer',
        rule,
        category: rule === 'analytics_area_owner' ? 'archived_team' : 'ineligible_actor',
        origin: 'creation_failure',
        count: 12,
        last_failed_at: '2026-07-20T08:45:00.000Z',
      }),
    ),
  ],
});
