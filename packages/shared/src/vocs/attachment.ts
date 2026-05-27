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

/**
 * Read-side shape for a linked attachment on a VOC envelope or on a
 * `ConversationEntry`. Distinct from `AttachmentCreated` (write-side 201
 * envelope) and from the legacy `AttachmentRef` (audit-payload shape that
 * still carries `storage_uri`).
 *
 * `linked_at` is the timestamp the attachment was attached to the parent
 * (set by the `linkAttachments` repo call at link time). `created_at` is the
 * upload time. `storage_uri` / `storage_key` are intentionally NOT exposed —
 * clients reference attachments by `id` and resolve downloads through
 * `GET /attachments/:id/download`.
 *
 * `archived_at`-NULL rows only (filtered server-side).
 */
export const LinkedAttachmentSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    size_bytes: z.number().int().nonnegative(),
    mime_type: z.string().min(1),
    uploaded_by_actor_id: z.string().uuid(),
    created_at: z.string().datetime({ offset: true }),
    linked_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type LinkedAttachment = z.infer<typeof LinkedAttachmentSchema>;
