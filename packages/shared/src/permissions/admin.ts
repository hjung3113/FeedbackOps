import { z } from 'zod';

import { CAPABILITIES } from '../enums/capabilities.js';

export const permissionGrantAdminItemSchema = z
  .object({
    id: z.string().uuid(),
    actor_id: z.string().uuid(),
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    granted_by_actor_id: z.string().uuid(),
    granted_at: z.string().datetime(),
    expires_at: z.string().datetime().nullable(),
  })
  .strict();
export type PermissionGrantAdminItem = z.infer<typeof permissionGrantAdminItemSchema>;

export const permissionDenyAdminItemSchema = z
  .object({
    id: z.string().uuid(),
    actor_id: z.string().uuid(),
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    reason: z.string().min(1),
    created_by_actor_id: z.string().uuid(),
    created_at: z.string().datetime(),
  })
  .strict();
export type PermissionDenyAdminItem = z.infer<typeof permissionDenyAdminItemSchema>;

export const listPermissionGrantsResponseSchema = z
  .object({ items: z.array(permissionGrantAdminItemSchema) })
  .strict();
export type ListPermissionGrantsResponse = z.infer<typeof listPermissionGrantsResponseSchema>;

export const listPermissionDeniesResponseSchema = z
  .object({ items: z.array(permissionDenyAdminItemSchema) })
  .strict();
export type ListPermissionDeniesResponse = z.infer<typeof listPermissionDeniesResponseSchema>;

export const directPermissionGrantSchema = z
  .object({
    actor_id: z.string().uuid(),
    capability: z.enum(CAPABILITIES),
    managed_system_id: z.string().uuid().optional(),
    expires_at: z.string().datetime().optional(),
    reason: z.string().trim().min(1).max(2000),
    self_approval: z
      .object({
        policy_citation: z.string().trim().min(1),
        peer_reviewer_absence: z.string().trim().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DirectPermissionGrant = z.infer<typeof directPermissionGrantSchema>;

export const permissionGrantPreflightSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('available') }).strict(),
  z
    .object({
      state: z.literal('request_review'),
      request_id: z.string().uuid(),
      review_route: z.string().min(1),
    })
    .strict(),
  z
    .object({
      state: z.literal('deny_lift'),
      deny_ids: z.array(z.string().uuid()).min(1),
      lift_route: z.string().min(1),
    })
    .strict(),
]);
export type PermissionGrantPreflight = z.infer<typeof permissionGrantPreflightSchema>;

export const permissionGrantOptionsSchema = z
  .object({
    recipient: z
      .object({
        id: z.string().uuid(),
        display_name: z.string(),
        role_level: z.enum(['admin', 'developer', 'user']),
      })
      .strict(),
    self_policy: z.enum(['allowed', 'forbidden']),
    self_approval_required: z.boolean(),
    candidates: z.array(
      z
        .object({
          capability: z.enum(CAPABILITIES),
          managed_system_id: z.string().uuid().nullable(),
          governance_required: z.boolean(),
          preflight: permissionGrantPreflightSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type PermissionGrantOptions = z.infer<typeof permissionGrantOptionsSchema>;
