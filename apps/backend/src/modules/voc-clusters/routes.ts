import type { FastifyPluginAsync } from 'fastify';

import {
  addVocClusterMemberRequestSchema,
  createFindingFromVocClusterRequestSchema,
  createTaskRequestFromVocClusterRequestSchema,
  createVocClusterRequestSchema,
  updateVocClusterRequestSchema,
} from '@fops/shared';

import { HttpError } from '../../lib/errors.js';
import { fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { TaskRequestsService } from '../task-requests/index.js';
import type { VocClustersActor } from './service.js';
import type { VocClustersService } from './service.js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface VocClustersRoutesOptions {
  sessionService: SessionService;
  vocClustersService: VocClustersService;
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
    throw new HttpError('validation.malformed_idempotency_key', 'Idempotency-Key must be a UUIDv4');
  }
  return headerKey;
}

function actorFromSession(actor: VocClustersActor): VocClustersActor {
  return actor;
}

export const vocClustersRoutes: FastifyPluginAsync<VocClustersRoutesOptions> = async (
  app,
  opts,
) => {
  const { sessionService, vocClustersService, taskRequestsService, workspaceId, rateLimitConfig } =
    opts;

  app.route({
    method: 'POST',
    url: '/voc-clusters',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.mutation
      ? { config: { rateLimit: rateLimitConfig.mutation as never } }
      : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const parsed = createVocClusterRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await vocClustersService.createCluster({
        actor: actorFromSession({
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        }),
        input: parsed.data,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'GET',
    url: '/voc-clusters',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const query = req.query as { managed_system_id?: unknown };
      const managedSystemId =
        typeof query.managed_system_id === 'string' ? query.managed_system_id : undefined;
      if (managedSystemId !== undefined && !UUID_REGEX.test(managedSystemId)) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: [{ path: ['managed_system_id'], code: 'invalid' }],
        });
      }
      const result = await vocClustersService.listClusters({
        actor: actorFromSession({
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        }),
        ...(managedSystemId !== undefined ? { managedSystemId } : {}),
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  app.route({
    method: 'GET',
    url: '/voc-clusters/:id',
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
      const result = await vocClustersService.getCluster({
        actor: actorFromSession({
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        }),
        clusterId: id,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  app.route({
    method: 'PATCH',
    url: '/voc-clusters/:id',
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
      const parsed = updateVocClusterRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await vocClustersService.updateCluster({
        actor: actorFromSession({
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        }),
        clusterId: id,
        input: parsed.data,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'POST',
    url: '/voc-clusters/:id/vocs',
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
      const parsed = addVocClusterMemberRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await vocClustersService.addMember({
        actor: actorFromSession({
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        }),
        clusterId: id,
        input: parsed.data,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'DELETE',
    url: '/voc-clusters/:id/vocs/:voc_id',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig?.mutation
      ? { config: { rateLimit: rateLimitConfig.mutation as never } }
      : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new Error('session missing after middleware');
      const { id, voc_id: vocId } = req.params as { id: string; voc_id: string };
      if (!UUID_REGEX.test(id)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }
      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'voc_id must be a valid UUID', {
          fields: [{ path: ['voc_id'], code: 'invalid' }],
        });
      }
      const result = await vocClustersService.removeMember({
        actor: actorFromSession({
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        }),
        clusterId: id,
        vocId,
      });
      return reply.code(result.status).send();
    },
  });

  app.route({
    method: 'POST',
    url: '/voc-clusters/:id/create-finding',
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
      const parsed = createFindingFromVocClusterRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const hash = hashRequestBody({
        ...rawBody,
        clusterId: id,
        route: 'voc_cluster.create_finding',
      });
      const result = await vocClustersService.createFindingFromCluster({
        actor: actorFromSession({
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        }),
        clusterId: id,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'POST',
    url: '/voc-clusters/:id/request-task',
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
      const parsed = createTaskRequestFromVocClusterRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const hash = hashRequestBody({
        ...rawBody,
        clusterId: id,
        route: 'voc_cluster.request_task',
      });
      const result = await taskRequestsService.createFromVocCluster({
        actor: actorFromSession({
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        }),
        clusterId: id,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });
};
