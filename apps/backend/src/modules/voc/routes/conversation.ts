// VOC module controller. Thin per apps/backend/AGENTS.md Layer Rules (#392):
// HTTP parsing + forbidden-field stripping + request-hash computation; the
// application commands own the transaction, the idempotency frame, business
// rules + audit.

import type { FastifyPluginAsync } from 'fastify';

import {
  internalCommentRequestSchema,
  publicUpdateRequestSchema,
  reporterReplyRequestSchema,
} from '@fops/shared';

import { HttpError, fieldsFromZodIssues, sendError } from '../../../lib/errors.js';
import { UUID_REGEX, requireIdempotencyKey } from '../../../lib/http-headers.js';
import { requireSession } from '../../../middleware/require-session.js';
import { requireWorkspace } from '../../../middleware/require-workspace.js';
import { hashRequestBody } from '../../core/idempotency/canonicalize.js';
import type { VocRoutesOptions } from './index.js';

export const vocConversationRoutes: FastifyPluginAsync<VocRoutesOptions> = async (app, opts) => {
  const { sessionService, conversationService, workspaceId, rateLimitConfig } = opts;

  // ── POST /vocs/:id/public-updates — Slice 3 #16 C4 ───────────────────────
  // TODO(F21 follow-up): dedicated 60/min rate-limit bucket (currently uses shared mutation tier)
  app.route({
    method: 'POST',
    url: '/vocs/:id/public-updates',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
      const params = req.params as { id: string };
      const vocId = params.id;

      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }

      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      const parsed = publicUpdateRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      // cycle-2 B1 fix: include endpoint discriminator so same key+body across
      // different conversation endpoints produces distinct hashes (no spurious
      // idempotency replay across routes).
      const hash = hashRequestBody({ ...rawBody, vocId, route: 'voc.public_update' });
      const result = await conversationService.postPublicUpdateCommand({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        vocId,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  // ── POST /vocs/:id/reporter-replies — Slice 3 #16 C4 ─────────────────────
  // TODO(F21 follow-up): dedicated 60/min rate-limit bucket
  app.route({
    method: 'POST',
    url: '/vocs/:id/reporter-replies',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
      const params = req.params as { id: string };
      const vocId = params.id;

      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }

      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      const parsed = reporterReplyRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      const hash = hashRequestBody({ ...rawBody, vocId, route: 'voc.reporter_reply' });
      const result = await conversationService.postReporterReplyCommand({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        vocId,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  // ── POST /vocs/:id/internal-comments — Slice 3 #16 C4 ────────────────────
  // TODO(F21 follow-up): dedicated 60/min rate-limit bucket
  app.route({
    method: 'POST',
    url: '/vocs/:id/internal-comments',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
      const params = req.params as { id: string };
      const vocId = params.id;

      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }

      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      const parsed = internalCommentRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      const hash = hashRequestBody({ ...rawBody, vocId, route: 'voc.internal_comment' });
      const result = await conversationService.postInternalCommentCommand({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        vocId,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });
};
