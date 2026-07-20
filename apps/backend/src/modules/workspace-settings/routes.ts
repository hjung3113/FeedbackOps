import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { HttpError, fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import type { ActorContext } from '../permissions/check-service.js';
import type { WorkspaceSettingsService } from './service.js';

export const workspaceSettingsSchema = z
  .object({
    permission_self_approval: z.enum(['allowed', 'forbidden']),
    survey_anonymity_threshold: z.number().int().min(5).max(50),
  })
  .strict();

const patchWorkspaceSettingsSchema = workspaceSettingsSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'at least one setting is required' });

export interface WorkspaceSettingsRoutesOptions {
  sessionService: SessionService;
  workspaceSettingsService: WorkspaceSettingsService;
  workspaceId: string;
  rateLimitConfig?: { mutation: Record<string, unknown> };
}

export const workspaceSettingsRoutes: FastifyPluginAsync<WorkspaceSettingsRoutesOptions> = async (
  app,
  opts,
) => {
  const { sessionService, workspaceSettingsService, workspaceId, rateLimitConfig } = opts;

  function actorFromSession(session: {
    actor_id: string;
    workspace_id: string;
    role_level: ActorContext['role_level'];
  }): ActorContext {
    return {
      actor_id: session.actor_id,
      workspace_id: session.workspace_id,
      role_level: session.role_level,
    };
  }

  app.route({
    method: 'GET',
    url: '/workspace/settings',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const settings = await workspaceSettingsService.getWorkspaceSettings(actorFromSession(sess));
      return reply.code(200).send(settings);
    },
  });

  app.route({
    method: 'PATCH',
    url: '/workspace/settings',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const parsed = patchWorkspaceSettingsSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid workspace settings body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const settings = await workspaceSettingsService.patchWorkspaceSettings(
        actorFromSession(sess),
        parsed.data,
      );
      return reply.code(200).send(settings);
    },
  });
};
