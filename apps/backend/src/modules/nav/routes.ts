import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { fieldsFromZodIssues, sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import type { NavCountsService, NavResolveService } from './service.js';

const querySchema = z.object({ managed_system_id: z.string().uuid().optional() });

// /nav/resolve (#731). Strict: unknown keys → 422. The display-id grammar is
// checked after trim + upper-case normalisation; every failure — missing param,
// unknown key, empty string, unknown prefix, bad counter — returns the SAME
// `{ path: ['display_id'], code: 'invalid_display_id' }` field (no zod-issue
// passthrough) so the palette gets one stable validation shape.
const resolveQuerySchema = z.object({ display_id: z.string() }).strict();
const DISPLAY_ID_PATTERN = /^(VOC|FIN|REQ|TASK)-[1-9][0-9]*$/;

export const navRoutes: FastifyPluginAsync<{
  sessionService: SessionService;
  navCountsService: NavCountsService;
  navResolveService: NavResolveService;
  workspaceId: string;
  rateLimitConfig?: { read?: Record<string, unknown> };
}> = async (app, opts) => {
  app.get('/nav/counts', {
    preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
    ...(opts.rateLimitConfig?.read ? { config: { rateLimit: opts.rateLimitConfig.read as never } } : {}),
  }, async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(reply, 'validation.failed', 'invalid query parameters', {
        fields: fieldsFromZodIssues(parsed.error.issues),
      });
    }
    const session = req.session;
    if (!session) throw new Error('session missing after middleware');
    return reply.header('cache-control', 'private, no-cache').send({
      counts: await opts.navCountsService.getCounts({
        actor_id: session.actor_id,
        workspace_id: session.workspace_id,
        role_level: session.role_level,
      }, parsed.data.managed_system_id),
    });
  });

  app.get('/nav/resolve', {
    preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
    ...(opts.rateLimitConfig?.read ? { config: { rateLimit: opts.rateLimitConfig.read as never } } : {}),
  }, async (req, reply) => {
    const parsed = resolveQuerySchema.safeParse(req.query);
    const displayId = parsed.success ? parsed.data.display_id.trim().toUpperCase() : '';
    if (!parsed.success || !DISPLAY_ID_PATTERN.test(displayId)) {
      return sendError(reply, 'validation.failed', 'invalid display id', {
        fields: [{ path: ['display_id'], code: 'invalid_display_id' }],
      });
    }
    const session = req.session;
    if (!session) throw new Error('session missing after middleware');
    const resolved = await opts.navResolveService.resolve(
      {
        actor_id: session.actor_id,
        workspace_id: session.workspace_id,
        role_level: session.role_level,
      },
      displayId,
    );
    if (!resolved) {
      // Missing, foreign-workspace, and unreadable records are deliberately
      // indistinguishable here (no existence probe).
      reply.header('cache-control', 'private, no-cache');
      return sendError(reply, 'not_found.record', 'record not found');
    }
    return reply.header('cache-control', 'private, no-cache').send(resolved);
  });
};
