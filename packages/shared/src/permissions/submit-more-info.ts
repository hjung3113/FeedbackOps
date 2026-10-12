import { z } from 'zod';

export const submitMoreInfoPermissionRequestSchema = z
  .object({
    expected_revision: z.number().int().positive(),
    reason: z.string().min(1).max(2000).optional(),
    requested_managed_system_id: z.string().uuid().nullable().optional(),
    requested_expiration: z.string().datetime().nullable().optional(),
  })
  .strict();

export const submitMoreInfoPermissionRequestResultSchema = z
  .object({
    revision: z.number().int().positive(),
    id: z.string().uuid(),
    status: z.literal('pending'),
    updated_at: z.string().datetime(),
  })
  .strict();

export type SubmitMoreInfoPermissionRequest = z.infer<typeof submitMoreInfoPermissionRequestSchema>;
export type SubmitMoreInfoPermissionRequestResult = z.infer<
  typeof submitMoreInfoPermissionRequestResultSchema
>;

export const editPermissionRequestSchema = submitMoreInfoPermissionRequestSchema;
export const cancelPermissionRequestSchema = z
  .object({
    expected_revision: z.number().int().positive(),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();
export const cancelPermissionRequestResultSchema =
  submitMoreInfoPermissionRequestResultSchema.extend({
    status: z.literal('cancelled'),
  });
export type EditPermissionRequest = z.infer<typeof editPermissionRequestSchema>;
export type CancelPermissionRequest = z.infer<typeof cancelPermissionRequestSchema>;
export type CancelPermissionRequestResult = z.infer<typeof cancelPermissionRequestResultSchema>;
export const permissionScopeCandidateSchema = z
  .object({
    managed_system_id: z.string().uuid().nullable(),
  })
  .strict();
export type PermissionScopeCandidate = z.infer<typeof permissionScopeCandidateSchema>;
