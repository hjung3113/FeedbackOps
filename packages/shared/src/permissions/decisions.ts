import { z } from "zod";

const optionalReasonSchema = z
  .object({ reason: z.string().max(2000).optional() })
  .strict();
const requiredReasonSchema = z
  .object({ reason: z.string().min(1).max(2000) })
  .strict();

export const approvePermissionRequestSchema = optionalReasonSchema;
export const rejectPermissionRequestSchema = requiredReasonSchema;
export const denyPermissionRequestSchema = requiredReasonSchema;
export const needMoreInfoPermissionRequestSchema = z
  .object({ note: z.string().min(1).max(2000) })
  .strict();

export const permissionDecisionResultSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["approved", "rejected", "needs_more_info"]),
    grant_id: z.string().uuid().optional(),
    deny_id: z.string().uuid().optional(),
  })
  .strict();

export type ApprovePermissionRequest = z.infer<
  typeof approvePermissionRequestSchema
>;
export type RejectPermissionRequest = z.infer<
  typeof rejectPermissionRequestSchema
>;
export type DenyPermissionRequest = z.infer<typeof denyPermissionRequestSchema>;
export type NeedMoreInfoPermissionRequest = z.infer<
  typeof needMoreInfoPermissionRequestSchema
>;
export type PermissionDecisionResult = z.infer<
  typeof permissionDecisionResultSchema
>;
