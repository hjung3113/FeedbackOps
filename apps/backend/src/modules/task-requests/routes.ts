import type { FastifyPluginAsync } from 'fastify';

import {
  approveTaskRequestRequestSchema,
  createTaskRequestFromFindingRequestSchema,
  listTaskRequestsQuerySchema,
  rejectTaskRequestRequestSchema,
  requestMoreEvidenceTaskRequestRequestSchema,
} from '@fops/shared';

import { fieldsFromZodIssues, HttpError, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { TaskRequestsService } from './service.js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TaskRequestsRoutesOptions {
  sessionService: SessionService;
  taskRequestsService: TaskRequestsService;
  workspaceId: string;
  rateLimitConfig?: { mutation?: Record<string, unknown>; read?: Record<string, unknown> };
}

function requireIdempotencyKey(headers: Record<string, unknown>): string {
  const raw = headers['idempotency-key'];
  const headerKey = Array.isArray(raw) ? raw[0] : raw;
  if (typeof headerKey !== 'string' || headerKey.length === 0) {
    throw new HttpError('validation.failed', 'Idempotency-Key header required', {
      fields: [{ path: ['headers', 'idempotency-key'], code: 'required' }],
    });
  }
  if (!IDEMPOTENCY_KEY_REGEX.test(headerKey)) {
    throw new HttpError(
      'validation.malformed_idempotency_key',
      'Idempotency-Key must be a UUIDv4',
    );
  }
  return headerKey;
}

export const taskRequestsRoutes: FastifyPluginAsync<TaskRequestsRoutesOptions> = async (
  app,
  opts,
) => {
  const { sessionService, taskRequestsService, workspaceId, rateLimitConfig } = opts;

  app.route({
    method: 'GET',
    url: '/task-requests',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const parsed = listTaskRequestsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await taskRequestsService.listTaskRequests({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.managed_system_id !== undefined
          ? { managed_system_id: parsed.data.managed_system_id }
          : {}),
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  app.route({
    method: 'POST',
    url: '/findings/:id/request-task',
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
      const parsed = createTaskRequestFromFindingRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      const hash = hashRequestBody({
        ...rawBody,
        findingId: id,
        route: 'finding.request_task',
      });
      const result = await taskRequestsService.createFromFinding({
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
    url: '/task-requests/:id/approve',
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
      const parsed = approveTaskRequestRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const hash = hashRequestBody({ ...rawBody, taskRequestId: id, route: 'task_request.approve' });
      const result = await taskRequestsService.decideTaskRequest({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        taskRequestId: id,
        action: 'approve',
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'POST',
    url: '/task-requests/:id/reject',
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
      const parsed = rejectTaskRequestRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const hash = hashRequestBody({ ...rawBody, taskRequestId: id, route: 'task_request.reject' });
      const result = await taskRequestsService.decideTaskRequest({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        taskRequestId: id,
        action: 'reject',
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'POST',
    url: '/task-requests/:id/request-more-evidence',
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
      const parsed = requestMoreEvidenceTaskRequestRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const hash = hashRequestBody({
        ...rawBody,
        taskRequestId: id,
        route: 'task_request.request_more_evidence',
      });
      const result = await taskRequestsService.decideTaskRequest({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        taskRequestId: id,
        action: 'request_more_evidence',
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });
};
