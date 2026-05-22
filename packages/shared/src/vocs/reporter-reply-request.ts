import { z } from 'zod';

import { attachmentIdsSchema, tipTapDocSchema } from './create-request.js';

// PLAN-22 C7b: wire shape is `attachment_ids: string[]` (UUIDs referencing
// pre-uploaded voc.voc_attachments rows linked to the new reporter reply).
// The legacy slice-3 deferral (`attachment.unsupported_pending_storage_slice`)
// has been retired now that the storage slice (PLAN-22 C3a/C3b) ships.
export const reporterReplyRequestSchema = z
  .object({
    body_rich_content: tipTapDocSchema,
    attachment_ids: attachmentIdsSchema.optional(),
  })
  .strict();

export type ReporterReplyRequest = z.infer<typeof reporterReplyRequestSchema>;
