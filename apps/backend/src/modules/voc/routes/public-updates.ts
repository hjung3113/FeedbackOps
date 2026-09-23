// VOC module controller. Thin per apps/backend/AGENTS.md Layer Rules (#392):
// HTTP parsing + forbidden-field stripping + request-hash computation; the
// application commands own the transaction, the idempotency frame, business
// rules + audit.

import type { FastifyPluginAsync } from 'fastify';

import { resolvePublicUpdateReviewCandidateRequestSchema } from '@fops/shared';

import { HttpError, fieldsFromZodIssues, sendError } from '../../../lib/errors.js';
import { UUID_REGEX } from '../../../lib/http-headers.js';
import { requireSession } from '../../../middleware/require-session.js';
import { requireWorkspace } from '../../../middleware/require-workspace.js';
import type { VocRoutesOptions } from './index.js';

export const vocPublicUpdatesRoutes: FastifyPluginAsync<VocRoutesOptions> = async (app, opts) => {
  const { sessionService, publicUpdateReviewCandidateService, workspaceId, rateLimitConfig } = opts;

  app.route({
    method: 'GET',
    url: '/vocs/:id/public-update-candidates',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const { id: vocId } = req.params as { id: string };
      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }
      const result = await publicUpdateReviewCandidateService.list({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        vocId,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  app.route({
    method: 'POST',
    url: '/vocs/:id/apply-public-update-candidate',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const { id: vocId } = req.params as { id: string };
      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }
      const parsed = resolvePublicUpdateReviewCandidateRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      try {
        const result = await publicUpdateReviewCandidateService.resolveCommand({
          actor: {
            actor_id: sess.actor_id,
            workspace_id: sess.workspace_id,
            role_level: sess.role_level,
          },
          vocId,
          input: parsed.data,
        });
        return reply.code(201).send(result);
      } catch (error) {
        if (
          error !== null &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string' &&
          error.message.includes('public update review candidate terminal state is immutable')
        ) {
          throw new HttpError('conflict.stale_write', 'review candidate is already resolved');
        }
        throw error;
      }
    },
  });
};
