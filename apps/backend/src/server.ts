import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { errorCodeSchema } from '@fops/shared';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';

import type { AppConfig } from './config.js';
import type { DbHandle } from './db/client.js';
import { type ZodIssueShape, fieldsFromZodIssues, statusForCode } from './lib/errors.js';
import { createRateLimitActorCache } from './lib/rate-limit-actor-cache.js';
import { createPgRateLimitStore } from './lib/rate-limit-pg-store.js';
import { getStorage } from './lib/storage/factory.js';
import type { StorageBackend } from './lib/storage/index.js';
import { SESSION_COOKIE_NAME } from './middleware/require-session.js';
import {
  analyticsAreasRoutes,
  createAnalyticsAreaService,
} from './modules/analytics-areas/index.js';
import { MAX_ATTACHMENT_BYTES, attachmentsRoutes } from './modules/attachments/index.js';
import { createAttachmentsService } from './modules/attachments/service.js';
import { listActorsRoutes } from './modules/auth/list-actors-routes.js';
import { createMockAuthProvider } from './modules/auth/mock-auth-provider.js';
import { authRoutes } from './modules/auth/routes.js';
import { createSessionService } from './modules/auth/session-service.js';
import { createAuditService } from './modules/core/audit/index.js';
import { createIdempotencyService } from './modules/core/idempotency/idempotency-service.js';
import { createEntityLinksService, entityLinksRoutes } from './modules/entity-links/index.js';
import { createFindingsService, findingsRoutes } from './modules/findings/index.js';
import {
  createManagedSystemService,
  managedSystemsRoutes,
} from './modules/managed-systems/index.js';
import {
  createCheckService,
  createRequestService,
  permissionsRoutes,
} from './modules/permissions/index.js';
import { createTaskRequestsService, taskRequestsRoutes } from './modules/task-requests/index.js';
import { createTasksService, tasksRoutes } from './modules/tasks/index.js';
import { createVocClustersService, vocClustersRoutes } from './modules/voc-clusters/index.js';
import {
  createConversationService,
  createVocReadService,
  createVocService,
  vocRoutes,
} from './modules/voc/index.js';

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
  /**
   * Optional storage backend override. Used by integration tests to inject a
   * mock instead of constructing the real S3-compat backend from env. In
   * production this is undefined and `getStorage()` builds the singleton.
   */
  storage?: StorageBackend;
}

export async function buildServer(opts: BuildServerOptions): Promise<FastifyInstance> {
  const { config, dbHandle, boss } = opts;

  if (!config.WORKSPACE_ID) {
    throw new Error(
      'WORKSPACE_ID env var is required to build the server (ADR-0006 single seeded workspace).',
    );
  }
  // Review HTTP-H-1: refuse to boot the mock provider in production. The
  // route-level `/auth/mock-login` 404 gate stays as defense-in-depth, but
  // the boot-time refusal is the primary contract — an operator who forgets
  // to flip `AUTH_PROVIDER=oidc` gets a loud failure at startup instead of
  // a silent auth-bypass surface (CWE-489).
  if (config.NODE_ENV === 'production' && config.AUTH_PROVIDER === 'mock') {
    throw new Error(
      'AUTH_PROVIDER=mock is not permitted in production (ADR-0006). Set AUTH_PROVIDER=oidc.',
    );
  }
  const workspaceId = config.WORKSPACE_ID;

  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      // ADR-0013: logs-first observability via stdout JSON.
      // Review HTTP-M-3: redact request-header lines that carry secrets
      // (cookie holds the session id; idempotency-key correlates a single
      // actor's retries). Without this, anyone with log access can lift a
      // live session out of stdout (CWE-532).
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers["set-cookie"]',
          'req.headers.authorization',
          'req.headers["idempotency-key"]',
        ],
        remove: true,
      },
    },
    disableRequestLogging: config.NODE_ENV === 'test',
    // F-009 + Review HTTP-H-2: `trustProxy: true` is too permissive — it
    // trusts the entire X-Forwarded-For chain, so any client can spoof
    // `req.ip` and reset their anon rate-limit bucket (and the IP recorded
    // in session/audit rows). ADR-0015:7-14 keys on `req.ip` so trust must
    // be bounded to the operator-configured hop count. Default 0 outside
    // prod (identical to `trustProxy: false`); prod operators set
    // `TRUSTED_PROXY_HOPS=1` when a single ingress terminates TLS.
    trustProxy: config.NODE_ENV === 'production' ? Math.max(config.TRUSTED_PROXY_HOPS, 0) : false,
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

  // ── @fastify/multipart ─ PLAN-22 C3a ────────────────────────────────
  // 25 MiB cap (D-06). Limits are global — only POST /attachments accepts
  // multipart today; other routes still validate as JSON.
  await app.register(multipart, {
    limits: {
      fileSize: MAX_ATTACHMENT_BYTES,
      files: 1,
    },
  });

  // ── @fastify/rate-limit ─ ADR-0015:7-18 ─────────────────────────────
  // Postgres-backed via our custom store. The global tier is per-Actor when
  // authenticated (100/min) or per-IP when not (50/min); the route-level
  // mutation and sensitive tiers are registered as named groups on the
  // routes that need them. `/health` is exempt via `allowList`.
  const sessionService = createSessionService({ db: dbHandle.db, workspaceId });

  // Adversarial review API-C-2: `@fastify/rate-limit` runs as an
  // `onRequest` hook, which fires BEFORE the `requireSession` preHandler
  // that populates `req.session`. The prior keyGenerator therefore always
  // observed `undefined` and fell back to `req.ip`, collapsing all users
  // behind a shared NAT into one bucket. We resolve the session cookie
  // inline before bucket selection so the per-actor bucket is the
  // workspace+actor identity when a valid session cookie is present, and
  // `req.ip` only for unauthenticated traffic.
  const rateLimitActorCache = createRateLimitActorCache();
  const resolveRateLimitActorKey = async (req: FastifyRequest): Promise<string> => {
    const raw = req.cookies?.[SESSION_COOKIE_NAME];
    const token = typeof raw === 'string' ? raw : undefined;
    if (token) {
      const cachedIdentity = rateLimitActorCache.get(token);
      if (cachedIdentity) {
        return `${cachedIdentity.workspace_id}:${cachedIdentity.actor_id}`;
      }

      try {
        const identity = await sessionService.lookupActorIdByToken(token);
        if (identity) {
          rateLimitActorCache.set(token, identity);
          return `${identity.workspace_id}:${identity.actor_id}`;
        }
      } catch (err) {
        req.log?.warn?.({ err }, 'rate-limit actor lookup failed; falling back to ip');
      }
    }
    return req.ip;
  };

  const actorAwareKeyGenerator = async (req: FastifyRequest): Promise<string> => {
    return resolveRateLimitActorKey(req);
  };

  await app.register(rateLimit, {
    global: true,
    max: (req, key) => (key === req.ip ? 50 : 100),
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/health',
    keyGenerator: actorAwareKeyGenerator,
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
      keyGenerator: actorAwareKeyGenerator,
      routeGroup: 'mutation',
    },
    sensitive: {
      max: 5,
      timeWindow: '1 minute',
      keyGenerator: actorAwareKeyGenerator,
      routeGroup: 'sensitive',
    },
    // TODO(F18 follow-up): add admin bypass for the read tier once the
    // admin-role detection helper lands (see plan §C3 follow-up F18).
    read: {
      max: 300,
      timeWindow: '1 minute',
      keyGenerator: actorAwareKeyGenerator,
      routeGroup: 'read',
    },
    // Slice 3 #17 — Reporter pre-triage edit (PATCH /vocs/:id/description).
    // 30/min per actor (more permissive than generic `mutation: 10/min` because
    // a single edit session can produce several saves; less than read tier).
    // Plan §spec issue #17.
    reporterEdit: {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: actorAwareKeyGenerator,
      routeGroup: 'reporter_edit',
    },
    // PLAN-22 C3a — POST /attachments. 20/min per actor. Admin bypass is a
    // documented follow-up: it depends on the same admin-role helper called
    // out for the read tier above; once that lands, both tiers gain `skip`.
    attachmentMutation: {
      max: 20,
      timeWindow: '1 minute',
      keyGenerator: actorAwareKeyGenerator,
      routeGroup: 'attachment_mutation',
    },
  });

  // ── Error handler ─ ADR-0012 envelope ────────────────────────────────
  app.setErrorHandler((err, req, reply) => {
    // HttpError instances carry an ADR-0012 code. Use the zod enum schema
    // (closed ErrorCode union from @fops/shared) so an unknown code like
    // `internal.something_new` falls through to the generic 500 branch
    // below instead of being silently widened by a regex+`as never` cast.
    const rawCode = (err as { code?: string }).code;
    if (typeof rawCode === 'string') {
      const parsed = errorCodeSchema.safeParse(rawCode);
      if (parsed.success) {
        const status = statusForCode(parsed.data);
        const errDetail = (err as { detail?: Record<string, unknown> }).detail;
        // F3: `requestable_permission` belongs at the top level of ErrorEnvelope
        // (ADR-0012 / packages/shared/src/errors/codes.ts:67-71). Hoist it out
        // of `detail` when present so the wire format matches the typed contract.
        let hoisted: Record<string, unknown> | undefined;
        let cleanDetail: Record<string, unknown> | undefined = errDetail;
        if (errDetail && 'requestable_permission' in errDetail) {
          const { requestable_permission, ...rest } = errDetail;
          hoisted = requestable_permission as Record<string, unknown>;
          cleanDetail = Object.keys(rest).length > 0 ? rest : undefined;
        }
        const envelope: Record<string, unknown> = {
          code: parsed.data,
          message: err.message,
          detail: cleanDetail,
        };
        if (hoisted !== undefined) envelope.requestable_permission = hoisted;
        return reply.code(status).send(envelope);
      }
    }
    // Zod validation errors surface via fastify-type-provider-zod with
    // statusCode 400; remap to ADR-0012 envelope. Review HTTP-M-1:
    // fastify-type-provider-zod returns the raw ZodIssue array in
    // `err.validation`. Slim each entry to `{path, code}` so internal
    // field paths and discriminator codes are not exposed (CWE-209).
    const validation = (err as { validation?: unknown }).validation;
    if (validation) {
      const issues = Array.isArray(validation) ? (validation as ZodIssueShape[]) : [];
      return reply.code(422).send({
        code: 'validation.failed',
        message: err.message,
        detail: { fields: fieldsFromZodIssues(issues) },
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

  // ADR-0006:16 — the two providers are swapped by the AUTH_PROVIDER env
  // var. Slice 1 ships only the mock provider; `oidc` is reserved for the
  // slice that lands real OIDC. We refuse to boot rather than silently
  // serve mock when the operator asked for oidc.
  let authProvider: ReturnType<typeof createMockAuthProvider>;
  switch (config.AUTH_PROVIDER) {
    case 'mock':
      authProvider = createMockAuthProvider({ db: dbHandle.db, workspaceId });
      break;
    case 'oidc':
      throw new Error(
        'OidcAuthProvider not yet implemented (ADR-0006). Set AUTH_PROVIDER=mock or wait for the OIDC slice.',
      );
    default:
      throw new Error(`Unknown AUTH_PROVIDER value: ${String(config.AUTH_PROVIDER)}`);
  }
  await app.register(authRoutes, {
    authProvider,
    sessionService,
    workspaceId,
    nodeEnv: config.NODE_ENV,
  });

  // ── GET /actors — workspace actor list (post-#21 drift fix) ─────────────
  // FE Triage OwnerPicker (`useWorkspaceActors`) calls this; the route was
  // never registered alongside #21's FE work, leaving the assignee picker
  // silently empty in dev. Registered after authRoutes so requireSession is
  // available.
  await app.register(listActorsRoutes, {
    db: dbHandle.db,
    sessionService,
    workspaceId,
  });

  // ── Permissions module — slice 1 issue #4 ───────────────────────────────
  // Registered AFTER auth so requireSession is available on its routes.
  const checkService = createCheckService({ db: dbHandle.db });
  const auditService = createAuditService();
  const idempotencyService = createIdempotencyService();
  const requestService = createRequestService({
    db: dbHandle.db,
    checkService,
    auditService,
    idempotencyService,
  });
  await app.register(permissionsRoutes, {
    sessionService,
    checkService,
    requestService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
    },
  });

  // ── Managed Systems module — Slice 2 issue #10 ──────────────────────────
  const managedSystemService = createManagedSystemService({
    db: dbHandle.db,
    checkService,
    auditService,
    idempotencyService,
  });
  await app.register(managedSystemsRoutes, {
    sessionService,
    managedSystemService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
    },
  });

  // ── Analytics Areas module — Slice 2 issue #11 ──────────────────────────
  const analyticsAreaService = createAnalyticsAreaService({
    db: dbHandle.db,
    checkService,
    auditService,
    idempotencyService,
  });
  await app.register(analyticsAreasRoutes, {
    sessionService,
    analyticsAreaService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
    },
  });

  // ── Entity Links module — Slice 4.1 issue #112 ────────────────────────────
  const entityLinksService = createEntityLinksService({
    db: dbHandle.db,
    checkService,
    auditService,
  });
  await app.register(entityLinksRoutes, {
    sessionService,
    entityLinksService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
    },
  });

  // ── Findings module — Slice 5 issue #122 ─────────────────────────────────
  const findingsService = createFindingsService({
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    entityLinksService,
  });
  await app.register(findingsRoutes, {
    sessionService,
    findingsService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
    },
  });

  // ── Task Requests module — Slice 6 issue #132 ─────────────────────────────
  const taskRequestsService = createTaskRequestsService({
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
  });
  await app.register(taskRequestsRoutes, {
    sessionService,
    taskRequestsService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
    },
  });

  // ── Tasks module — Slice 6 issue #134 ────────────────────────────────────
  const tasksService = createTasksService({
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
  });
  await app.register(tasksRoutes, {
    sessionService,
    tasksService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
    },
  });

  // VOC conversation command is constructed here so cluster candidate apply can
  // delegate each selected VOC to the canonical per-VOC command.
  const vocService = createVocService({
    db: dbHandle.db,
    auditService,
    checkService,
  });
  const vocReadService = createVocReadService({
    db: dbHandle.db,
    checkService,
    entityLinksService,
  });
  const conversationService = createConversationService({
    auditService,
    checkService,
    vocReadService,
  });

  // ── VOC Cluster module — Slice 5 issue #126 ───────────────────────────────
  const vocClustersService = createVocClustersService({
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    postPublicUpdate: conversationService.postPublicUpdate,
  });
  await app.register(vocClustersRoutes, {
    sessionService,
    vocClustersService,
    taskRequestsService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
    },
  });

  // ── VOC module — Slice 3 issue #13 / #14 / #15 / #16 ──────────────────────
  await app.register(vocRoutes, {
    db: dbHandle.db,
    sessionService,
    vocService,
    vocReadService,
    findingsService,
    taskRequestsService,
    conversationService,
    idempotencyService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
      reporterEdit: app.rateLimitConfig.reporterEdit,
    },
  });

  // ── Attachments module — Slice 3 #22 / PLAN-22 C3a + C3b ────────────────
  const attachmentsStorage = opts.storage ?? getStorage();
  const attachmentsService = createAttachmentsService({
    storage: attachmentsStorage,
    auditService,
    db: dbHandle.db,
    vocReadService,
  });
  await app.register(attachmentsRoutes, {
    db: dbHandle.db,
    sessionService,
    attachmentsService,
    idempotencyService,
    workspaceId,
    rateLimitConfig: {
      attachmentMutation: app.rateLimitConfig.attachmentMutation,
    },
  });

  return app;
}
