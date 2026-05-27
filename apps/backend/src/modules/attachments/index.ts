// Attachments module barrel — Slice 3 #22 / PLAN-22 C3a.
//
// Slice 3 ships only `POST /attachments` validation skeleton (C3a). C3b adds
// the upload-then-INSERT happy path + storage failure mapping. C4 adds the
// download stream + the unlinked-attachment purge job.

export { attachmentsRoutes, MAX_ATTACHMENT_BYTES } from './routes.js';
export { MIME_ALLOWLIST } from './mime-allowlist.js';
export { sanitizeFilename, FilenameSanitizeError } from './filename-sanitize.js';
export { createAttachmentsService, type AttachmentsService } from './service.js';
