// POST /attachments controller — PLAN-22 C3a (skeleton + validation only).
//
// Layer rule (apps/backend/AGENTS.md): controller parses HTTP, validates,
// rejects with the ADR-0012 envelope. The upload-then-INSERT happy path
// lands in C3b; this route returns `501 not_implemented.todo` once all
// validation gates pass.
//
// Validation order (deliberately early-rejects cheapest first):
//   1. Idempotency-Key header present + UUIDv4 shape.
//   2. multipart parse + `file` part present.
//   3. MIME allowlist (declared Content-Type).
//   4. Filename sanitizer (strip path separators, control chars, clamp 255B).
//   5. Size cap is enforced by @fastify/multipart's `limits.fileSize`; the
//      throw is mapped to `attachment.too_large`.
//
// Rate-limit: 20/min per actor (admin bypass follow-up — server.ts already
// carries a TODO for the admin-role helper).

import type { FastifyPluginAsync } from 'fastify';

import { HttpError, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { FilenameSanitizeError, sanitizeFilename } from './filename-sanitize.js';
import { MIME_ALLOWLIST } from './mime-allowlist.js';

const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface AttachmentsRoutesOptions {
  sessionService: SessionService;
  workspaceId: string;
  rateLimitConfig?: {
    attachmentMutation: Record<string, unknown>;
  };
}

export const attachmentsRoutes: FastifyPluginAsync<AttachmentsRoutesOptions> = async (
  app,
  opts,
) => {
  const { sessionService, workspaceId, rateLimitConfig } = opts;

  function requireIdempotencyKey(headers: Record<string, unknown>): string {
    const raw = headers['idempotency-key'];
    const headerKey = Array.isArray(raw) ? raw[0] : raw;
    if (typeof headerKey !== 'string' || headerKey.length === 0) {
      throw new HttpError('validation.failed', 'Idempotency-Key header required', {
        fields: [{ path: ['headers', 'idempotency-key'], code: 'required' }],
      });
    }
    if (!IDEMPOTENCY_KEY_REGEX.test(headerKey)) {
      throw new HttpError(
        'validation.malformed_idempotency_key',
        'Idempotency-Key must be a UUIDv4',
      );
    }
    return headerKey;
  }

  app.route({
    method: 'POST',
    url: '/attachments',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig
      ? { config: { rateLimit: rateLimitConfig.attachmentMutation as never } }
      : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      // 1. Idempotency-Key header (validated even before multipart parse).
      requireIdempotencyKey(req.headers as Record<string, unknown>);

      // 2. multipart parse. @fastify/multipart exposes app.req helpers via
      //    decoration; `req.file()` returns the first file part.
      const reqAny = req as unknown as {
        isMultipart?: () => boolean;
        file?: () => Promise<MultipartFile | undefined>;
      };
      if (typeof reqAny.isMultipart !== 'function' || !reqAny.isMultipart()) {
        throw new HttpError('validation.failed', 'request must be multipart/form-data', {
          fields: [{ path: ['headers', 'content-type'], code: 'invalid_content_type' }],
        });
      }

      let part: MultipartFile | undefined;
      try {
        part = await reqAny.file!();
      } catch (err) {
        // @fastify/multipart throws a synthetic error for limit violations.
        if (isRequestFileTooLargeError(err)) {
          return sendError(reply, 'attachment.too_large', 'attachment exceeds 25MB limit', {
            fields: [{ path: ['file'], code: 'too_large' }],
            max_bytes: MAX_ATTACHMENT_BYTES,
          });
        }
        throw err;
      }
      if (!part) {
        throw new HttpError('validation.failed', 'file part missing', {
          fields: [{ path: ['file'], code: 'required' }],
        });
      }

      // 3. MIME allowlist (declared Content-Type — magic-byte sniff is C3b).
      const mimeType = part.mimetype;
      if (!MIME_ALLOWLIST.has(mimeType)) {
        // Drain the upload stream so the connection is not held open.
        await drainPart(part);
        return sendError(
          reply,
          'attachment.unsupported_type',
          `content type ${mimeType} is not allowed`,
          {
            fields: [{ path: ['file'], code: 'unsupported_type' }],
            mime_type: mimeType,
          },
        );
      }

      // 4. Filename sanitization.
      let sanitized: string;
      try {
        sanitized = sanitizeFilename(part.filename ?? '');
      } catch (err) {
        await drainPart(part);
        if (err instanceof FilenameSanitizeError) {
          return sendError(reply, 'validation.failed', 'filename is not usable', {
            fields: [{ path: ['filename'], code: 'invalid_filename' }],
            reason: err.reason,
          });
        }
        throw err;
      }

      // 5. Pull the bytes so the multipart parser observes the truncation
      //    flag. We must consume the stream before checking `file.truncated`.
      try {
        await consumeAndCheckTruncated(part);
      } catch (err) {
        if (isRequestFileTooLargeError(err) || (err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
          return sendError(reply, 'attachment.too_large', 'attachment exceeds 25MB limit', {
            fields: [{ path: ['file'], code: 'too_large' }],
            max_bytes: MAX_ATTACHMENT_BYTES,
          });
        }
        throw err;
      }

      // Validation passed — C3b will replace this with upload-then-INSERT.
      // For now, surface the stub so RED tests fail loudly until then.
      return sendError(
        reply,
        'not_implemented.todo',
        'attachment upload not yet implemented (PLAN-22 C3b)',
        {
          // Tag the sanitized name + mime so the C3b implementer sees the
          // contract once they replace this stub.
          sanitized_filename: sanitized,
          mime_type: mimeType,
        },
      );
    },
  });
};

// ── Helpers ────────────────────────────────────────────────────────────────
interface MultipartFile {
  filename?: string;
  mimetype: string;
  file: NodeJS.ReadableStream & { truncated?: boolean };
}

function isRequestFileTooLargeError(err: unknown): boolean {
  const code = (err as { code?: string } | null | undefined)?.code;
  return code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT';
}

async function drainPart(part: MultipartFile): Promise<void> {
  await new Promise<void>((resolve) => {
    part.file.on('data', () => {
      /* drain */
    });
    part.file.on('end', () => resolve());
    part.file.on('error', () => resolve());
  });
}

async function consumeAndCheckTruncated(part: MultipartFile): Promise<void> {
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    part.file.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength;
    });
    part.file.on('end', () => {
      if (part.file.truncated) {
        reject(Object.assign(new Error('file too large'), { code: 'FST_REQ_FILE_TOO_LARGE' }));
        return;
      }
      resolve();
    });
    part.file.on('error', (err) => reject(err));
  });
  void bytes;
}
