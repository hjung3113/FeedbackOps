import { z } from 'zod';

/**
 * POST /attachments 201 envelope (Slice 3 #22 / PLAN-22 C3b).
 *
 * Strict shape: backend returns exactly these fields after a successful
 * multipart upload. `storage_uri` is intentionally NOT exposed to the
 * frontend — clients reference attachments by `id` only and resolve
 * downloads through the GET attachment endpoint (C4a).
 *
 * Distinct from `AttachmentRef` (vocs/create-request.ts) which is the
 * VOC-create request payload shape (includes `storage_uri` server-side
 * before C3b landed; will be reconciled in a later chunk).
 */
export const AttachmentCreatedSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    size_bytes: z.number().int().nonnegative(),
    mime_type: z.string().min(1),
    uploaded_by_actor_id: z.string().uuid(),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type AttachmentCreated = z.infer<typeof AttachmentCreatedSchema>;
