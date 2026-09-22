import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { PgBoss } from 'pg-boss';
import type { Logger as PinoLogger } from 'pino';

import type { AppConfig } from './config.js';
import type { DbHandle } from './db/client.js';
import { registerHttpErrorHandler } from './lib/http-error-handler.js';
import { reqLogSerializer } from './lib/logger.js';
import { createRateLimitActorCache } from './lib/rate-limit-actor-cache.js';
import { createPgRateLimitStore } from './lib/rate-limit-pg-store.js';
import { buildRateLimitTiers } from './lib/rate-limit-tiers.js';
import { getStorage } from './lib/storage/factory.js';
import type { StorageBackend } from './lib/storage/index.js';
import { SESSION_COOKIE_NAME } from './middleware/require-session.js';
import {
  analyticsAreasRoutes,
  createAnalyticsAreaService,
} from './modules/analytics-areas/index.js';
import { MAX_ATTACHMENT_BYTES, attachmentsRoutes } from './modules/attachments/index.js';
import { createAttachmentsService } from './modules/attachments/service.js';
import { createDashboardService, dashboardRoutes } from './modules/dashboard/index.js';
import { listActorsRoutes } from './modules/auth/list-actors-routes.js';
import type { AuthProvider } from './modules/auth/auth-provider.js';
import { createMockAuthProvider } from './modules/auth/mock-auth-provider.js';
import { createOidcAuthProvider } from './modules/auth/oidc-auth-provider.js';
import { authRoutes } from './modules/auth/routes.js';
import { createSessionService } from './modules/auth/session-service.js';
import { createAuditService } from './modules/core/audit/index.js';
import { healthRoutes } from './modules/core/health/routes.js';
import { createIdempotencyService } from './modules/core/idempotency/idempotency-service.js';
import { createEntityLinksService, entityLinksRoutes } from './modules/entity-links/index.js';
import { createFindingsService, findingsRoutes } from './modules/findings/index.js';
import {
  createManagedSystemService,
  managedSystemsRoutes,
} from './modules/managed-systems/index.js';
import { createNavCountsService, navRoutes, type NavCountsService } from './modules/nav/index.js';
import { createSavedViewsService, savedViewsRoutes } from './modules/saved-views/index.js';
import {
  createCheckService,
  createDecisionService,
  createRequestService,
  permissionsRoutes,
} from './modules/permissions/index.js';
import { createSurveysService, surveysRoutes } from './modules/surveys/index.js';
import { createTaskRequestsService, taskRequestsRoutes } from './modules/task-requests/index.js';
import { createTasksService, tasksRoutes } from './modules/tasks/index.js';
import { createVocClustersService, vocClustersRoutes } from './modules/voc-clusters/index.js';
import {
  createWorkspaceSettingsService,
  getResolvedWorkspaceSettings,
  workspaceSettingsRoutes,
} from './modules/workspace-settings/index.js';
import {
  createConversationService,
  createPublicUpdateReviewCandidateService,
  createVocEmbeddingEnqueuer,
  createVocRecommendationsService,
  createVocReadService,
  createVocService,
  vocRecommendationsRoutes,
  vocRoutes,
} from './modules/voc/index.js';
import { isEmbeddingEnabled } from './modules/voc/embedding/factory.js';
import {
  createPreSubmitVocPeersService,
  preSubmitVocPeersRoutes,
} from './modules/voc/pre-submit-peers/index.js';

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
   * Optional process root logger (ADR-0013, amended 2026-09-22). When given,
   * Fastify attaches it via `loggerInstance` so request logs share the ONE
   * pino config the job logs use. Omitted (route tests): the inline logger
   * options below apply, byte-for-byte as before.
   */
  logger?: PinoLogger;
  /**
   * Optional storage backend override. Used by integration tests to inject a
   * mock instead of constructing the real S3-compat backend from env. In
   * production this is undefined and `getStorage()` builds the singleton.
   */
  storage?: StorageBackend;
  /**
   * Per-check budget in ms for the `GET /health/ready` dependency probes
   * (ADR-0013, amended 2026-09-22). Tests shrink it to keep
   * hanging-dependency cases fast; production uses the 2000 ms default.
   */
  healthProbeTimeoutMs?: number;
  /** Route-test seam; production constructs the navigation read model below. */
  navCountsService?: NavCountsService;
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
    ...(opts.logger
      ? { loggerInstance: opts.logger }
      : {
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
            // Issue #390: req.url carries the one-time OIDC authorization
            // code on /auth/callback — same req serializer as
            // createRootLogger (redactSensitiveQuery on the url value only).
            serializers: { req: reqLogSerializer },
          },
        }),
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
  // routes that need them. `/health`, `/health/live`, and `/health/ready`
  // are exempt via `allowList` — k8s probes must never see 429.
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
    allowList: (req) =>
      req.url === '/health' || req.url === '/health/live' || req.url === '/health/ready',
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

  // Per-route tiers (ADR-0015:11-13) — lib/rate-limit-tiers.ts. The actor
  // key generator stays here: it closes over sessionService and the
  // rate-limit actor cache, both wired above.
  app.decorate('rateLimitConfig', buildRateLimitTiers(actorAwareKeyGenerator));

  // ── Error handler ─ ADR-0012 envelope (lib/http-error-handler.ts) ────
  // Registered on the ROOT instance: a plugin-scoped setErrorHandler would
  // not cover sibling product routes.
  // Same pino-logger variance as `return app as unknown as FastifyInstance`
  // below: the concrete instance satisfies the default contract at runtime.
  registerHttpErrorHandler(app as unknown as FastifyInstance);

  // ── Health routes ─ ADR-0013 (modules/core/health/routes.ts) ────────
  // Resolved once and shared with the attachments module below. This is the
  // same `opts.storage ?? getStorage()` instance attachment routes already
  // use. `getStorage()` is a lazy proxy: env errors surface on the first
  // `.exists()` call and count as a readiness-check failure there, never a
  // boot crash.
  const attachmentsStorage = opts.storage ?? getStorage();
  await app.register(healthRoutes, {
    pool: dbHandle.pool,
    boss,
    storage: attachmentsStorage,
    ...(opts.healthProbeTimeoutMs !== undefined
      ? { healthProbeTimeoutMs: opts.healthProbeTimeoutMs }
      : {}),
  });

  // ADR-0006:16 — the two providers are swapped by the AUTH_PROVIDER env
  // var. createOidcAuthProvider performs IdP discovery at boot and rejects
  // on failure, so an unreachable/misconfigured issuer fails buildServer
  // BEFORE the HTTP listener starts (issue #390 fail-closed boot).
  let authProvider: AuthProvider;
  switch (config.AUTH_PROVIDER) {
    case 'mock':
      authProvider = createMockAuthProvider({ db: dbHandle.db, workspaceId });
      break;
    case 'oidc':
      // All OIDC_* fields are present by construction — config.ts superRefine
      // requires them when AUTH_PROVIDER=oidc.
      authProvider = await createOidcAuthProvider({
        oidc: {
          issuerUrl: config.OIDC_ISSUER_URL ?? '',
          clientId: config.OIDC_CLIENT_ID ?? '',
          clientSecret: config.OIDC_CLIENT_SECRET ?? '',
          redirectUri: config.OIDC_REDIRECT_URI ?? '',
          scopes: config.OIDC_SCOPES,
        },
        nodeEnv: config.NODE_ENV,
      });
      break;
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
  const decisionService = createDecisionService({
    db: dbHandle.db,
    checkService,
    auditService,
    idempotencyService,
    resolveWorkspaceSettings: getResolvedWorkspaceSettings,
  });
  await app.register(permissionsRoutes, {
    sessionService,
    checkService,
    requestService,
    decisionService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      sensitive: app.rateLimitConfig.sensitive,
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

  // ── Workspace Settings module — Slice 9 issue #195 ─────────────────────
  const workspaceSettingsService = createWorkspaceSettingsService({
    db: dbHandle.db,
    checkService,
    auditService,
  });
  await app.register(workspaceSettingsRoutes, {
    sessionService,
    workspaceSettingsService,
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

  const surveysService = createSurveysService({
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    resolveWorkspaceSettings: getResolvedWorkspaceSettings,
  });
  await app.register(surveysRoutes, {
    sessionService,
    surveysService,
    findingsService,
    workspaceId,
    rateLimitConfig: { mutation: app.rateLimitConfig.mutation, read: app.rateLimitConfig.read },
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

  // #378: constructed before the Tasks module so Task detail can resolve its
  // source VOC's visibility through the canonical VOC read-authority path.
  const vocReadService = createVocReadService({
    db: dbHandle.db,
    checkService,
    entityLinksService,
  });

  // ── Tasks module — Slice 6 issue #134 ────────────────────────────────────
  const tasksService = createTasksService({
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    vocReadService,
    ...(boss ? { boss } : {}),
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
    idempotencyService,
    // #168 (ADR-0034 D6). Disabled provider → the enqueuer is a no-op, so a
    // key-less environment creates no embedding jobs at all.
    embeddingEnqueuer: createVocEmbeddingEnqueuer({
      ...(boss ? { boss } : {}),
      embeddingEnabled: isEmbeddingEnabled(config),
      log: { error: (msg, meta) => app.log.error(meta ?? {}, msg) },
    }),
  });
  const conversationService = createConversationService({
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    vocReadService,
  });
  const publicUpdateReviewCandidateService = createPublicUpdateReviewCandidateService({
    db: dbHandle.db,
    auditService,
    checkService,
    conversationService,
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
  const navCountsService = opts.navCountsService ?? createNavCountsService({
    vocReadService,
    findingsService,
    surveysService,
    vocClustersService,
  });
  await app.register(navRoutes, {
    sessionService,
    navCountsService,
    workspaceId,
    rateLimitConfig: { read: app.rateLimitConfig.read },
  });
  const dashboardService = createDashboardService({
    db: dbHandle.db,
    checkService,
    requestService,
    vocReadService,
  });
  await app.register(dashboardRoutes, {
    sessionService,
    dashboardService,
    workspaceId,
    rateLimitConfig: { read: app.rateLimitConfig.read },
  });

  // #143 actor-private persisted list filters. This is intentionally a root
  // prefix (rather than /nav) because it is a CRUD resource, not navigation's
  // read-only badge aggregation.
  const savedViewsService = createSavedViewsService({ db: dbHandle.db });
  await app.register(savedViewsRoutes, {
    sessionService,
    savedViewsService,
    workspaceId,
    rateLimitConfig: { mutation: app.rateLimitConfig.mutation, read: app.rateLimitConfig.read },
  });

  const vocRecommendationsService = createVocRecommendationsService({
    db: dbHandle.db,
    auditService,
    embeddingVersion: config.EMBEDDING_VERSION,
    embeddingEnabled: isEmbeddingEnabled(config),
    createClustersService: (db) => createVocClustersService({
      db,
      auditService,
      checkService,
      idempotencyService,
      postPublicUpdate: conversationService.postPublicUpdate,
    }),
  });
  await app.register(vocRecommendationsRoutes, {
    sessionService,
    vocRecommendationsService,
    workspaceId,
    rateLimitConfig: { mutation: app.rateLimitConfig.mutation, read: app.rateLimitConfig.read },
  });
  const preSubmitVocPeersService = createPreSubmitVocPeersService({ db: dbHandle.db });
  await app.register(preSubmitVocPeersRoutes, {
    sessionService,
    preSubmitVocPeersService,
    workspaceId,
    rateLimitConfig: { read: app.rateLimitConfig.read },
  });

  // ── VOC module — Slice 3 issue #13 / #14 / #15 / #16 ──────────────────────
  await app.register(vocRoutes, {
    sessionService,
    vocService,
    vocReadService,
    findingsService,
    taskRequestsService,
    conversationService,
    publicUpdateReviewCandidateService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
      reporterEdit: app.rateLimitConfig.reporterEdit,
    },
  });

  // ── Attachments module — Slice 3 #22 / PLAN-22 C3a + C3b ────────────────
  // `attachmentsStorage` is resolved once above the health probes.
  const attachmentsService = createAttachmentsService({
    storage: attachmentsStorage,
    auditService,
    db: dbHandle.db,
    idempotencyService,
    vocReadService,
  });
  await app.register(attachmentsRoutes, {
    sessionService,
    attachmentsService,
    workspaceId,
    rateLimitConfig: {
      attachmentMutation: app.rateLimitConfig.attachmentMutation,
    },
  });

  // When `loggerInstance` is supplied, Fastify types the instance with the
  // concrete pino `Logger`; TS cannot prove it satisfies the default
  // FastifyBaseLogger-typed `FastifyInstance` contract, but at runtime the
  // pino logger IS a superset of that contract — hence the unknown cast.
  return app as unknown as FastifyInstance;
}
