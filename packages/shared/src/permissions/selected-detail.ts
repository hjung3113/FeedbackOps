import { z } from 'zod';
import { permissionScopeCandidateSchema } from './submit-more-info.js';

const scopeSchema = z.object({ managed_system_id: z.string().uuid().nullable() }).strict();
export const permissionMatchingDenySchema = scopeSchema.extend({ id: z.string().uuid() });
export const permissionRiskIndicatorSchema = z.discriminatedUnion('code', [
  z
    .object({
      code: z.literal('sensitive_capability'),
      evidence: z.object({ capability: z.string().min(1) }).strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('workspace_scope'),
      evidence: z.object({ managed_system_id: z.null() }).strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('no_expiration'),
      evidence: z.object({ requested_expiration: z.null() }).strict(),
    })
    .strict(),
  z
    .object({
      code: z.literal('active_deny'),
      evidence: z.object({ denies: z.array(permissionMatchingDenySchema).nonempty() }).strict(),
    })
    .strict(),
]);
export type PermissionRiskIndicator = z.infer<typeof permissionRiskIndicatorSchema>;

// Source owners provide only authorized navigation metadata, never authored text or responses.
export const permissionSourceSummarySchema = z
  .object({
    type: z.enum(['voc', 'task']),
    id: z.string().uuid(),
    display_id: z.string().min(1),
    status: z.string().min(1),
  })
  .strict();
export type PermissionSourceSummary = z.infer<typeof permissionSourceSummarySchema>;

const permissionSelectedRequestSchema = z
  .object({
    id: z.string().uuid(),
    requester_actor_id: z.string().uuid(),
    requested_capability: z.string().min(1),
    requested_managed_system_id: z.string().uuid().nullable(),
    requested_object_type: z.string().nullable(),
    requested_object_id: z.string().uuid().nullable(),
    reason: z.string(),
    requested_expiration: z.string().datetime().nullable(),
    source_object_type: z.string().nullable(),
    source_object_id: z.string().uuid().nullable(),
    source_action_id: z.string().nullable(),
    return_route_intent: z.string().nullable(),
    source_summary: permissionSourceSummarySchema.nullable(),
    status: z.enum([
      'pending',
      'needs_more_info',
      'approved',
      'rejected',
      'cancelled',
      'expired',
      'revoked',
    ]),
    revision: z.number().int().positive(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export const permissionRequestOwnerDetailSchema = permissionSelectedRequestSchema.extend({
  latest_admin_question: z
    .object({ note: z.string().min(1), created_at: z.string().datetime() })
    .strict()
    .nullable(),
  editable_scope_candidates: z.array(permissionScopeCandidateSchema),
  allowed_actions: z.array(z.enum(['edit', 'supplement', 'withdraw'])),
});
export type PermissionRequestOwnerDetail = z.infer<typeof permissionRequestOwnerDetailSchema>;

const accessDecisionSchema = z.union([
  z
    .object({
      allow: z.literal(true),
      via: z.enum(['direct_grant', 'role', 'managed_system_scope']),
      grant_id: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      allow: z.literal(false),
      reason: z.enum([
        'workspace_mismatch',
        'explicit_deny',
        'no_grant',
        'grant_expired',
        'grant_revoked',
        'sensitive_reason_missing',
      ]),
      requestable: z
        .array(
          z
            .object({
              workspace_id: z.string().uuid(),
              managed_system_id: z.string().uuid().optional(),
            })
            .strict(),
        )
        .nullable(),
    })
    .strict(),
]);
export const permissionRequestAdminDetailSchema = permissionSelectedRequestSchema.extend({
  requester: z
    .object({
      id: z.string().uuid(),
      display_name: z.string(),
      role_level: z.enum(['admin', 'developer', 'user']),
    })
    .strict(),
  effective_access: z
    .object({
      decision: accessDecisionSchema,
      scope: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('all') }).strict(),
        z
          .object({ kind: z.literal('scoped'), managed_system_ids: z.array(z.string().uuid()) })
          .strict(),
      ]),
      expires_at: z.string().datetime().nullable(),
      granted_managed_system_id: z.string().uuid().nullable(),
    })
    .strict(),
  administrative_authority: z
    .object({
      capability: z.literal('workspace.admin'),
      allowed: z.literal(true),
      is_requester: z.boolean(),
      permission_self_approval: z.enum(['allowed', 'forbidden']),
      self_approval_required: z.boolean(),
    })
    .strict(),
  approval_scope_candidates: z.array(permissionScopeCandidateSchema),
  matching_denies: z.array(permissionMatchingDenySchema),
  risk_indicators: z.array(permissionRiskIndicatorSchema),
  allowed_actions: z.array(z.enum(['approve', 'reject', 'need_more_info', 'deny'])),
});
export type PermissionRequestAdminDetail = z.infer<typeof permissionRequestAdminDetailSchema>;
