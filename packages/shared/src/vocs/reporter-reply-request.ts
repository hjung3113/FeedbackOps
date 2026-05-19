import { z } from 'zod';

import { tipTapDocSchema } from './create-request.js';

// Minimal attachment reference for the wire boundary.
// Attachment upload ships in Slice 3 #22; value-layer rejects non-empty arrays
// until then (service raises attachment.unsupported_pending_storage_slice).
const attachmentRefSchema = z.object({ id: z.string().uuid() });

export const reporterReplyRequestSchema = z.object({
  body_rich_content: tipTapDocSchema,
  attachments: z.array(attachmentRefSchema).optional(),
});

export type ReporterReplyRequest = z.infer<typeof reporterReplyRequestSchema>;
