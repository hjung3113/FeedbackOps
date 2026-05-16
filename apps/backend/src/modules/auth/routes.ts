// Auth routes. Mounted at the root (no prefix) so URLs match ADR-0006 and
// the issue body verbatim: GET/POST /auth/mock-login, POST /auth/logout, GET
// /me. The plugin is the only place the AUTH_PROVIDER env var is consulted —
// outside the auth module, code only sees the AuthProvider interface.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { sendError } from '../../lib/errors.js';
import { SESSION_COOKIE_NAME, requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { AuthProvider } from './auth-provider.js';
import type { SessionService } from './session-service.js';
import { SESSION_TTL_MS } from './session-service.js';

export interface AuthRoutesOptions {
  authProvider: AuthProvider;
  sessionService: SessionService;
  workspaceId: string;
  /** From AppConfig.NODE_ENV; controls cookie `Secure` flag and dev-only routes. */
  nodeEnv: 'development' | 'test' | 'production';
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, opts) => {
  const { authProvider, sessionService, workspaceId, nodeEnv } = opts;
  const isProd = nodeEnv === 'production';
  const ttlSeconds = Math.floor(SESSION_TTL_MS / 1000);

  // ── GET /auth/mock-login ──────────────────────────────────────────────
  // Dev-only picker. Production returns 404 (the route still exists but the
  // handler refuses) so the surface area is identical between envs — the
  // 404 leaks nothing.
  app.route({
    method: 'GET',
    url: '/auth/mock-login',
    handler: async (_req, reply) => {
      if (isProd || authProvider.name !== 'mock') {
        return sendError(reply, 'not_found.record', 'mock login is not available');
      }
      const { html } = await authProvider.startLogin();
      reply.type('text/html; charset=utf-8').send(html);
    },
  });

  // ── POST /auth/mock-login ─────────────────────────────────────────────
  app.route({
    method: 'POST',
    url: '/auth/mock-login',
    schema: {
      body: z.object({ external_id: z.string().min(1) }),
    },
    handler: async (req, reply) => {
      if (isProd || authProvider.name !== 'mock') {
        return sendError(reply, 'not_found.record', 'mock login is not available');
      }
      const { external_id } = req.body as { external_id: string };
      const claims = await authProvider.completeLogin({ external_id });
      const ua = req.headers['user-agent'];
      const { session, actor, expiresAt } = await sessionService.provisionAndIssueSession({
        claims,
        ...(typeof ua === 'string' ? { userAgent: ua } : {}),
        ip: req.ip,
      });
      reply.setCookie(SESSION_COOKIE_NAME, session.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        path: '/',
        expires: expiresAt,
      });
      return {
        actor: {
          id: actor.id,
          external_id: actor.externalId,
          email: actor.email,
          display_name: actor.displayName,
          role_level: actor.roleLevel,
        },
        workspace_id: workspaceId,
      };
    },
  });

  // ── POST /auth/logout ─────────────────────────────────────────────────
  app.route({
    method: 'POST',
    url: '/auth/logout',
    handler: async (req, reply) => {
      const cookie = req.cookies?.[SESSION_COOKIE_NAME];
      if (cookie) {
        await sessionService.revoke(cookie);
      }
      reply.clearCookie(SESSION_COOKIE_NAME, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
      });
      reply.code(204).send();
    },
  });

  // ── GET /me ───────────────────────────────────────────────────────────
  // Authenticated identity probe. Frontend home calls this to decide
  // whether to render the dashboard or redirect to /login.
  app.route({
    method: 'GET',
    url: '/me',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    handler: async (req) => {
      // requireSession guarantees req.session; we narrow it explicitly so
      // exactOptionalPropertyTypes is happy without a non-null assertion.
      const sess = req.session;
      if (!sess) throw new Error('requireSession did not populate req.session');
      const loaded = await sessionService.loadAndTouch(sess.session_id);
      // loadAndTouch can return null if the row was concurrently revoked
      // between the middleware call and here — treat as session_invalid.
      if (!loaded) {
        throw new Error('session vanished mid-request');
      }
      return {
        actor: {
          id: loaded.actor.id,
          external_id: loaded.actor.externalId,
          email: loaded.actor.email,
          display_name: loaded.actor.displayName,
          role_level: loaded.actor.roleLevel,
        },
        workspace_id: sess.workspace_id,
      };
    },
  });
  void ttlSeconds; // reserved for future Max-Age usage if we move off `expires`.
};
