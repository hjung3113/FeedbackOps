// Attachments audit detail schemas (Slice 3 #22 / PLAN-22 C3a — ADR-0017).
// `attachment_uploaded` records a successful POST /attachments commit.
//
// Privacy invariant: `filename` MUST NOT appear in the audit detail. Filenames
// may contain PII or attacker-controlled strings (mojibake, control chars,
// homoglyphs) and the audit log is broadly readable. The sanitized filename
// is persisted on `voc_attachments.filename` for the download path; the audit
// log only references the row by id + storage_key. `.strict()` enforces this
// at the schema boundary — any caller that accidentally passes a `filename`
// field is rejected before the row is written.
//
// Imported by audit-events.ts to register into AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

const uuid = () => z.string().uuid();

export const attachmentUploadedDetailSchema = z
  .object({
    attachment_id: uuid(),
    actor_id: uuid(),
    storage_key: z.string().min(1),
    size_bytes: z.number().int().nonnegative(),
    mime_type: z.string().min(1),
  })
  .strict();
export type AttachmentUploadedDetail = z.infer<typeof attachmentUploadedDetailSchema>;
