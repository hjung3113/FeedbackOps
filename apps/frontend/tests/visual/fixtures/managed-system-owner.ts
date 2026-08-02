import { listActorsResponseSchema } from '@fops/shared';
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
    },
  ],
});

export const registerManagedSystemVisualBodySchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    external_key: z.string().nullable().optional(),
    default_owner_actor_id: z.string().uuid().optional(),
    default_owner_team_id: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (body) => !(body.default_owner_actor_id && body.default_owner_team_id),
    'default owner actor and team are mutually exclusive',
  );

export const managedSystemVisualSchema = z.object({
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
}).strict();

export const managedSystemOwnerList = z
  .object({
    items: z.array(managedSystemVisualSchema),
    total: z.number().int().nonnegative(),
  }).strict()
  .parse({
    items: [],
    total: 0,
  });
