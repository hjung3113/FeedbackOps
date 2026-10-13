// Permission Request audit detail schemas (Slice 1 #5).
// Each schema describes the `detail` payload for one Permission Request
// lifecycle event. Imported by audit-events.ts to register into
// AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

import { CAPABILITIES } from '../enums/capabilities.js';

export const PERMISSION_AUDIT_EVENT_TYPES = [
  'permission_requested',
  'permission_approved',
  'permission_rejected',
  'permission_needs_more_info',
  'permission_denied',
  'permission_more_info_submitted',
  'permission_request_updated',
  'permission_request_cancelled',
  'permission_revoked',
  'permission_deny_revoked',
  'permission_granted',
] as const;

// `permission_requested` detail shape — locked by issue #5 application
// service step 3. Optional fields are explicitly nullable so the audit row
// faithfully records what the request did or did not carry.
// `sensitive` is true when the requested capability is marked sensitive in
// CAPABILITY_META (per policy doc 05-permission-policy.md ## Sensitive Permissions).
export const permissionRequestedDetailSchema = z.object({
  revision: z.number().int().positive(),
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
    previous_revision: z.number().int().positive(),
    revision: z.number().int().positive(),
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    requester_actor_id: z.string().uuid(),
    reason: z.string().min(1).nullable(),
    requested_managed_system_id: z.string().uuid().nullable(),
    granted_managed_system_id: z.string().uuid().nullable(),
    grant_id: z.string().uuid(),
    previous_grant_id: z.string().uuid().optional(),
    requested_expiration: z.string().datetime().nullable(),
    granted_expiration: z.string().datetime().nullable(),
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
    previous_revision: z.number().int().positive(),
    revision: z.number().int().positive(),
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    requester_actor_id: z.string().uuid(),
    reason: z.string().min(1),
  })
  .strict();
export type PermissionRejectedDetail = z.infer<typeof permissionRejectedDetailSchema>;

export const permissionNeedsMoreInfoDetailSchema = z
  .object({
    previous_revision: z.number().int().positive(),
    revision: z.number().int().positive(),
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    requester_actor_id: z.string().uuid(),
    note: z.string().min(1),
  })
  .strict();
export type PermissionNeedsMoreInfoDetail = z.infer<typeof permissionNeedsMoreInfoDetailSchema>;

export const permissionDeniedDetailSchema = z
  .object({
    previous_revision: z.number().int().positive(),
    revision: z.number().int().positive(),
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    requester_actor_id: z.string().uuid(),
    reason: z.string().min(1),
    deny_id: z.string().uuid(),
  })
  .strict();
export type PermissionDeniedDetail = z.infer<typeof permissionDeniedDetailSchema>;

export const permissionMoreInfoPreviousSchema = z
  .object({
    reason: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    requested_object_type: z.string().nullable(),
    requested_object_id: z.string().uuid().nullable(),
    requested_expiration: z.string().datetime().nullable(),
  })
  .strict();

export const permissionMoreInfoSubmittedDetailSchema = z
  .object({
    previous_revision: z.number().int().positive(),
    revision: z.number().int().positive(),
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    requester_actor_id: z.string().uuid(),
    reason: z.string().min(1),
    sensitive: z.boolean(),
    requested_object_type: z.string().nullable(),
    requested_object_id: z.string().uuid().nullable(),
    requested_expiration: z.string().datetime().nullable(),
    previous: permissionMoreInfoPreviousSchema,
  })
  .strict();
export type PermissionMoreInfoSubmittedDetail = z.infer<
  typeof permissionMoreInfoSubmittedDetailSchema
>;

export const permissionRequestUpdatedDetailSchema = z
  .object({
    capability: z.string().min(1),
    requester_actor_id: z.string().uuid(),
    previous_revision: z.number().int().positive(),
    revision: z.number().int().positive(),
    previous: permissionMoreInfoPreviousSchema,
    resulting: permissionMoreInfoPreviousSchema,
  })
  .strict();
export const permissionRequestCancelledDetailSchema = z
  .object({
    capability: z.string().min(1),
    requester_actor_id: z.string().uuid(),
    managed_system_id: z.string().uuid().nullable(),
    requested_object_type: z.string().nullable(),
    requested_object_id: z.string().uuid().nullable(),
    previous_status: z.enum(['pending', 'needs_more_info']),
    previous_revision: z.number().int().positive(),
    revision: z.number().int().positive(),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export const permissionRevokedDetailSchema = z
  .object({
    grant_id: z.string().uuid(),
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    grantee_actor_id: z.string().uuid(),
    reason: z.string().min(1),
  })
  .strict();
export type PermissionRevokedDetail = z.infer<typeof permissionRevokedDetailSchema>;

export const permissionDenyRevokedDetailSchema = z
  .object({
    deny_id: z.string().uuid(),
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    denied_actor_id: z.string().uuid(),
    reason: z.string().min(1),
    self_lift: z.literal(true).optional(),
  })
  .strict();
export type PermissionDenyRevokedDetail = z.infer<typeof permissionDenyRevokedDetailSchema>;

export const permissionGrantedDetailSchema = z
  .object({
    grant_id: z.string().uuid(),
    grantee_actor_id: z.string().uuid(),
    capability: z.enum(CAPABILITIES),
    managed_system_id: z.string().uuid().nullable(),
    reason: z.string().trim().min(1).max(2000),
    expires_at: z.string().datetime().nullable(),
    mode: z.enum(['create', 'reissue']),
    previous_grant_id: z.string().uuid().optional(),
    self_grant: z.literal(true).optional(),
    self_approval: z
      .object({
        policy_citation: z.string().trim().min(1),
        peer_reviewer_absence: z.string().trim().min(1),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((detail, ctx) => {
    if ((detail.mode === 'reissue') !== (detail.previous_grant_id !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['previous_grant_id'],
        message: 'reissue requires predecessor',
      });
    }
    if ((detail.self_grant === true) !== (detail.self_approval !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['self_approval'],
        message: 'self grant requires envelope',
      });
    }
  });
export type PermissionGrantedDetail = z.infer<typeof permissionGrantedDetailSchema>;
export const PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS = {
  permission_requested: permissionRequestedDetailSchema,
  permission_approved: permissionApprovedDetailSchema,
  permission_rejected: permissionRejectedDetailSchema,
  permission_needs_more_info: permissionNeedsMoreInfoDetailSchema,
  permission_denied: permissionDeniedDetailSchema,
  permission_more_info_submitted: permissionMoreInfoSubmittedDetailSchema,
  permission_request_updated: permissionRequestUpdatedDetailSchema,
  permission_request_cancelled: permissionRequestCancelledDetailSchema,
  permission_revoked: permissionRevokedDetailSchema,
  permission_deny_revoked: permissionDenyRevokedDetailSchema,
  permission_granted: permissionGrantedDetailSchema,
} as const satisfies Record<(typeof PERMISSION_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
