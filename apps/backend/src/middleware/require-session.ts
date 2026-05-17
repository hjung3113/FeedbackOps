// `requireSession` — Fastify preHandler. Reads the opaque `fops_session`
// cookie, verifies the row is active (not revoked, not expired), touches
// `last_seen_at`, and populates `req.session = { session_id, actor_id,
// workspace_id }`. On any failure renders the ADR-0012 envelope with
// `code: 'auth.session_invalid'` (HTTP 401) — the public contract treats
// "no cookie", "revoked", and "expired" identically so the boundary doesn't
// leak whether a session ever existed.

import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { sendError } from '../lib/errors.js';
import type { SessionService } from '../modules/auth/session-service.js';

export const SESSION_COOKIE_NAME = 'fops_session';

export function requireSession(sessionService: SessionService): preHandlerHookHandler {
  return async function requireSessionHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const cookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (!cookie) {
      sendError(reply, 'auth.session_invalid', 'session cookie missing');
      return;
    }
    const loaded = await sessionService.loadAndTouch(cookie);
    if (!loaded) {
      sendError(reply, 'auth.session_invalid', 'session not active');
      return;
    }
    req.session = {
      session_id: loaded.session.id,
      actor_id: loaded.session.actorId,
      workspace_id: loaded.session.workspaceId,
      role_level: loaded.session.roleLevel,
    };
  };
}
