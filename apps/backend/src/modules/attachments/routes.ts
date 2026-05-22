// POST /attachments controller — PLAN-22 C3a (validation) + C3b (happy path).
//
// Layer rule (apps/backend/AGENTS.md): controller parses HTTP, validates,
// then opens a single transaction that runs the ADR-0015 idempotency frame
// + the upload-then-INSERT application service inside it. The route layer
// also maps `StorageUnavailableError` from the storage lib (already mapped
// to HttpError inside the service) onto the ADR-0012 envelope.
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

import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import type { Db } from '../../db/client.js';
import { HttpError, sendError } from '../../lib/errors.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import type { AttachmentsService } from './service.js';
import { FilenameSanitizeError, sanitizeFilename } from './filename-sanitize.js';
import { MIME_ALLOWLIST } from './mime-allowlist.js';
import { asciiFallback, encodeRfc5987 } from './rfc5987.js';

const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface AttachmentsRoutesOptions {
  db: Db;
  sessionService: SessionService;
  attachmentsService: AttachmentsService;
  idempotencyService: IdempotencyService;
  workspaceId: string;
  rateLimitConfig?: {
    attachmentMutation: Record<string, unknown>;
  };
}

export const attachmentsRoutes: FastifyPluginAsync<AttachmentsRoutesOptions> = async (
  app,
  opts,
) => {
  const { db, sessionService, attachmentsService, idempotencyService, workspaceId, rateLimitConfig } = opts;

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
      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);

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
      let bytes: Buffer;
      try {
        bytes = await consumeToBuffer(part);
      } catch (err) {
        if (isRequestFileTooLargeError(err) || (err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
          return sendError(reply, 'attachment.too_large', 'attachment exceeds 25MB limit', {
            fields: [{ path: ['file'], code: 'too_large' }],
            max_bytes: MAX_ATTACHMENT_BYTES,
          });
        }
        throw err;
      }
      // Defensive size re-check after buffering. @fastify/multipart's
      // `limits.fileSize` is the primary gate; this catches the edge case
      // where the limit is not configured.
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        return sendError(reply, 'attachment.too_large', 'attachment exceeds 25MB limit', {
          fields: [{ path: ['file'], code: 'too_large' }],
          max_bytes: MAX_ATTACHMENT_BYTES,
        });
      }

      // 6. Idempotency frame + service in one transaction (ADR-0015).
      //    Hash binds idempotency to (route, filename, mime, size). The raw
      //    bytes are NOT hashed — a 25MB SHA over the body on every request
      //    would dominate p99. Same-key + different size/mime/name returns
      //    409 conflict.idempotency_key_reuse.
      const hash = hashRequestBody({
        route: 'attachment.create',
        filename: sanitized,
        mime_type: mimeType,
        size_bytes: bytes.byteLength,
      });

      try {
        const result = await db.transaction(async (tx) => {
          // Serialise concurrent first-time retries with the same
          // (actor_id, key) so the loser blocks until the winner commits.
          // Mirrors voc/routes.ts:137-139.
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${sess.actor_id}), hashtext(${idempotencyKey}))`,
          );
          const hit = await idempotencyService.lookup(tx, sess.actor_id, idempotencyKey, hash);
          if (hit.kind === 'match') {
            return { status: hit.status, body: hit.body };
          }
          if (hit.kind === 'mismatch') {
            throw new HttpError(
              'conflict.idempotency_key_reuse',
              'Idempotency-Key reused with different request body',
            );
          }
          const envelope = await attachmentsService.uploadAttachment({
            tx,
            actor: { actor_id: sess.actor_id, workspace_id: sess.workspace_id },
            bytes,
            mimeType,
            filename: sanitized,
          });
          await idempotencyService.record(
            tx,
            sess.actor_id,
            idempotencyKey,
            hash,
            201,
            envelope,
          );
          return { status: 201, body: envelope };
        });
        return reply.code(result.status).send(result.body);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw err;
      }
    },
  });

  // ── GET /attachments/:id/download — PLAN-22 C4a ─────────────────────────
  //
  // Streaming download. Entitlement + storage lookup live in the service;
  // the route's job is to:
  //   1. Auth (requireSession + requireWorkspace).
  //   2. Validate :id is a UUID (cheap rejection — service can rely on this).
  //   3. Set Content-Type / Content-Length / Content-Disposition BEFORE
  //      piping the body. Fastify's `reply.send(readable)` auto-pipes.
  //   4. RFC 5987 filename* per RFC 6266 §5 so Korean / emoji filenames
  //      survive header transport. ASCII fallback uses asciiFallback().
  const UUID_REGEX =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

  app.route({
    method: 'GET',
    url: '/attachments/:id/download',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const params = req.params as { id?: string };
      const id = params?.id ?? '';
      if (!UUID_REGEX.test(id)) {
        throw new HttpError('validation.failed', 'attachment id must be a UUID', {
          fields: [{ path: ['params', 'id'], code: 'invalid_uuid' }],
        });
      }

      const result = await attachmentsService.downloadAttachment({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        id,
      });

      // RFC 6266 + RFC 5987 Content-Disposition. Quote the ASCII fallback so
      // it survives spaces / dots in legacy clients; emit the UTF-8 form via
      // filename*= for modern clients.
      const ascii = asciiFallback(result.filename);
      const encoded = encodeRfc5987(result.filename);
      const disposition = `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;

      reply
        .header('Content-Type', result.mimeType)
        .header('Content-Length', String(result.size))
        .header('Content-Disposition', disposition);
      return reply.send(result.stream);
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

async function consumeToBuffer(part: MultipartFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    part.file.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
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
  return Buffer.concat(chunks);
}
