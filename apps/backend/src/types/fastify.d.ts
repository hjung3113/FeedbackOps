// Fastify request augmentation. `req.session` is populated by the
// `requireSession` middleware; `app.db` is the runtime Drizzle handle
// (fops_app role) wired in `buildServer`.

import 'fastify';
import type { Db } from '../db/client.js';

declare module 'fastify' {
  interface FastifyRequest {
    session?: {
      session_id: string;
      actor_id: string;
      workspace_id: string;
    };
  }
  interface FastifyInstance {
    db: Db;
    rateLimitConfig: {
      mutation: Record<string, unknown>;
      sensitive: Record<string, unknown>;
    };
  }
}
