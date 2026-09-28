import { z } from 'zod';

export const submitMoreInfoPermissionRequestSchema = z
  .object({
    reason: z.string().min(1).max(2000).optional(),
    requested_managed_system_id: z.string().uuid().nullable().optional(),
    requested_object_type: z.string().min(1).nullable().optional(),
    requested_object_id: z.string().uuid().nullable().optional(),
    requested_expiration: z.string().datetime().nullable().optional(),
  })
  .strict();

export const submitMoreInfoPermissionRequestResultSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('pending'),
    updated_at: z.string().datetime(),
  })
  .strict();

export type SubmitMoreInfoPermissionRequest = z.infer<
  typeof submitMoreInfoPermissionRequestSchema
>;
export type SubmitMoreInfoPermissionRequestResult = z.infer<
  typeof submitMoreInfoPermissionRequestResultSchema
>;
