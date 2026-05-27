import { AttachmentCreatedSchema, type AttachmentCreated } from '@fops/shared';
import { apiClient } from './client';

export interface UploadAttachmentOpts {
  /**
   * Caller-supplied Idempotency-Key. Components should source this from
   * `useIdempotencyKey()` so per-call-site stability is preserved.
   * If omitted, apiClient auto-mints a UUID (acceptable for one-shot uploads
   * not bound to a parent mutation).
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * POST /attachments — multipart upload (PLAN-22 C3b/C5).
 *
 * Browser sets `multipart/form-data; boundary=...` automatically when
 * the body is a FormData instance; do NOT set Content-Type explicitly
 * or the boundary parameter will be missing and the BE multipart parser
 * will reject the request.
 *
 * Throws `ApiError` on non-2xx (mapped error codes: `attachment.too_large`,
 * `attachment.unsupported_type`, `storage.unavailable`, `rate_limited.actor`).
 */
export async function uploadAttachment(
  file: File,
  opts: UploadAttachmentOpts = {},
): Promise<AttachmentCreated> {
  const formData = new FormData();
  formData.append('file', file);

  const clientOpts: Parameters<typeof apiClient>[2] = { formData };
  if (opts.idempotencyKey !== undefined) clientOpts.idempotencyKey = opts.idempotencyKey;
  if (opts.signal !== undefined) clientOpts.signal = opts.signal;

  const res = await apiClient<unknown>('POST', '/attachments', clientOpts);
  return AttachmentCreatedSchema.parse(res.data);
}
