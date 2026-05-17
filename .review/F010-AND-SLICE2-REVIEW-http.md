# HTTP route + security adversarial review (commits a062062..HEAD)

Scope: Fastify routes, plugins, middleware, request handling. Services and UI excluded. Resolved Slice 1 findings (F-001..F-021) not re-flagged.

## Critical

_(none)_

## High

### H-1. `AUTH_PROVIDER=mock` is not gated by `NODE_ENV=production`
**Where:** `apps/backend/src/server.ts:209-220` and `apps/backend/src/config.ts:15`.
**Why it matters:** ADR-0006:16 says the providers are switched by `AUTH_PROVIDER` and Slice 1 ships only mock. The route layer in `apps/backend/src/modules/auth/routes.ts:36,52` correctly 404s the `/auth/mock-login` HTML+POST handlers when `nodeEnv === 'production'`, but the `buildServer` switch will happily instantiate `createMockAuthProvider` in production if the operator forgets to flip `AUTH_PROVIDER=oidc`. The mock provider mints `AuthClaims` from any `external_id` row in `core.actors`; combined with a misconfigured ingress that exposes the POST endpoint, this is a silent authentication-bypass surface. Even with the route gate in place, the policy bug is "boot succeeded with `AUTH_PROVIDER=mock` in prod" — the operator-facing failure should be loud at boot, not at first /auth/mock-login hit. CWE-489 (Active Debug Code / dev provider reachable in prod).
**Recommendation:** In `buildServer` (or `loadConfig`) refuse to boot when `config.NODE_ENV === 'production' && config.AUTH_PROVIDER === 'mock'` with an explicit ADR-0006 message. The route-level 404 stays as defense-in-depth.

### H-2. `trustProxy: true` is unconditional — anonymous rate-limit + audit IPs become spoofable in dev/test/standalone deploys
**Where:** `apps/backend/src/server.ts:73`.
**Why it matters:** ADR-0015:7-14 keys anon rate-limit on `req.ip` (`50/min` per IP). With `trustProxy: true` Fastify trusts the entire `X-Forwarded-For` chain even when no ingress is in front — any client can send `X-Forwarded-For: <spoofed>` and reset their bucket every request. The block comment on line 67-72 acknowledges "deployment is expected to terminate TLS at a single trusted hop" but the flag is on in test/dev/CI too, and the production trust list is not configured. Same `req.ip` flows into the session row (`session-service` consumes it) and `core.audit_log.actor_ip` chains (Slice 1 F-006 area), so audit attribution is spoofable. CWE-348 (Use of Less Trusted Source).
**Recommendation:** Pass a hop count or trusted-proxy list instead of `true`: e.g. `trustProxy: config.TRUSTED_PROXY_HOPS ?? 1` for prod, `false` for `NODE_ENV !== 'production'`. Add a config knob (already flagged in the inline comment as a future tightening).

## Medium

### M-1. `validation.failed` leaks raw Zod issue objects (paths, internal codes, input previews) to clients
**Where:** `apps/backend/src/server.ts:179-185`, plus `apps/backend/src/modules/managed-systems/routes.ts:125-127` and `apps/backend/src/modules/analytics-areas/routes.ts:121-124` (`{ issues: parsed.error.issues }`).
**Why it matters:** ADR-0012 envelope says `code` + `message` + structured `detail`. Returning the raw Zod `issues` array surfaces internal field paths, discriminator codes (`invalid_union_discriminator`, `unrecognized_keys`), and in some Zod versions an `input` snapshot. For controllers the global error handler ships `detail: { fields: err.validation }` — Fastify-zod's validation array carries the offending field names which is fine, but the MS/AA in-handler safeParse paths attach the full `issues` payload without filtering. ADR-0012:25-34 expects a stable contract — leaking internal Zod shapes invites client-side coupling and aids enumeration. CWE-209 (Information Exposure Through Error Message).
**Recommendation:** Map issues to `{ path, code }` only (drop `message`, `input`, `params`). Apply to both routes and the global handler. The Slice 1 cleanup F-019 area used a `fieldsFromZod` helper — reuse that here for symmetry.

### M-2. CSP default `PUBLIC_ATTACHMENT_ORIGIN=\"'self'\"` double-encodes `'self'` in `img-src` / `connect-src`
**Where:** `apps/backend/src/config.ts:20` (`PUBLIC_ATTACHMENT_ORIGIN: z.string().default(\"'self'\")`) flowing into `apps/backend/src/server.ts:92,94`.
**Why it matters:** ADR-0015:30,37 says `connect-src 'self' {{ATTACHMENT_ORIGIN}}` resolved at boot. The defaulted value is the literal string `'self'` (with quotes), producing CSP `img-src 'self' data: 'self'` — syntactically valid but signals a parsing mistake. More importantly, an operator who sets `PUBLIC_ATTACHMENT_ORIGIN=https://cdn.example.com` without realising the keyword-vs-source distinction will be fine, but anyone who provides `*` or a malformed scheme will silently widen the policy. The default also accepts any string with no URL validation. CWE-1188 (Insecure Default Initialization).
**Recommendation:** Validate `PUBLIC_ATTACHMENT_ORIGIN` as either the literal `self` or a `z.string().url()`. When boot resolves the directive, emit `'self'` only when no override is set rather than relying on a quoted string default.

### M-3. Fastify logger has no header redaction — `Idempotency-Key`, `Cookie`, `Authorization` flow into request logs
**Where:** `apps/backend/src/server.ts:60-65` (no `redact` block in the logger config) plus header reads at `apps/backend/src/modules/permissions/routes.ts:168`, `managed-systems/routes.ts:67`, `analytics-areas/routes.ts:64`.
**Why it matters:** ADR-0013 mandates logs-first observability via stdout JSON; without an explicit `redact` allow-list pino's default request serializer logs `req.headers.cookie` (carries `fops_session`) and `req.headers['idempotency-key']` (carries the actor's mutation correlator). Idempotency keys are not strictly secrets but session cookies are — anyone with log access can resurrect a live session. CWE-532 (Insertion of Sensitive Information into Log File).
**Recommendation:** Add `logger: { redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers[\"set-cookie\"]'], remove: true } }` to the Fastify options.

## Low

### L-1. Repeated `loadActorContext` per request — N+1 between session and capability checks
**Where:** `apps/backend/src/modules/permissions/routes.ts:57-67`, `managed-systems/routes.ts:57-64`, `analytics-areas/routes.ts:54-61`.
**Why it matters:** Not a security flaw, but every protected mutation runs `requireSession` (which already touched `core.actors` indirectly via session join) then re-selects the actor row to read `roleLevel`. AGENTS.md "controllers parse HTTP and map responses only" is satisfied; the duplication is a perf/consistency papercut and a place where session-vs-actor-row drift can produce surprising `auth.session_invalid` after the session was already validated.
**Recommendation:** Have `requireSession` populate `req.session.role_level` (the session row already joins actors). Then drop `loadActorContext` from all three route files.

### L-2. `validation.immutable_field` rejects only at top level — nested mutations of immutable fields would slip
**Where:** `apps/backend/src/modules/managed-systems/routes.ts:117-122`, `analytics-areas/routes.ts:109-119`.
**Why it matters:** ADR-0017 slug immutability. The current guard uses `'slug' in rawBody`. Schema only allows flat keys today, so the check is sufficient — but if a future schema iteration nests fields (e.g. `meta: { slug }`), the immutable-field guard would silently miss. Pattern-consistency observation, not a live bug.
**Recommendation:** Once the safeParse runs, additionally diff `parsed.data` against the DB row's immutable fields server-side, so the invariant is enforced on the canonical shape rather than the raw payload.

### L-3. No body size limit override — defaults to Fastify's 1 MB
**Where:** `apps/backend/src/server.ts:60-74` (no `bodyLimit` option).
**Why it matters:** ADR-0015 lists rate-limit + headers + idempotency but is silent on body size. Default 1 MB is fine for the JSON surfaces shipped to date (`reason` capped at 2000 chars). Worth flagging because the next slice that lands rich-text or attachments may want a tighter per-route override to prevent memory pressure from oversize POSTs slipping past validation. CWE-770.
**Recommendation:** Document the default in `server.ts` (`Fastify({ bodyLimit: 1_048_576, ... })`) so subsequent slices have a single line to tune.

## Verified clean

- Every Slice 2 mutation route attaches `requireSession` + `requireWorkspace` preHandlers and the per-route `rateLimitConfig.mutation` tier (ADR-0015:11): `managed-systems/routes.ts:83-84,108-109,149-150` and `analytics-areas/routes.ts:79-80,103-104,145-146`.
- `workspace_id` for every write is sourced from `req.session.workspace_id`, never from body/query/params. Service layer uses `actor.workspace_id` consistently (`managed-system-service.ts:178,264,347,415,443,456,495`).
- Capability gate `workspace.admin` is enforced inside the service before any DB mutation (`managed-system-service.ts:5-13` block comment; mirrored in analytics-area-service). ADR-0006/0017 satisfied — there is no admin-only route lacking a capability check.
- `Idempotency-Key` UUIDv4 regex (ADR-0015:72) is consistent across all three mutation modules (`managed-systems/routes.ts:16-17`, `analytics-areas/routes.ts:14-15`, `permissions/routes.ts:33-34`) — Slice 1 #7 tightening preserved.
- ADR-0012 error envelope mapping is centralized in `lib/errors.ts:9-19` with prefix-to-status table; helper `sendError` used uniformly. `auth.workspace_mismatch` explicit-mapped to 403 before the wildcard `auth.` 401 prefix.
- Generic 500 branch in `server.ts:186-187` returns `{ code: 'internal.unexpected', message: 'internal server error' }` with no stack/cause leakage.
- Mock-login HTML route is gated behind `nodeEnv !== 'production'` AND `authProvider.name === 'mock'` (`auth/routes.ts:36,52`); 404 (`not_found.record`) avoids existence-leak.
- Session cookie carries `httpOnly`, `sameSite: 'lax'`, `secure: isProd`, `path: '/'`, and an explicit expiry (`auth/routes.ts:63-69`).
- Helmet CSP forbids `script-src 'unsafe-inline'` and `'unsafe-eval'`; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` match ADR-0015:21-37. `style-src 'unsafe-inline'` explicitly justified.
- CORS not registered — consistent with ADR-0015:41 ("CORS: not enabled. Frontend and backend share an origin").
- Rate-limit `errorResponseBuilder` returns the ADR-0012 envelope `rate_limited.actor` with `retry_after_seconds` detail and the required headers (`server.ts:120-135`).
- `/health` is correctly excluded from the global limiter via `allowList`.
- Zod safeParse error rendering uses `validation.failed` (422) and `validation.unknown_capability` / `validation.malformed_idempotency_key` / `validation.immutable_field` codes from the closed ADR-0012 union.
- `requireWorkspace` defensively re-checks `req.session` presence and maps the missing-session case to `auth.session_invalid` rather than crashing (`middleware/require-workspace.ts:14-19`).

---

Summary:
- Zero Critical, two High (mock-provider prod-boot gate missing; unconditional `trustProxy: true` makes anon-rate-limit + audit IPs spoofable in non-ingress environments).
- Three Medium: raw Zod `issues` leak in `validation.failed`, CSP `'self'` double-encoding via the env default, no logger header redaction for cookie / idempotency-key.
- Three Low pattern/perf notes; capability gating, workspace isolation, idempotency UUID enforcement, mock-login prod gate at route layer, CSP shape, and session cookie attributes are all verified clean.
- Pattern consistency across MS / AA / permission-request mutation routes is excellent — same regex, same `loadActorContext`, same envelope helpers, same idempotency parsing.
- Top fix priority: H-1 (one-line boot guard) and H-2 (config-driven `trustProxy` hop count); both are config-layer changes with no route-surface impact.
