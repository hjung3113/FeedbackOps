# Observability and deployment: structured logs on stdout, k8s for production

## Deployment shape

FeedbackOps deploys to a **Docker container running on the company's internal Kubernetes cluster**. The build artifact is a single OCI image per app (`apps/backend`, `apps/frontend`) plus a migration job image; a Helm chart in `infra/helm/` parameterises namespace, ingress, secrets, ConfigMap, and Postgres connection.

We do not target a serverless platform or a managed PaaS in MVP:

- Sessions are stateful (ADR-0006), pg-boss runs in-process (ADR-0009), and the attachment storage is server-proxied (ADR-0011) — all three assume long-lived pods.
- The corporate IdP procurement (ADR-0006) will provide credentials via the k8s secret store, not platform-vendor SSO.

Local development uses `docker compose` with Postgres, the backend, and the frontend dev server in three containers; CI runs the same compose stack for integration tests.

## Logging

The only observability signal we ship in MVP is **structured logs to stdout**:

- Backend uses Fastify's default **Pino** logger emitting JSON one line per event.
- Frontend logs nothing to a backend collector; client-side errors raise an exception with `code` (ADR-0012) that the user can copy from a developer overlay in dev mode. Production frontend logging is deferred.
- The k8s pod log stream is consumed by the company's existing log collector (ELK, Loki, Splunk, etc. — we are platform-agnostic at the application layer). We do not call a vendor SDK from application code.

Log lines include:

```text
- timestamp
- level
- request_id (per HTTP request and per pg-boss job; same id flows through every line)
- actor_id (when a session is present)
- workspace_id (when known)
- event (short verb, e.g. 'voc.created', 'task_request.approved', 'sensitive_permission.used')
- duration_ms (for completion lines)
- code (when an error response was returned, matching ADR-0012)
```

`message` text is English and stable; the structured fields are how the company log collector indexes events.

PII handling: `email` and `display_name` are logged only on auth events (login, logout); domain logs use `actor_id`. Rich-content bodies and attachment contents are never logged.

## Metrics and tracing — deferred

OpenTelemetry SDK, Prometheus `/metrics`, and tracing are all **out of MVP**. The reason is purely operational: emitting metrics nobody collects, or traces nobody renders, adds dependencies and CPU cost without producing alerts or insights. We will introduce them via a follow-up ADR once the company-side collector for at least one of metrics or traces is known.

To keep that follow-up cheap, MVP code:

- Wraps the Fastify request lifecycle with a hook that already gathers latency and outcome — adding an OpenTelemetry exporter later is one config line.
- Wraps each pg-boss job handler with the same hook.
- Avoids inventing a parallel "monitoring" utility; everything goes through Pino for now.

## Secrets and config

- All non-secret config comes from env vars defined in `apps/backend/src/config/env.ts` (parsed by Zod, fail-fast on missing required values).
- Secrets (`DATABASE_URL`, `OIDC_CLIENT_SECRET`, `S3_SECRET_ACCESS_KEY`, etc.) come from k8s `Secret` objects mounted as env vars.
- No secret is logged. The env parser explicitly redacts known secret keys in any startup-time config-dump log.
- `.env` files are used only in local dev; CI never reads `.env`.

## Health endpoints

The backend exposes two endpoints used by k8s probes and the ingress:

```text
GET /health/live      → 200 if the process is up
GET /health/ready     → 200 if Postgres connects, pg-boss connects, and AttachmentStorage.head() succeeds for a probe key; 503 otherwise
```

Neither endpoint requires authentication; both refuse to disclose internal version or stack details in their response body.

## Amended 2026-07-13

At the time of this amendment the `/health/live` and `/health/ready` split
above was not yet implemented; the backend exposed unauthenticated `GET /health`
as a simple process-health endpoint, and k8s deployment work had to implement
the split before these probes could be used for production readiness. The split
is now implemented — see "Amended 2026-09-22" below. `/health/ready` remains
the chosen readiness name, and the legacy `/healthz` wording in ADR-0011 is not
the canonical endpoint name.

## What this ADR locks

- Single deployment target: Docker on the company's internal k8s.
- Single observability signal in MVP: structured JSON logs on stdout.
- No metrics or tracing emitter in MVP. Hooks exist so a future ADR can switch them on without rewriting handlers.
- Secrets come from k8s `Secret` and are never logged.
- Health endpoints exist and are unauthenticated but minimal.

## Reopening

Adding metrics, tracing, an APM agent, or switching deployment target each warrants a new ADR. Adding new log event types is *not* a reopen — it is the normal way new features make themselves observable.

## Amended 2026-09-22

The `/health/live` + `/health/ready` split is now implemented
(`apps/backend/src/lib/health.ts`, registered in `apps/backend/src/server.ts`).

- `GET /health/live` → `200 { status: 'ok' }`. Depends on nothing downstream
  (no Postgres, no pg-boss, no storage).
- `GET /health/ready` → `200` only if Postgres answers, pg-boss is usable, and
  attachment storage is reachable; `503` otherwise. Unauthenticated, like
  `/health`, and exempt from the global rate limit so probes never see 429.
- Response bodies are fixed-shape and never carry error details (no error
  messages, DSNs, bucket/endpoint names, credentials, or stack traces):

```text
{ status: 'ok' | 'unavailable',
  checks: { database: 'ok' | 'fail', pg_boss: 'ok' | 'fail', storage: 'ok' | 'fail' } }
```

- Every dependency check has its own timeout (default 2000 ms, overridable via
  the `healthProbeTimeoutMs` build-server option for tests) and all three
  checks run in parallel, so a hanging dependency yields 503 within roughly
  the timeout instead of hanging the probe. Timers are always cleared, but a
  timed-out call keeps running (and holds its connection), so each check is
  coalesced (single-flight): while a call is unsettled, later probes await
  that same call within their own timeout instead of issuing new ones, so a
  hung dependency pins at most one connection per check.
- Both probe routes opt out of the rate limiter at the route level
  (`config.rateLimit: false`), so the limiter's session-cookie DB lookup never
  runs for them; liveness therefore stays independent of every dependency.
- pg-boss and storage fail closed: a missing pg-boss handle, a thrown error,
  or a timeout all report `'fail'`. The storage probe is
  the backend's bucket-level `ping()` (S3 `HeadBucket`, so a deleted bucket
  fails); backends without `ping()` fall back to `exists('__readiness_probe__')`,
  where a resolved `false` means the store answered. The same `opts.storage ?? getStorage()`
  instance used for attachments is probed.
- Failures are logged server-side only, with the error NAME and no message or
  cause: `req.log.warn({ check, errName })` — messages can embed DSNs.
- Recommended probe wiring: `livenessProbe` httpGet `/health/live`
  (`periodSeconds: 10`, `failureThreshold: 3`); `readinessProbe` httpGet
  `/health/ready` (`periodSeconds: 10`, `timeoutSeconds: 5`,
  `failureThreshold: 3`).
- `GET /health` (200 with `{ status: 'ok', ts }`) remains as a legacy process
  check.

## Amended 2026-09-22 (jobs)

Background jobs and the storage factory now emit the same structured Pino
stdout stream as request logs. `apps/backend/src/index.ts` creates ONE root
logger per process (`createRootLogger`) and hands it both to Fastify
(`loggerInstance`) and to every job queue, so job logs and request logs share
level and redaction.

Job lifecycle events (emitted by `withJobLogging`,
`apps/backend/src/lib/job-log.ts`) — one line per job:

- `job.start` — `queue`, `job_id`, `correlation_id` (when the payload carries
  a string `correlation_id`), plus queue-specific allowlisted id fields
  (e.g. `task_id`, `release_event_id` for
  `tasks.create_public_update_review_candidates`).
- `job.retry` — start fields plus `retry_count`; emitted instead of
  `job.start` when the pg-boss job carries `retry_count > 0`. pg-boss v12
  attaches `retryCount` only to `JobWithMetadata` (the `workWithMetadata`
  path), so with today's `boss.work` registrations the field is absent and
  `job.retry` does not fire — it is omitted, never invented.
- `job.success` — start fields plus `duration_ms`.
- `job.failure` — start fields plus `duration_ms`, `err_name`, and
  `err_code` (only when the error carries a string/number `code`).

No-message rule: failure lines NEVER include the error message, cause, or
stack (messages can embed DSNs), and job payload data is never logged —
bounded, allowlisted fields only. Handler errors are always RETHROWN after
the `job.failure` line so pg-boss retry config (ADR-0009:35) still applies.

Storage (`apps/backend/src/lib/storage/factory.ts`) logs exactly one
`storage: materialized` line on first materialization with `bucket`,
`endpoint_origin` (origin only — the raw endpoint may carry userinfo and
never reaches the log), `region`, and `force_path_style`. No credentials;
without a logger nothing is logged.
