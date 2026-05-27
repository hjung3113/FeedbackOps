import { z } from 'zod';

import { attachmentIdsSchema, tipTapDocSchema } from './create-request.js';
import { reporterFacingStatusEnumSchema } from './list-item.js';

// shape A / B — body present, skip_public_update=false.
// shape A = status change (next !== current, validated server-side).
// shape B = body-only (next === current, classified server-side — same zod shape as A).
//
// PLAN-22 C7b: body shape accepts `attachment_ids: string[]` referencing
// pre-uploaded voc_attachments rows. Skip shape has no body and therefore
// no attachments.
const publicUpdateBodyShape = z
  .object({
    skip_public_update: z.literal(false),
    body_rich_content: tipTapDocSchema,
    next_reporter_facing_status: reporterFacingStatusEnumSchema,
    attachment_ids: attachmentIdsSchema.optional(),
  })
  .strict();

// shape C — skip path, no body, reason required.
const publicUpdateSkipShape = z
  .object({
    skip_public_update: z.literal(true),
    skip_reason: z.string().refine((s) => s.trim().length >= 8, {
      message: 'skip_reason must be at least 8 non-whitespace characters',
    }),
    next_reporter_facing_status: reporterFacingStatusEnumSchema,
  })
  .strict();

export const publicUpdateRequestSchema = z.discriminatedUnion('skip_public_update', [
  publicUpdateBodyShape,
  publicUpdateSkipShape,
]);

export type PublicUpdateRequest = z.infer<typeof publicUpdateRequestSchema>;
