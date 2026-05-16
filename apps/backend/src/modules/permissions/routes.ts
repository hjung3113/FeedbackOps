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
import { type FrontendState, toFrontendState } from './state-mapper.js';

export interface PermissionsRoutesOptions {
  sessionService: SessionService;
  checkService: CheckService;
  workspaceId: string;
}

export const permissionsRoutes: FastifyPluginAsync<PermissionsRoutesOptions> = async (
  app,
  opts,
) => {
  const { sessionService, checkService, workspaceId } = opts;

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
};

function isMapperStatus(value: string): value is 'pending' | 'needs_more_info' | 'rejected' {
  return value === 'pending' || value === 'needs_more_info' || value === 'rejected';
}
