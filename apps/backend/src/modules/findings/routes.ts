import type { FastifyPluginAsync } from 'fastify';

import {
  addEvidenceHighlightRequestSchema,
  createFindingCommentRequestSchema,
  linkEvidenceRequestSchema,
  linkTaskRequestSchema,
  listFindingCommentsQuerySchema,
  listFindingsQuerySchema,
  patchFindingRequestSchema,
} from '@fops/shared';

import { fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireIdempotencyKey, UUID_REGEX } from '../../lib/http-headers.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { FindingsService } from './service.js';

export interface FindingsRoutesOptions {
  sessionService: SessionService;
  findingsService: FindingsService;
  workspaceId: string;
  rateLimitConfig?: { mutation?: Record<string, unknown>; read?: Record<string, unknown> };
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

  app.route({
    method: 'GET',
    url: '/findings/:id/comments',
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
      const parsed = listFindingCommentsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await findingsService.getFindingComments({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        findingId: id,
        query: parsed.data,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  app.route({
    method: 'POST',
    url: '/findings/:id/comments',
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
      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      const parsed = createFindingCommentRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await findingsService.createFindingComment({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        findingId: id,
        input: parsed.data,
        idempotencyKey,
        requestHash: hashRequestBody({ ...rawBody, findingId: id, route: 'finding.comment' }),
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'PATCH',
    url: '/findings/:id',
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
      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      const parsed = patchFindingRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const hash = hashRequestBody({ ...rawBody, findingId: id, route: 'finding.patch' });
      const result = await findingsService.patchFinding({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        findingId: id,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'POST',
    url: '/findings/:id/evidence-highlights',
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
      const parsed = addEvidenceHighlightRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await findingsService.addEvidenceHighlight({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        findingId: id,
        input: parsed.data,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'GET',
    url: '/findings/:id/evidence-highlights',
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
      const result = await findingsService.listEvidenceHighlights({
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

  app.route({
    method: 'POST',
    url: '/findings/:id/link-evidence',
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
      const parsed = linkEvidenceRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await findingsService.linkEvidence({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        findingId: id,
        input: parsed.data,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'POST',
    url: '/findings/:id/link-task',
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
      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      const parsed = linkTaskRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const hash = hashRequestBody({ ...rawBody, findingId: id, route: 'finding.link_task' });
      const result = await findingsService.linkTask({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        findingId: id,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });
};
