// Fastify request augmentation. `req.session` is populated by the
// `requireSession` middleware; `app.db` is the runtime Drizzle handle
// (fops_app role) wired in `buildServer`.

import 'fastify';
import type { PgBoss } from 'pg-boss';
import type { Db } from '../db/client.js';
import type { RoleLevel } from '../modules/auth/session-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    session?: {
      session_id: string;
      actor_id: string;
      workspace_id: string;
      role_level: RoleLevel;
    };
  }
  interface FastifyInstance {
    db: Db;
    /**
     * Present when the runtime entrypoint passed a pg-boss handle to
     * buildServer (ADR-0009). Slice 1 has no in-request consumers, so it
     * stays optional; future modules typing this field will tighten the
     * contract as they need it.
     */
    boss?: PgBoss;
    rateLimitConfig: {
      mutation: Record<string, unknown>;
      sensitive: Record<string, unknown>;
      read: Record<string, unknown>;
      reporterEdit: Record<string, unknown>;
    };
  }
}
