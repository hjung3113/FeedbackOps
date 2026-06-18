import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
  createEntityLinkRequestSchema,
  detachEntityLinkRequestSchema,
  listEntityLinksQuerySchema,
} from '@fops/shared';

import { HttpError, fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import type { EntityLinksService } from './service.js';

export interface EntityLinksRoutesOptions {
  sessionService: SessionService;
  entityLinksService: EntityLinksService;
  workspaceId: string;
  rateLimitConfig?: {
    mutation: Record<string, unknown>;
    read?: Record<string, unknown>;
  };
}

export const entityLinksRoutes: FastifyPluginAsync<EntityLinksRoutesOptions> = async (
  app,
  opts,
) => {
  const { sessionService, entityLinksService, workspaceId, rateLimitConfig } = opts;
  const entityLinkParamsSchema = z.object({ id: z.string().uuid() }).strict();

  app.route({
    method: 'POST',
    url: '/entity-links',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const parsed = createEntityLinkRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      const createArgs = {
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        source: parsed.data.source,
        target: parsed.data.target,
        relation_type: parsed.data.relation_type,
      };
      const result = await entityLinksService.createLink(
        parsed.data.visibility === undefined
          ? createArgs
          : { ...createArgs, visibility: parsed.data.visibility },
      );
      return reply.code(result.status).send(result.link);
    },
  });

  app.route({
    method: 'GET',
    url: '/entity-links',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const parsed = listEntityLinksQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      const data = parsed.data;
      let endpoint: { type: 'voc'; id: string };
      let side: 'source' | 'target';
      if (data.source_type !== undefined && data.source_id !== undefined) {
        endpoint = { type: data.source_type, id: data.source_id };
        side = 'source';
      } else if (data.target_type !== undefined && data.target_id !== undefined) {
        endpoint = { type: data.target_type, id: data.target_id };
        side = 'target';
      } else {
        throw new HttpError('internal.unexpected', 'validated entity link query lost endpoint');
      }

      const items = await entityLinksService.listLinks({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        endpoint,
        side,
      });
      return reply.code(200).send({ items });
    },
  });

  app.route({
    method: 'PATCH',
    url: '/entity-links/:id',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const parsedParams = entityLinkParamsSchema.safeParse(req.params);
      if (!parsedParams.success) {
        return sendError(reply, 'validation.failed', 'invalid route parameters', {
          fields: fieldsFromZodIssues(parsedParams.error.issues),
        });
      }

      const parsed = detachEntityLinkRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      const link = await entityLinksService.detachLink({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        linkId: parsedParams.data.id,
        reason: parsed.data.reason,
      });
      return reply.code(200).send(link);
    },
  });
};
