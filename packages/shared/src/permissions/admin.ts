import { z } from 'zod';

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
