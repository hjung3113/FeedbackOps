// Permission Request audit detail schemas (Slice 1 #5).
// Each schema describes the `detail` payload for one Permission Request
// lifecycle event. Imported by audit-events.ts to register into
// AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

export const PERMISSION_AUDIT_EVENT_TYPES = [
  'permission_requested',
  'permission_approved',
  'permission_rejected',
  'permission_needs_more_info',
  'permission_denied',
] as const;

// `permission_requested` detail shape — locked by issue #5 application
// service step 3. Optional fields are explicitly nullable so the audit row
// faithfully records what the request did or did not carry.
// `sensitive` is true when the requested capability is marked sensitive in
// CAPABILITY_META (per policy doc 05-permission-policy.md ## Sensitive Permissions).
export const permissionRequestedDetailSchema = z.object({
  capability: z.string().min(1),
  managed_system_id: z.string().uuid().nullable(),
  reason: z.string().min(1),
  sensitive: z.boolean(),
  source_object_type: z.string().nullable(),
  source_object_id: z.string().uuid().nullable(),
  source_action_id: z.string().nullable(),
});
export type PermissionRequestedDetail = z.infer<typeof permissionRequestedDetailSchema>;

export const permissionApprovedDetailSchema = z
  .object({
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    requester_actor_id: z.string().uuid(),
    reason: z.string().min(1).nullable(),
    grant_id: z.string().uuid(),
    self_approval: z
      .object({
        policy_citation: z.string().min(1),
        peer_reviewer_absence: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type PermissionApprovedDetail = z.infer<typeof permissionApprovedDetailSchema>;

export const permissionRejectedDetailSchema = z
  .object({
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    requester_actor_id: z.string().uuid(),
    reason: z.string().min(1),
  })
  .strict();
export type PermissionRejectedDetail = z.infer<typeof permissionRejectedDetailSchema>;

export const permissionNeedsMoreInfoDetailSchema = z
  .object({
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    requester_actor_id: z.string().uuid(),
    note: z.string().min(1),
  })
  .strict();
export type PermissionNeedsMoreInfoDetail = z.infer<typeof permissionNeedsMoreInfoDetailSchema>;

export const permissionDeniedDetailSchema = z
  .object({
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    requester_actor_id: z.string().uuid(),
    reason: z.string().min(1),
    deny_id: z.string().uuid(),
  })
  .strict();
export type PermissionDeniedDetail = z.infer<typeof permissionDeniedDetailSchema>;

export const PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS = {
  permission_requested: permissionRequestedDetailSchema,
  permission_approved: permissionApprovedDetailSchema,
  permission_rejected: permissionRejectedDetailSchema,
  permission_needs_more_info: permissionNeedsMoreInfoDetailSchema,
  permission_denied: permissionDeniedDetailSchema,
} as const satisfies Record<(typeof PERMISSION_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
