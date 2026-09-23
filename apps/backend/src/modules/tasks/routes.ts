import type { FastifyPluginAsync } from 'fastify';

import {
  convertTaskRequestRequestSchema,
  createTaskCommentRequestSchema,
  linkExistingTaskRequestSchema,
  listTaskCommentsQuerySchema,
  listTasksQuerySchema,
  patchTaskStatusRequestSchema,
} from '@fops/shared';

import { fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireIdempotencyKey, requireIfMatchTimestamp, UUID_REGEX } from '../../lib/http-headers.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { TasksService } from './service.js';

export interface TasksRoutesOptions {
  sessionService: SessionService;
  tasksService: TasksService;
  workspaceId: string;
  rateLimitConfig?: { mutation?: Record<string, unknown>; read?: Record<string, unknown> };
}

export const tasksRoutes: FastifyPluginAsync<TasksRoutesOptions> = async (app, opts) => {
  const { sessionService, tasksService, workspaceId, rateLimitConfig } = opts;

  app.route({
    method: 'GET',
    url: '/tasks',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const parsed = listTasksQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await tasksService.listTasks({
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
    method: 'PATCH',
    url: '/tasks/:id',
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
      const parsed = patchTaskStatusRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await tasksService.patchTaskStatus({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        taskId: id,
        ifMatch,
        input: parsed.data,
        idempotencyKey,
        requestHash: hashRequestBody({
          taskId: id,
          ifMatch,
          route: 'task.status_update',
          ...rawBody,
        }),
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'GET',
    url: '/tasks/:id',
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
      const result = await tasksService.getTask({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        taskId: id,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  app.route({
    method: 'GET',
    url: '/tasks/:id/comments',
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
      const parsed = listTaskCommentsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await tasksService.getTaskComments({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        taskId: id,
        query: parsed.data,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  app.route({
    method: 'POST',
    url: '/tasks/:id/comments',
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
      const parsed = createTaskCommentRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await tasksService.createTaskComment({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        taskId: id,
        input: parsed.data,
        idempotencyKey,
        requestHash: hashRequestBody({ ...rawBody, taskId: id, route: 'task.comment' }),
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'POST',
    url: '/task-requests/:id/convert',
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
      const parsed = convertTaskRequestRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const hash = hashRequestBody({
        ...rawBody,
        taskRequestId: id,
        route: 'task_request.convert',
      });
      const result = await tasksService.convertTaskRequest({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        taskRequestId: id,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'POST',
    url: '/task-requests/:id/link-task',
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
      const parsed = linkExistingTaskRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const hash = hashRequestBody({
        ...rawBody,
        taskRequestId: id,
        route: 'task_request.link_task',
      });
      const result = await tasksService.linkExistingTask({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        taskRequestId: id,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });
};
