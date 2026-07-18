import { z } from 'zod';

const optionalReasonSchema = z.object({ reason: z.string().max(2000).optional() }).strict();

export const approvePermissionRequestSchema = optionalReasonSchema;
// Decision reason requirements are domain validation, not transport validation:
// the service trims and returns the ADR-0012 validation.* envelope (422).
export const rejectPermissionRequestSchema = optionalReasonSchema;
export const denyPermissionRequestSchema = optionalReasonSchema;
export const needMoreInfoPermissionRequestSchema = z
  .object({ note: z.string().max(2000).optional() })
  .strict();

export const permissionDecisionResultSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['approved', 'rejected', 'needs_more_info']),
    grant_id: z.string().uuid().optional(),
    deny_id: z.string().uuid().optional(),
  })
  .strict();

export type ApprovePermissionRequest = z.infer<typeof approvePermissionRequestSchema>;
export type RejectPermissionRequest = z.infer<typeof rejectPermissionRequestSchema>;
export type DenyPermissionRequest = z.infer<typeof denyPermissionRequestSchema>;
export type NeedMoreInfoPermissionRequest = z.infer<typeof needMoreInfoPermissionRequestSchema>;
export type PermissionDecisionResult = z.infer<typeof permissionDecisionResultSchema>;
