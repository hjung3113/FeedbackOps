import type { FastifyPluginAsync } from 'fastify';

import { sendError } from '../../../lib/errors.js';
import { requireSession } from '../../../middleware/require-session.js';
import { requireWorkspace } from '../../../middleware/require-workspace.js';
import type { SessionService } from '../../auth/session-service.js';

import type { PreSubmitVocPeersService } from './service.js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface PreSubmitVocPeersRoutesOptions {
  sessionService: SessionService;
  preSubmitVocPeersService: PreSubmitVocPeersService;
  workspaceId: string;
  rateLimitConfig?: { read?: Record<string, unknown> };
}

export const preSubmitVocPeersRoutes: FastifyPluginAsync<PreSubmitVocPeersRoutesOptions> = async (
  app,
  opts,
) => {
  const { sessionService, preSubmitVocPeersService, workspaceId, rateLimitConfig } = opts;

  app.route({
    method: 'GET', url: '/vocs/pre-submit-peers',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const { managed_system_id: managedSystemId } = req.query as { managed_system_id?: string };
      if (!managedSystemId || !UUID_REGEX.test(managedSystemId)) {
        return sendError(reply, 'validation.failed', 'managed_system_id must be a valid UUID', {
          fields: [{ path: ['managed_system_id'], code: 'invalid' }],
        });
      }
      const result = await preSubmitVocPeersService.list({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        managedSystemId,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });
};
