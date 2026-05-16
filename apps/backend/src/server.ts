import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';

import type { AppConfig } from './config.js';
import type { DbHandle } from './db/client.js';
import { statusForCode } from './lib/errors.js';
import { createPgRateLimitStore } from './lib/rate-limit-pg-store.js';
import { createMockAuthProvider } from './modules/auth/mock-auth-provider.js';
import { authRoutes } from './modules/auth/routes.js';
import { createSessionService } from './modules/auth/session-service.js';
import { createCheckService, permissionsRoutes } from './modules/permissions/index.js';

export interface BuildServerOptions {
  config: AppConfig;
  dbHandle: DbHandle;
  /**
   * Optional pg-boss handle. The runtime entrypoint starts pg-boss before
   * buildServer (ADR-0009:22-27 boot order) and threads it through so future
   * modules can attach request-time enqueue helpers without a second pg-boss
   * instance. Slice 1 has no in-request consumers; tests that don't need
   * background jobs may omit it.
   */
  boss?: PgBoss;
}

export async function buildServer(opts: BuildServerOptions): Promise<FastifyInstance> {
  const { config, dbHandle, boss } = opts;

  if (!config.WORKSPACE_ID) {
    throw new Error(
      'WORKSPACE_ID env var is required to build the server (ADR-0006 single seeded workspace).',
    );
  }
  const workspaceId = config.WORKSPACE_ID;

  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      // ADR-0013: logs-first observability via stdout JSON.
    },
    disableRequestLogging: config.NODE_ENV === 'test',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', dbHandle.db);
  if (boss) {
    // Future request handlers that need to enqueue work pull this off the
    // app decorator instead of importing a module-level singleton.
    app.decorate('boss', boss);
  }

  // ── @fastify/helmet ─ ADR-0015:21-37 ─────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', config.PUBLIC_ATTACHMENT_ORIGIN],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", config.PUBLIC_ATTACHMENT_ORIGIN],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
  });

  // ── @fastify/cookie ─ session cookie codec ──────────────────────────
  await app.register(cookie);

  // ── @fastify/rate-limit ─ ADR-0015:7-18 ─────────────────────────────
  // Postgres-backed via our custom store. The global tier is per-Actor when
  // authenticated (100/min) or per-IP when not (50/min); the route-level
  // mutation and sensitive tiers are registered as named groups on the
  // routes that need them. `/health` is exempt via `allowList`.
  const sessionService = createSessionService({ db: dbHandle.db, workspaceId });

  await app.register(rateLimit, {
    global: true,
    max: (req) => (req.session?.actor_id ? 100 : 50),
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/health',
    keyGenerator: (req) => req.session?.actor_id ?? req.ip,
    store: createPgRateLimitStore(dbHandle.pool, 'global') as never,
    errorResponseBuilder: (_req, ctx) => ({
      code: 'rate_limited.actor',
      message: 'rate limit exceeded',
      detail: { retry_after_seconds: Math.ceil(ctx.ttl / 1000) },
    }),
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  // Per-route tiers (ADR-0015:11-13). Registered as helper factories the
  // mutation handlers will attach in later slices. Slice 1 #3 has no
  // consumer of the sensitive tier — the plumbing is in place so #4/#5
  // pick it up without touching server.ts again.
  app.decorate('rateLimitConfig', {
    mutation: {
      max: 10,
      timeWindow: '1 minute',
      keyGenerator: (req: { session?: { actor_id?: string }; ip: string }) =>
        req.session?.actor_id ?? req.ip,
      store: createPgRateLimitStore(dbHandle.pool, 'mutation') as never,
    },
    sensitive: {
      max: 5,
      timeWindow: '1 minute',
      keyGenerator: (req: { session?: { actor_id?: string }; ip: string }) =>
        req.session?.actor_id ?? req.ip,
      store: createPgRateLimitStore(dbHandle.pool, 'sensitive') as never,
    },
  });

  // ── Error handler ─ ADR-0012 envelope ────────────────────────────────
  app.setErrorHandler((err, req, reply) => {
    // HttpError instances carry an ADR-0012 code.
    const code = (err as { code?: string }).code;
    if (typeof code === 'string' && /^[a-z_]+\.[a-z_]+$/.test(code)) {
      const status = statusForCode(code as never);
      return reply
        .code(status)
        .send({ code, message: err.message, detail: (err as { detail?: unknown }).detail });
    }
    // Zod validation errors surface via fastify-type-provider-zod with
    // statusCode 400; remap to ADR-0012 envelope.
    if ((err as { validation?: unknown }).validation) {
      return reply.code(422).send({
        code: 'validation.failed',
        message: err.message,
        detail: { fields: (err as { validation?: unknown }).validation },
      });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ code: 'internal.unexpected', message: 'internal server error' });
  });

  // ── Routes ───────────────────────────────────────────────────────────
  app.route({
    method: 'GET',
    url: '/health',
    schema: {
      response: {
        200: z.object({
          status: z.literal('ok'),
          ts: z.string().datetime(),
        }),
      },
    },
    handler: async () => ({ status: 'ok' as const, ts: new Date().toISOString() }),
  });

  const authProvider = createMockAuthProvider({ db: dbHandle.db, workspaceId });
  await app.register(authRoutes, {
    authProvider,
    sessionService,
    workspaceId,
    nodeEnv: config.NODE_ENV,
  });

  // ── Permissions module — slice 1 issue #4 ───────────────────────────────
  // Registered AFTER auth so requireSession is available on its routes.
  const checkService = createCheckService({ db: dbHandle.db });
  await app.register(permissionsRoutes, {
    sessionService,
    checkService,
    workspaceId,
  });

  return app;
}
