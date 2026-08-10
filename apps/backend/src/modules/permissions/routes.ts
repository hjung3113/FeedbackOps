// Permission routes. Thin controllers per AGENTS.md:65-66 — every DB read of
// permission_* tables happens inside permission services. The route's only
// jobs are: parse + validate query params, look up the actor's role_level,
// call the service, and shape the response envelope.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
  approvePermissionRequestSchema,
  denyPermissionRequestSchema,
  needMoreInfoPermissionRequestSchema,
  rejectPermissionRequestSchema,
  type Capability,
  isCapability,
} from '@fops/shared';
import { HttpError, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { applyAdminModuleBypass } from './check-service.js';
import type { ActorContext, CheckService, Decision } from './check-service.js';
import type { RequestService } from './request-service.js';
import type { DecisionService } from './decision-service.js';
import { type FrontendState, toFrontendState } from './state-mapper.js';

// Export the exact parser used by the approve route so its shared-contract
// binding can be asserted without booting Fastify or opening a database.
export const approvePermissionRequestBodySchema = approvePermissionRequestSchema;

export interface PermissionsRoutesOptions {
  sessionService: SessionService;
  checkService: CheckService;
  requestService: RequestService;
  decisionService: DecisionService;
  workspaceId: string;
  rateLimitConfig?: {
    mutation: Record<string, unknown>;
  };
}

// ADR-0015:72 — UUIDv4 client-generated. The version nibble at position 14
// is `4` and the variant nibble at position 19 is one of [8,9,a,b].
const IDEMPOTENCY_KEY_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

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
  const {
    sessionService,
    checkService,
    requestService,
    decisionService,
    workspaceId,
    rateLimitConfig,
  } = opts;

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

      const actor: ActorContext = {
        actor_id: sess.actor_id,
        workspace_id: sess.workspace_id,
        role_level: sess.role_level,
      };

      // The generic check answers for `roleSatisfies` only. Domain modules that
      // layer their own admin bypass (Finding, Task Request, Survey) would let
      // this actor through, so mirror that rule here — otherwise the frontend
      // gate hides an action the enforcing route allows (issue #372).
      const decision: Decision = applyAdminModuleBypass(
        sess.role_level,
        capability,
        await checkService.checkCapability(actor, capability, {
          workspace_id: sess.workspace_id,
          ...(q.managed_system_id !== undefined ? { managed_system_id: q.managed_system_id } : {}),
        }),
      );

      // Look up the actor's currently-open request (pending|needs_more_info)
      // for this capability AND the same managed-system scope so the state
      // mapper picks `pending_request` only for the matching scope tuple.
      // Matches the scope predicate of the partial unique index
      // `permission_requests_active_uq` (workspace, requester, capability,
      // COALESCE(managed_system_id, sentinel)). A null query MS hits null
      // rows; a concrete MS UUID hits exactly its own rows.
      const openRequestSummary = await requestService.findOpenRequestSummary(actor, capability, {
        workspace_id: sess.workspace_id,
        ...(q.managed_system_id !== undefined ? { managed_system_id: q.managed_system_id } : {}),
      });

      const state: FrontendState = toFrontendState(decision, openRequestSummary);
      return { state, decision };
    },
  });

  // ── POST /permission-requests ───────────────────────────────────────────
  // Slice 1 #5 — the first audited mutation. Idempotency-Key honored
  // (ADR-0015), audit row committed in the same transaction (ADR-0008).
  app.route({
    method: 'GET',
    url: '/me/permissions/scope',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    schema: { querystring: z.object({ capability: z.string().min(1) }) },
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess)
        throw new HttpError(
          'internal.unexpected',
          'session missing after middleware',
        );
      const q = req.query as { capability: string };
      if (!isCapability(q.capability)) {
        return sendError(
          reply,
          'validation.unknown_capability',
          'unknown capability',
          { capability: q.capability },
        );
      }
      const scope = await checkService.capabilityScope(
        {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        q.capability,
        { workspace_id: sess.workspace_id },
      );
      return { scope };
    },
  });

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

      const actor: ActorContext = {
        actor_id: sess.actor_id,
        workspace_id: sess.workspace_id,
        role_level: sess.role_level,
      };

      const result = await requestService.createRequest(
        actor,
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

      const actor: ActorContext = {
        actor_id: sess.actor_id,
        workspace_id: sess.workspace_id,
        role_level: sess.role_level,
      };

      const requests = await requestService.listMine(actor);
      return { requests };
    },
  });

  // ── GET /permission-requests ────────────────────────────────────────────
  // Admin-only workspace-wide list of open (pending|needs_more_info) requests
  // plus a count (issue #87). The service enforces the workspace.admin gate;
  // non-admins get permission.denied → 403 via the error mapper.
  app.route({
    method: 'GET',
    url: '/permission-requests',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      const actor: ActorContext = {
        actor_id: sess.actor_id,
        workspace_id: sess.workspace_id,
        role_level: sess.role_level,
      };

      const parsed = z
        .object({
          status: z.enum(['pending', 'needs_more_info', 'approved', 'rejected', 'all']).optional(),
        })
        .safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({
          code: 'validation.failed',
          message: 'invalid query parameters',
        });
      }
      return await requestService.listAllActive(actor, parsed.data.status);
    },
  });

  // Canonical review-console route. Keep the older singular endpoint above
  // for clients shipped before the console; both retain the same default
  // open-request behavior when `status` is omitted.
  app.route({
    method: 'GET',
    url: '/permissions/requests',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const parsed = z
        .object({
          status: z.enum(['pending', 'needs_more_info', 'approved', 'rejected', 'all']).optional(),
        })
        .safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({
          code: 'validation.failed',
          message: 'invalid query parameters',
        });
      }
      return await requestService.listAllActive(
        {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        parsed.data.status,
      );
    },
  });

  const decisionRoutes: Array<{
    suffix: string;
    schema: z.ZodType;
    invoke: (
      actor: ActorContext,
      id: string,
      body: unknown,
      idempotencyKey?: string,
    ) => Promise<{ status: number; body: unknown }>;
  }> = [
    {
      suffix: 'approve',
      schema: approvePermissionRequestBodySchema,
      invoke: (actor, id, body, idempotencyKey) =>
        decisionService.approveRequest(
          actor,
          id,
          body as {
            reason?: string;
            self_approval?: {
              policy_citation: string;
              peer_reviewer_absence: string;
            };
          },
          {
            idempotencyKey,
          },
        ),
    },
    {
      suffix: 'reject',
      schema: rejectPermissionRequestSchema,
      invoke: (actor, id, body, idempotencyKey) =>
        decisionService.rejectRequest(actor, id, body as { reason?: string }, {
          idempotencyKey,
        }),
    },
    {
      suffix: 'need-more-info',
      schema: needMoreInfoPermissionRequestSchema,
      invoke: (actor, id, body, idempotencyKey) =>
        decisionService.needMoreInfoRequest(actor, id, body as { note?: string }, {
          idempotencyKey,
        }),
    },
    {
      suffix: 'deny',
      schema: denyPermissionRequestSchema,
      invoke: (actor, id, body, idempotencyKey) =>
        decisionService.denyRequest(actor, id, body as { reason?: string }, {
          idempotencyKey,
        }),
    },
  ];

  for (const route of decisionRoutes) {
    app.route({
      method: 'POST',
      url: `/permissions/requests/:id/${route.suffix}`,
      preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
      ...(rateLimitConfig ? { config: { rateLimit: rateLimitConfig.mutation as never } } : {}),
      handler: async (req, reply) => {
        const sess = req.session;
        if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
        const rawKey = req.headers['idempotency-key'];
        const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
        if (
          typeof idempotencyKey === 'string' &&
          idempotencyKey.length > 0 &&
          !IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)
        ) {
          return sendError(
            reply,
            'validation.malformed_idempotency_key',
            'Idempotency-Key must be a UUIDv4',
          );
        }
        const parsed = route.schema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({
            code: 'validation.failed',
            message: 'invalid request body',
          });
        }
        const actor: ActorContext = {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        };
        const { id } = req.params as { id: string };
        const result = await route.invoke(actor, id, parsed.data, idempotencyKey || undefined);
        return reply.code(result.status).send(result.body);
      },
    });
  }
};
