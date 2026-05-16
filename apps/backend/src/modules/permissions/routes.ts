// Permission routes. Thin controllers per AGENTS.md:65-66 — every DB read of
// permission_* tables happens inside `check-service.ts`. The route's only
// jobs are: parse + validate query params, look up the actor's role_level,
// call the service, and shape the response envelope.

import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { type Capability, isCapability } from '@fops/shared';
import { actors } from '../../db/schema/core.js';
import { permissionRequests } from '../../db/schema/permission.js';
import { HttpError, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import type { CheckService, Decision } from './check-service.js';
import type { RequestService } from './request-service.js';
import { type FrontendState, toFrontendState } from './state-mapper.js';

export interface PermissionsRoutesOptions {
  sessionService: SessionService;
  checkService: CheckService;
  requestService: RequestService;
  workspaceId: string;
  rateLimitConfig?: {
    mutation: Record<string, unknown>;
  };
}

const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const createRequestBodySchema = z.object({
  requested_capability: z.string().min(1),
  requested_managed_system_id: z.string().uuid().optional(),
  requested_object_type: z.string().min(1).optional(),
  requested_object_id: z.string().uuid().optional(),
  reason: z.string().min(1).max(2000),
  requested_expiration: z.string().datetime().optional(),
  source_object_type: z.string().min(1).optional(),
  source_object_id: z.string().uuid().optional(),
  source_action_id: z.string().min(1).optional(),
  return_route_intent: z.string().min(1).optional(),
});

export const permissionsRoutes: FastifyPluginAsync<PermissionsRoutesOptions> = async (
  app,
  opts,
) => {
  const { sessionService, checkService, requestService, workspaceId, rateLimitConfig } = opts;

  // Helper: load the actor row to discover role_level. Same trick as
  // /me/permissions/check below — avoids inflating the auth module surface.
  async function loadActorContext(sess: {
    actor_id: string;
    workspace_id: string;
  }) {
    const rows = await app.db
      .select({ id: actors.id, roleLevel: actors.roleLevel })
      .from(actors)
      .where(and(eq(actors.id, sess.actor_id), eq(actors.workspaceId, sess.workspace_id)))
      .limit(1);
    return rows[0] ?? null;
  }

  // ── GET /me/permissions/check ───────────────────────────────────────────
  // Query: capability=<cap>&managed_system_id=<uuid?>
  // Returns: { state, decision }
  //
  // ADR-0015 mutation tier does not apply (GET). The global per-Actor limit
  // already covers this surface.
  app.route({
    method: 'GET',
    url: '/me/permissions/check',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    schema: {
      querystring: z.object({
        capability: z.string().min(1),
        managed_system_id: z.string().uuid().optional(),
      }),
    },
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const q = req.query as { capability: string; managed_system_id?: string };
      if (!isCapability(q.capability)) {
        return sendError(reply, 'validation.unknown_capability', 'unknown capability', {
          capability: q.capability,
        });
      }
      const capability: Capability = q.capability;

      // Look up the actor's role_level. We could put a helper on the auth
      // module, but the read is trivial and adding a public API there for
      // one consumer would inflate the auth surface — see AGENTS.md:66.
      const actorRows = await app.db
        .select({ id: actors.id, roleLevel: actors.roleLevel })
        .from(actors)
        .where(and(eq(actors.id, sess.actor_id), eq(actors.workspaceId, sess.workspace_id)))
        .limit(1);
      const actorRow = actorRows[0];
      if (!actorRow) {
        // Actor row vanished mid-session — treat as session invalid.
        return sendError(reply, 'auth.session_invalid', 'actor not found for session');
      }

      const decision: Decision = await checkService.checkCapability(
        {
          actor_id: actorRow.id,
          workspace_id: sess.workspace_id,
          role_level: actorRow.roleLevel,
        },
        capability,
        {
          workspace_id: sess.workspace_id,
          ...(q.managed_system_id !== undefined ? { managed_system_id: q.managed_system_id } : {}),
        },
      );

      // Look up the actor's currently-open request (pending|needs_more_info)
      // for this capability, if any, so the state mapper can pick between
      // request_access and pending_request. We ignore MS scope in Slice 1
      // (zero MS-scoped grants seeded); S1.2 will tighten this match.
      const openReqRows = await app.db
        .select({ status: permissionRequests.status })
        .from(permissionRequests)
        .where(
          and(
            eq(permissionRequests.workspaceId, sess.workspace_id),
            eq(permissionRequests.requesterActorId, sess.actor_id),
            eq(permissionRequests.requestedCapability, capability),
          ),
        )
        .limit(1);
      const openReq = openReqRows[0] ?? null;
      // We only feed pending/needs_more_info/rejected to the mapper; any
      // other status (approved/expired/revoked) is irrelevant for the
      // request flow.
      const openRequestSummary =
        openReq && isMapperStatus(openReq.status) ? { status: openReq.status } : null;

      const state: FrontendState = toFrontendState(decision, openRequestSummary);
      return { state, decision };
    },
  });

  // ── POST /permission-requests ───────────────────────────────────────────
  // Slice 1 #5 — the first audited mutation. Idempotency-Key honored
  // (ADR-0015), audit row committed in the same transaction (ADR-0008).
  app.route({
    method: 'POST',
    url: '/permission-requests',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
    schema: {
      body: createRequestBodySchema,
    },
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      // Validate optional Idempotency-Key header up-front.
      const rawKey = req.headers['idempotency-key'];
      const headerKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
      let idempotencyKey: string | undefined;
      if (typeof headerKey === 'string' && headerKey.length > 0) {
        if (!IDEMPOTENCY_KEY_REGEX.test(headerKey)) {
          return sendError(
            reply,
            'validation.malformed_idempotency_key',
            'Idempotency-Key must be a UUIDv4',
          );
        }
        idempotencyKey = headerKey;
      }

      const body = req.body as z.infer<typeof createRequestBodySchema>;

      // Unknown capability check happens inside the service (returns 422), but
      // we can short-circuit here for a cleaner envelope.
      if (!isCapability(body.requested_capability)) {
        return sendError(reply, 'validation.unknown_capability', 'unknown capability', {
          capability: body.requested_capability,
        });
      }

      const actorRow = await loadActorContext(sess);
      if (!actorRow) {
        return sendError(reply, 'auth.session_invalid', 'actor not found for session');
      }

      const result = await requestService.createRequest(
        {
          actor_id: actorRow.id,
          workspace_id: sess.workspace_id,
          role_level: actorRow.roleLevel,
        },
        body,
        idempotencyKey !== undefined ? { idempotencyKey } : {},
      );

      return reply.code(result.status).send(result.body);
    },
  });

  // ── GET /permission-requests/mine ───────────────────────────────────────
  // Returns the caller's open (pending|needs_more_info) permission requests.
  app.route({
    method: 'GET',
    url: '/permission-requests/mine',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const actorRow = await loadActorContext(sess);
      if (!actorRow) {
        return sendError(reply, 'auth.session_invalid', 'actor not found for session');
      }

      const requests = await requestService.listMine({
        actor_id: actorRow.id,
        workspace_id: sess.workspace_id,
        role_level: actorRow.roleLevel,
      });
      return { requests };
    },
  });
};

function isMapperStatus(value: string): value is 'pending' | 'needs_more_info' | 'rejected' {
  return value === 'pending' || value === 'needs_more_info' || value === 'rejected';
}
