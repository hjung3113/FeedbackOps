import type { FastifyPluginAsync } from 'fastify';

import {
  createMilestoneRequestSchema,
  listMilestonesQuerySchema,
  patchMilestoneRequestSchema,
} from '@fops/shared';

import { fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import {
  UUID_REGEX,
  requireIdempotencyKey,
  requireIfMatchTimestamp,
} from '../../lib/http-headers.js';
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

  app.route({
    method: 'GET',
    url: '/milestones',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const parsed = listMilestonesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await milestonesService.listMilestones({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        query: parsed.data,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  app.route({
    method: 'GET',
    url: '/milestones/:id',
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
      const result = await milestonesService.getMilestone({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        milestoneId: id,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  app.route({
    method: 'PATCH',
    url: '/milestones/:id',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.mutation
      ? { config: { rateLimit: rateLimitConfig.mutation as never } }
      : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const { id } = req.params as { id: string };
      if (!UUID_REGEX.test(id)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }
      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
      const ifMatch = requireIfMatchTimestamp(req.headers as Record<string, unknown>);
      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      const parsed = patchMilestoneRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await milestonesService.patchMilestone({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        milestoneId: id,
        ifMatch,
        input: parsed.data,
        idempotencyKey,
        requestHash: hashRequestBody({
          milestoneId: id,
          ifMatch,
          route: 'milestone.update',
          ...rawBody,
        }),
      });
      return reply.code(result.status).send(result.body);
    },
  });
};
