import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import type { NotificationService } from './service.js';

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
const querySchema = z
  .object({
    unread: booleanQuery.optional(),
    include_archived: booleanQuery.optional().default('false'),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    cursor: z.string().optional(),
  })
  .strict();
const paramsSchema = z.object({ id: z.string().uuid() }).strict();

export const notificationRoutes: FastifyPluginAsync<{
  sessionService: SessionService;
  notificationService: Pick<NotificationService, 'list' | 'markRead' | 'archive'>;
  workspaceId: string;
  rateLimitConfig?: {
    read?: Record<string, unknown>;
    notificationState?: Record<string, unknown>;
  };
}> = async (app, opts) => {
  app.get(
    '/notifications',
    {
      preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
      ...(opts.rateLimitConfig?.read
        ? { config: { rateLimit: opts.rateLimitConfig.read as never } }
        : {}),
    },
    async (req, reply) => {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const session = req.session;
      if (!session) throw new Error('session missing after middleware');
      const response = await opts.notificationService.list(
        {
          actor_id: session.actor_id,
          workspace_id: session.workspace_id,
          role_level: session.role_level,
        },
        {
          include_archived: parsed.data.include_archived,
          limit: parsed.data.limit,
          ...(parsed.data.unread === undefined ? {} : { unread: parsed.data.unread }),
          ...(parsed.data.cursor === undefined ? {} : { cursor: parsed.data.cursor }),
        },
      );
      return reply.header('cache-control', 'private, no-cache').send(response);
    },
  );

  app.post(
    '/notifications/:id/read',
    {
      preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
      ...(opts.rateLimitConfig?.notificationState
        ? { config: { rateLimit: opts.rateLimitConfig.notificationState as never } }
        : {}),
    },
    async (req, reply) => {
      const parsed = paramsSchema.safeParse(req.params);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid notification id', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const session = req.session;
      if (!session) throw new Error('session missing after middleware');
      return reply.send(
        await opts.notificationService.markRead(
          {
            actor_id: session.actor_id,
            workspace_id: session.workspace_id,
            role_level: session.role_level,
          },
          parsed.data.id,
        ),
      );
    },
  );

  app.post(
    '/notifications/:id/archive',
    {
      preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
      ...(opts.rateLimitConfig?.notificationState
        ? { config: { rateLimit: opts.rateLimitConfig.notificationState as never } }
        : {}),
    },
    async (req, reply) => {
      const parsed = paramsSchema.safeParse(req.params);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid notification id', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const session = req.session;
      if (!session) throw new Error('session missing after middleware');
      return reply.send(
        await opts.notificationService.archive(
          {
            actor_id: session.actor_id,
            workspace_id: session.workspace_id,
            role_level: session.role_level,
          },
          parsed.data.id,
        ),
      );
    },
  );
};
