import type { FastifyPluginAsync } from 'fastify';

import { createMilestoneRequestSchema } from '@fops/shared';

import { fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireIdempotencyKey } from '../../lib/http-headers.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { MilestonesService } from './service.js';

export interface MilestonesRoutesOptions {
  sessionService: SessionService;
  milestonesService: MilestonesService;
  workspaceId: string;
  rateLimitConfig?: { mutation?: Record<string, unknown>; read?: Record<string, unknown> };
}

export const milestonesRoutes: FastifyPluginAsync<MilestonesRoutesOptions> = async (app, opts) => {
  const { sessionService, milestonesService, workspaceId, rateLimitConfig } = opts;

  app.route({
    method: 'POST',
    url: '/milestones',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.mutation
      ? { config: { rateLimit: rateLimitConfig.mutation as never } }
      : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      const parsed = createMilestoneRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await milestonesService.createMilestone({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        input: parsed.data,
        idempotencyKey,
        requestHash: hashRequestBody({
          route: 'milestone.create',
          ...rawBody,
        }),
      });
      return reply.code(result.status).send(result.body);
    },
  });
};
