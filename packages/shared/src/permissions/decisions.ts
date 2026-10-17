import { z } from 'zod';

const optionalReasonSchema = z
  .object({
    expected_revision: z.number().int().positive(),
    reason: z.string().max(2000).optional(),
  })
  .strict();

export const approvePermissionRequestSchema = z
  .object({
    expected_revision: z.number().int().positive(),
    granted_managed_system_id: z.string().uuid().nullable().optional(),
    reason: z.string().max(2000).optional(),
    expiration: z.string().datetime().nullable().optional(),
    self_approval: z
      .object({
        policy_citation: z.string().min(1),
        peer_reviewer_absence: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
// Decision reason requirements are domain validation, not transport validation:
// the service trims and returns the ADR-0012 validation.* envelope (422).
export const rejectPermissionRequestSchema = optionalReasonSchema;
export const denyPermissionRequestSchema = optionalReasonSchema;
export const needMoreInfoPermissionRequestSchema = z
  .object({ expected_revision: z.number().int().positive(), note: z.string().max(2000).optional() })
  .strict();

export const permissionDecisionResultSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    status: z.enum(['approved', 'rejected', 'needs_more_info']),
    updated_at: z.string().datetime(),
    requested_managed_system_id: z.string().uuid().nullable().optional(),
    granted_managed_system_id: z.string().uuid().nullable().optional(),
    requested_expiration: z.string().datetime().nullable().optional(),
    granted_expiration: z.string().datetime().nullable().optional(),
    grant_id: z.string().uuid().optional(),
    deny_id: z.string().uuid().optional(),
  })
  .strict();

export const revokePermissionBodySchema = z
  .object({ reason: z.string().trim().min(1).max(2000) })
  .strict();

// POST /permission-requests body. Shared so the FE request-dialog tests can
// parse the posted payload against the exact transport contract the route
// validates (#1170).
export const createPermissionRequestSchema = z
  .object({
    requested_capability: z.string().min(1),
    requested_managed_system_id: z.string().uuid().optional(),
    requested_object_type: z.string().min(1).optional(),
    requested_object_id: z.string().uuid().optional(),
    reason: z.string().min(1).max(2000),
    requested_expiration: z.string().datetime().optional(),
    source_object_type: z.string().min(1).optional(),
    source_object_id: z.string().uuid().optional(),
    source_action_id: z.string().min(1).optional(),
    return_route_intent: z.string().min(1).optional(),
  })
  .strict();

export const revokePermissionResultSchema = z
  .object({ id: z.string().uuid(), revoked_at: z.string().datetime() })
  .strict();

export type ApprovePermissionRequest = z.infer<typeof approvePermissionRequestSchema>;
export type RejectPermissionRequest = z.infer<typeof rejectPermissionRequestSchema>;
export type DenyPermissionRequest = z.infer<typeof denyPermissionRequestSchema>;
export type NeedMoreInfoPermissionRequest = z.infer<typeof needMoreInfoPermissionRequestSchema>;
export type PermissionDecisionResult = z.infer<typeof permissionDecisionResultSchema>;
export type RevokePermissionBody = z.infer<typeof revokePermissionBodySchema>;
export type RevokePermissionResult = z.infer<typeof revokePermissionResultSchema>;
export type CreatePermissionRequest = z.infer<typeof createPermissionRequestSchema>;
