// GET /actors?workspace=current — workspace actor list.
//
// Filed during Slice 3 #21 era: the Triage OwnerPicker FE
// (`useWorkspaceActors`) shipped against this URL without a matching BE
// route, so the assignee picker was silently empty. This handler closes the
// gap. The pre-existing AGENTS.md / docs/implementation/02-domain-module-
// boundaries.md keep actor reads under `core` ownership, but auth/ already
// owns the actor identity surface (`/me`, `/auth/mock-login`) and the
// list-actors read is tiny + permission-trivial — colocating it here keeps
// the actor-read concept in one module.
//
// Contract:
//   - Auth: any session (intra-workspace read, low sensitivity).
//   - Workspace: resolved from session; `workspace` query param is a pinned
//     sentinel and must equal `current`. Other values → 400 validation.failed.
//   - Response: { actors: Array<{ id, display_name, email, role_level }> }
//     ordered by display_name ASC, id ASC for stable iteration.

import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { DbHandle } from '../../db/client.js';
import { actors } from '../../db/schema/core.js';
import { HttpError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from './session-service.js';

// Pinned sentinel. Future iterations may resolve other workspace tokens, but
// today the only legal value is `current` (== caller's session workspace).
const listActorsQuerySchema = z.object({
  workspace: z.literal('current'),
});

export interface ListActorsRoutesOptions {
  db: DbHandle['db'];
  sessionService: SessionService;
  workspaceId: string;
}

export const listActorsRoutes: FastifyPluginAsync<ListActorsRoutesOptions> = async (app, opts) => {
  const { db, sessionService, workspaceId } = opts;

  app.route({
    method: 'GET',
    url: '/actors',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    schema: { querystring: listActorsQuerySchema },
    handler: async (req) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');

      // ORDER BY display_name ASC, id ASC. Drizzle's relational query API
      // would also work but we already have the table object imported and
      // the result set is tiny — keep the SELECT direct.
      const rows = await db
        .select({
          id: actors.id,
          displayName: actors.displayName,
          email: actors.email,
          roleLevel: actors.roleLevel,
        })
        .from(actors)
        .where(eq(actors.workspaceId, sess.workspace_id))
        .orderBy(actors.displayName, actors.id);

      return {
        actors: rows.map((r) => ({
          id: r.id,
          display_name: r.displayName,
          email: r.email,
          role_level: r.roleLevel as 'admin' | 'developer' | 'user',
        })),
      };
    },
  });
};
