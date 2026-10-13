import { recoveryHistoryQuerySchema, recoveryListQuerySchema, recoveryPresentationPatchSchema } from '@fops/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import type { DashboardService } from './service.js';

const querySchema = z.object({ managed_system_id: z.union([z.string().uuid(), z.literal('all')]).optional() });

export const dashboardRoutes: FastifyPluginAsync<{
  sessionService: SessionService;
  dashboardService: DashboardService;
  workspaceId: string;
  rateLimitConfig?: { read?: Record<string, unknown>; mutation?: Record<string, unknown> };
}> = async (app, opts) => {
  app.patch<{ Params: { id: string } }>('/dashboard/recovery-items/:id/presentation', {
    preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
    ...(opts.rateLimitConfig?.mutation ? { config: { rateLimit: opts.rateLimitConfig.mutation as never } } : {}),
  }, async (req, reply) => {
    const query = z.object({}).strict().safeParse(req.query);
    if (!query.success) return sendError(reply, 'validation.failed', 'invalid query parameters', {
      fields: fieldsFromZodIssues(query.error.issues),
    });
    const parsed = recoveryPresentationPatchSchema.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 'validation.failed', 'invalid presentation', {
      fields: fieldsFromZodIssues(parsed.error.issues),
    });
    const session = req.session;
    if (!session) throw new Error('session missing after middleware');
    return reply.header('cache-control', 'private, no-cache').send(await opts.dashboardService.patchRecoveryPresentation({
      actor_id: session.actor_id, workspace_id: session.workspace_id, role_level: session.role_level,
    }, req.params.id, parsed.data));
  });
  app.get('/dashboard/recovery-history', {
    preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
    ...(opts.rateLimitConfig?.read ? { config: { rateLimit: opts.rateLimitConfig.read as never } } : {}),
  }, async (req, reply) => {
    const parsed = recoveryHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) return sendError(reply, 'validation.failed', 'invalid history query', {
      fields: fieldsFromZodIssues(parsed.error.issues),
    });
    const session = req.session;
    if (!session) throw new Error('session missing after middleware');
    return reply.header('cache-control', 'private, no-cache').send(await opts.dashboardService.getRecoveryHistory({
      actor_id: session.actor_id, workspace_id: session.workspace_id, role_level: session.role_level,
    }, parsed.data));
  });
  app.get('/dashboard/summary', {
    preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
    ...(opts.rateLimitConfig?.read ? { config: { rateLimit: opts.rateLimitConfig.read as never } } : {}),
  }, async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return sendError(reply, 'validation.failed', 'invalid query parameters', {
      fields: fieldsFromZodIssues(parsed.error.issues),
    });
    const session = req.session;
    if (!session) throw new Error('session missing after middleware');
    return reply.header('cache-control', 'private, no-cache').send(await opts.dashboardService.getSummary({
      actor_id: session.actor_id,
      workspace_id: session.workspace_id,
      role_level: session.role_level,
    }, parsed.data.managed_system_id));
  });
  app.get(
    '/dashboard/recovery-items',
    {
      preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
      ...(opts.rateLimitConfig?.read
        ? { config: { rateLimit: opts.rateLimitConfig.read as never } }
        : {}),
    },
    async (req, reply) => {
      const parsed = recoveryListQuerySchema.safeParse(req.query);
      if (!parsed.success)
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      const session = req.session;
      if (!session) throw new Error('session missing after middleware');
      return reply.header('cache-control', 'private, no-cache').send(
        await opts.dashboardService.listRecoveryItems(
          {
            actor_id: session.actor_id,
            workspace_id: session.workspace_id,
            role_level: session.role_level,
          },
          parsed.data,
        ),
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    '/dashboard/recovery-items/:id',
    {
      preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
      ...(opts.rateLimitConfig?.read
        ? { config: { rateLimit: opts.rateLimitConfig.read as never } }
        : {}),
    },
    async (req, reply) => {
      const session = req.session;
      if (!session) throw new Error('session missing after middleware');
      return reply.header('cache-control', 'private, no-cache').send(
        await opts.dashboardService.getRecoveryItem(
          {
            actor_id: session.actor_id,
            workspace_id: session.workspace_id,
            role_level: session.role_level,
          },
          req.params.id,
        ),
      );
    },
  );

};
