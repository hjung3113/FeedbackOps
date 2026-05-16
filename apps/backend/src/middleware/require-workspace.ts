// `requireWorkspace` — preHandler that asserts the active session belongs to
// the expected workspace (ADR-0006:60-62, MVP single-tenant). Must run AFTER
// `requireSession` so `req.session` is populated. Mismatch → 403 envelope
// `auth.workspace_mismatch`.

import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { sendError } from '../lib/errors.js';

export function requireWorkspace(expectedWorkspaceId: string): preHandlerHookHandler {
  return async function requireWorkspaceHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!req.session) {
      // Programmer error: requireWorkspace was registered without
      // requireSession in front. Treat as session_invalid to avoid leaking
      // the misconfiguration to clients.
      sendError(reply, 'auth.session_invalid', 'session context missing');
      return;
    }
    if (req.session.workspace_id !== expectedWorkspaceId) {
      sendError(reply, 'auth.workspace_mismatch', 'session is bound to a different workspace');
      return;
    }
  };
}
