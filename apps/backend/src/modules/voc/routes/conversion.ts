// VOC module controller. Thin per apps/backend/AGENTS.md Layer Rules (#392):
// HTTP parsing + forbidden-field stripping + request-hash computation; the
// application commands own the transaction, the idempotency frame, business
// rules + audit.

import type { FastifyPluginAsync } from 'fastify';

import { createFindingRequestSchema, createTaskRequestFromVocRequestSchema } from '@fops/shared';

import { HttpError, fieldsFromZodIssues, sendError } from '../../../lib/errors.js';
import { requireIdempotencyKey, UUID_REGEX } from '../../../lib/http-headers.js';
import { requireSession } from '../../../middleware/require-session.js';
import { requireWorkspace } from '../../../middleware/require-workspace.js';
import { hashRequestBody } from '../../core/idempotency/canonicalize.js';
import type { VocRoutesOptions } from './index.js';

export const vocConversionRoutes: FastifyPluginAsync<VocRoutesOptions> = async (app, opts) => {
  const {
    sessionService,
    findingsService,
    taskRequestsService,
    workspaceId,
    rateLimitConfig,
  } = opts;

  app.route({
    method: 'POST',
    url: '/vocs/:id/create-finding',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const params = req.params as { id: string };
      const vocId = params.id;
      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }

      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      const parsed = createFindingRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      const hash = hashRequestBody({ ...rawBody, vocId, route: 'voc.create_finding' });
      const result = await findingsService.createFindingFromVoc({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        vocId,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'POST',
    url: '/vocs/:id/request-task',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const params = req.params as { id: string };
      const vocId = params.id;
      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }

      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      const parsed = createTaskRequestFromVocRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid request body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }

      const hash = hashRequestBody({ ...rawBody, vocId, route: 'voc.request_task' });
      const result = await taskRequestsService.createFromVoc({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        vocId,
        input: parsed.data,
        idempotencyKey,
        requestHash: hash,
      });
      return reply.code(result.status).send(result.body);
    },
  });
};
