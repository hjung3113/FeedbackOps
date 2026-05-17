// Analytics Areas routes (Slice 2 #11). Thin controllers per AGENTS.md.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { HttpError, fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import type { ActorContext } from '../permissions/check-service.js';
import type { AnalyticsAreaService } from './analytics-area-service.js';

const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

const createBodySchema = z.object({
  managed_system_id: z.string().uuid(),
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  owner_team_id: z.string().uuid().nullable().optional(),
});

// PATCH body. `slug` + `managed_system_id` are immutable per ADR-0017;
// the route preHandler rejects any client payload that includes either
// with `validation.immutable_field`.
const updateBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  owner_team_id: z.string().uuid().nullable().optional(),
});

const listQuerySchema = z.object({
  managed_system_id: z.string().uuid().optional(),
  include_archived: z.union([z.literal('true'), z.literal('false')]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const IMMUTABLE_PATCH_FIELDS = ['slug', 'managed_system_id'] as const;

export interface AnalyticsAreasRoutesOptions {
  sessionService: SessionService;
  analyticsAreaService: AnalyticsAreaService;
  workspaceId: string;
  rateLimitConfig?: { mutation: Record<string, unknown> };
}

export const analyticsAreasRoutes: FastifyPluginAsync<AnalyticsAreasRoutesOptions> = async (
  app,
  opts,
) => {
  const { sessionService, analyticsAreaService, workspaceId, rateLimitConfig } = opts;

  function parseIdempotencyKey(headers: Record<string, unknown>): string | undefined {
    const raw = headers['idempotency-key'];
    const headerKey = Array.isArray(raw) ? raw[0] : raw;
    if (typeof headerKey !== 'string' || headerKey.length === 0) return undefined;
    if (!IDEMPOTENCY_KEY_REGEX.test(headerKey)) {
      throw new HttpError(
        'validation.malformed_idempotency_key',
        'Idempotency-Key must be a UUIDv4',
      );
    }
    return headerKey;
  }

  app.route({
    method: 'POST',
    url: '/analytics-areas',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    schema: { body: createBodySchema },
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const idempotencyKey = parseIdempotencyKey(req.headers as Record<string, unknown>);
      const actor: ActorContext = {
        actor_id: sess.actor_id,
        workspace_id: sess.workspace_id,
        role_level: sess.role_level,
      };
      const body = req.body as z.infer<typeof createBodySchema>;
      const result = await analyticsAreaService.registerAnalyticsArea(
        actor,
        body,
        idempotencyKey !== undefined ? { idempotencyKey } : {},
      );
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'PATCH',
    url: '/analytics-areas/:id',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    schema: { params: z.object({ id: z.string().uuid() }) },
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      for (const field of IMMUTABLE_PATCH_FIELDS) {
        if (field in rawBody) {
          return sendError(
            reply,
            'validation.immutable_field',
            `${field} is immutable per ADR-0017`,
            { field },
          );
        }
      }
      const parsed = updateBodySchema.safeParse(rawBody);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid update body', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const idempotencyKey = parseIdempotencyKey(req.headers as Record<string, unknown>);
      const actor: ActorContext = {
        actor_id: sess.actor_id,
        workspace_id: sess.workspace_id,
        role_level: sess.role_level,
      };
      const { id } = req.params as { id: string };
      const result = await analyticsAreaService.updateAnalyticsArea(
        actor,
        id,
        parsed.data,
        idempotencyKey !== undefined ? { idempotencyKey } : {},
      );
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'POST',
    url: '/analytics-areas/:id/archive',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    schema: { params: z.object({ id: z.string().uuid() }) },
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const idempotencyKey = parseIdempotencyKey(req.headers as Record<string, unknown>);
      const actor: ActorContext = {
        actor_id: sess.actor_id,
        workspace_id: sess.workspace_id,
        role_level: sess.role_level,
      };
      const { id } = req.params as { id: string };
      const result = await analyticsAreaService.archiveAnalyticsArea(
        actor,
        id,
        idempotencyKey !== undefined ? { idempotencyKey } : {},
      );
      return reply.code(result.status).send(result.body);
    },
  });

  app.route({
    method: 'GET',
    url: '/analytics-areas',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    schema: { querystring: listQuerySchema },
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const actor: ActorContext = {
        actor_id: sess.actor_id,
        workspace_id: sess.workspace_id,
        role_level: sess.role_level,
      };
      const q = req.query as z.infer<typeof listQuerySchema>;
      const result = await analyticsAreaService.listAnalyticsAreas(
        actor,
        {
          include_archived: q.include_archived === 'true',
          ...(q.managed_system_id !== undefined ? { managed_system_id: q.managed_system_id } : {}),
          ...(q.limit !== undefined ? { limit: q.limit } : {}),
          ...(q.offset !== undefined ? { offset: q.offset } : {}),
        },
      );
      return result;
    },
  });
};
