import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import type { FindingsService } from './service.js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const listFindingsQuerySchema = z
  .object({
    managed_system_id: z.string().uuid().optional(),
  })
  .strict();

export interface FindingsRoutesOptions {
  sessionService: SessionService;
  findingsService: FindingsService;
  workspaceId: string;
  rateLimitConfig?: { read?: Record<string, unknown> };
}

export const findingsRoutes: FastifyPluginAsync<FindingsRoutesOptions> = async (app, opts) => {
  const { sessionService, findingsService, workspaceId, rateLimitConfig } = opts;

  app.route({
    method: 'GET',
    url: '/findings',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const parsed = listFindingsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await findingsService.listFindings({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        ...(parsed.data.managed_system_id !== undefined
          ? { managedSystemId: parsed.data.managed_system_id }
          : {}),
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  app.route({
    method: 'GET',
    url: '/findings/:id',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const { id } = req.params as { id: string };
      if (!UUID_REGEX.test(id)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }
      const result = await findingsService.getFinding({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        findingId: id,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });
};
