import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { sendError } from '../../../lib/errors.js';
import { requireSession } from '../../../middleware/require-session.js';
import { requireWorkspace } from '../../../middleware/require-workspace.js';
import type { SessionService } from '../../auth/session-service.js';
import type { VocRecommendationsActor, VocRecommendationsService } from './service.js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface VocRecommendationsRoutesOptions {
  sessionService: SessionService;
  vocRecommendationsService: VocRecommendationsService;
  workspaceId: string;
  rateLimitConfig?: { mutation?: Record<string, unknown>; read?: Record<string, unknown> };
}

function actorFromSession(actor: VocRecommendationsActor): VocRecommendationsActor {
  return actor;
}

export const vocRecommendationsRoutes: FastifyPluginAsync<VocRecommendationsRoutesOptions> = async (
  app,
  opts,
) => {
  const { sessionService, vocRecommendationsService, workspaceId, rateLimitConfig } = opts;

  function paramsOrError(
    id: string,
    candidateId: string | undefined,
    reply: FastifyReply,
  ): { id: string; candidateId?: string } | undefined {
    if (!UUID_REGEX.test(id)) {
      void sendError(reply, 'validation.failed', 'id must be a valid UUID', {
        fields: [{ path: ['id'], code: 'invalid' }],
      });
      return undefined;
    }
    if (candidateId !== undefined && !UUID_REGEX.test(candidateId)) {
      void sendError(reply, 'validation.failed', 'candidate_id must be a valid UUID', {
        fields: [{ path: ['candidate_id'], code: 'invalid' }],
      });
      return undefined;
    }
    return { id, ...(candidateId !== undefined ? { candidateId } : {}) };
  }

  app.route({
    method: 'GET', url: '/vocs/:id/recommendations',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const { id } = req.params as { id: string };
      const parsed = paramsOrError(id, undefined, reply);
      if (!parsed) return reply;
      const result = await vocRecommendationsService.listRecommendations({
        actor: actorFromSession({ actor_id: sess.actor_id, workspace_id: sess.workspace_id, role_level: sess.role_level }),
        sourceVocId: parsed.id,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  for (const action of ['dismiss', 'confirm'] as const) {
    app.route({
      method: 'POST', url: `/vocs/:id/recommendations/:candidate_id/${action}`,
      preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
      ...(rateLimitConfig?.mutation ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
      handler: async (req, reply) => {
        const sess = req.session;
        if (!sess) throw new Error('session missing after middleware');
        const { id, candidate_id: candidateId } = req.params as { id: string; candidate_id: string };
        const parsed = paramsOrError(id, candidateId, reply);
        if (!parsed?.candidateId) return reply;
        const args = {
          actor: actorFromSession({ actor_id: sess.actor_id, workspace_id: sess.workspace_id, role_level: sess.role_level }),
          sourceVocId: parsed.id, candidateVocId: parsed.candidateId,
        };
        if (action === 'dismiss') {
          await vocRecommendationsService.dismissRecommendation(args);
          return reply.code(204).send();
        }
        const result = await vocRecommendationsService.confirmRecommendation(args);
        return reply.code(result.status).send(result.body);
      },
    });
  }
};
