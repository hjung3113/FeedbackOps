import { z } from 'zod';

export const permissionRequestComposeVisualScenario = z
  .literal('permission-request-compose')
  .parse('permission-request-compose');

export const permissionRequestComposeBodySchema = z.object({
  requested_capability: z.string().min(1),
  requested_managed_system_id: z.string().uuid().optional(),
  reason: z.string().min(1).max(2000),
  requested_expiration: z.string().datetime().optional(),
  return_route_intent: z.string().min(1),
}).strict();

export const permissionRequestComposeSuccess = z
  .object({
    id: z.string().min(1),
    status: z.literal('pending'),
    created_at: z.string().datetime(),
  }).strict()
  .parse({
    id: 'PR-VISUAL-D8',
    status: 'pending',
    created_at: '2026-08-03T09:30:00.000Z',
  });
