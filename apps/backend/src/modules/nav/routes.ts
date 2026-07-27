import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import type { NavCountsService } from './service.js';

const querySchema = z.object({ managed_system_id: z.string().uuid().optional() });

export const navRoutes: FastifyPluginAsync<{
  sessionService: SessionService;
  navCountsService: NavCountsService;
  workspaceId: string;
  rateLimitConfig?: { read?: Record<string, unknown> };
}> = async (app, opts) => {
  app.get('/nav/counts', {
    preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
    ...(opts.rateLimitConfig?.read ? { config: { rateLimit: opts.rateLimitConfig.read as never } } : {}),
  }, async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'validation.failed', 'invalid query parameters', {
        fields: fieldsFromZodIssues(parsed.error.issues),
      });
    }
    const session = req.session;
    if (!session) throw new Error('session missing after middleware');
    return reply.header('cache-control', 'private, no-cache').send({
      counts: await opts.navCountsService.getCounts({
        actor_id: session.actor_id,
        workspace_id: session.workspace_id,
        role_level: session.role_level,
      }, parsed.data.managed_system_id),
    });
  });
};
