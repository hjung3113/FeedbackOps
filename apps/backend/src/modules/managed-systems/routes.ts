// Managed Systems routes (Slice 2 #10). Thin controllers per AGENTS.md:65-66
// — every domain transaction happens inside managed-system-service.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { HttpError, fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import type { ActorContext } from '../permissions/check-service.js';
import type { ManagedSystemService } from './managed-system-service.js';

// ADR-0015:72 — UUIDv4 client-generated.
const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

const createBodySchema = z.object({
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  external_key: z.string().min(1).max(200).nullable().optional(),
  default_owner_actor_id: z.string().uuid().nullable().optional(),
  default_owner_team_id: z.string().uuid().nullable().optional(),
});

// PATCH body. `slug` is intentionally absent — the route preHandler rejects
// any client payload that includes it with `validation.immutable_field`
// (ADR-0017 slug immutability).
const updateBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  external_key: z.string().min(1).max(200).nullable().optional(),
  default_owner_actor_id: z.string().uuid().nullable().optional(),
  default_owner_team_id: z.string().uuid().nullable().optional(),
});

const listQuerySchema = z.object({
  include_archived: z.union([z.literal('true'), z.literal('false')]).optional(),
  slug: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export interface ManagedSystemsRoutesOptions {
  sessionService: SessionService;
  managedSystemService: ManagedSystemService;
  workspaceId: string;
  rateLimitConfig?: { mutation: Record<string, unknown> };
}

export const managedSystemsRoutes: FastifyPluginAsync<ManagedSystemsRoutesOptions> = async (
  app,
  opts,
) => {
  const { sessionService, managedSystemService, workspaceId, rateLimitConfig } = opts;

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

  // ── POST /managed-systems ─────────────────────────────────────────────
  app.route({
    method: 'POST',
    url: '/managed-systems',
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
      const result = await managedSystemService.registerManagedSystem(
        actor,
        body,
        idempotencyKey !== undefined ? { idempotencyKey } : {},
      );
      return reply.code(result.status).send(result.body);
    },
  });

  // ── PATCH /managed-systems/:id ────────────────────────────────────────
  app.route({
    method: 'PATCH',
    url: '/managed-systems/:id',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    schema: {
      params: z.object({ id: z.string().uuid() }),
      // Body validation via updateBodySchema after the immutable-slug check.
    },
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      if ('slug' in rawBody) {
        return sendError(reply, 'validation.immutable_field', 'slug is immutable per ADR-0017', {
          field: 'slug',
        });
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
      const result = await managedSystemService.updateManagedSystem(
        actor,
        id,
        parsed.data,
        idempotencyKey !== undefined ? { idempotencyKey } : {},
      );
      return reply.code(result.status).send(result.body);
    },
  });

  // ── POST /managed-systems/:id/archive ─────────────────────────────────
  app.route({
    method: 'POST',
    url: '/managed-systems/:id/archive',
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
      const result = await managedSystemService.archiveManagedSystem(
        actor,
        id,
        idempotencyKey !== undefined ? { idempotencyKey } : {},
      );
      return reply.code(result.status).send(result.body);
    },
  });

  // ── GET /managed-systems ──────────────────────────────────────────────
  app.route({
    method: 'GET',
    url: '/managed-systems',
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
      const result = await managedSystemService.listManagedSystems(
        actor,
        {
          include_archived: q.include_archived === 'true',
          ...(q.slug !== undefined ? { slug: q.slug } : {}),
          ...(q.limit !== undefined ? { limit: q.limit } : {}),
          ...(q.offset !== undefined ? { offset: q.offset } : {}),
        },
      );
      return result;
    },
  });
};
