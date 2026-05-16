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

## What this ADR locks

- Single deployment target: Docker on the company's internal k8s.
- Single observability signal in MVP: structured JSON logs on stdout.
- No metrics or tracing emitter in MVP. Hooks exist so a future ADR can switch them on without rewriting handlers.
- Secrets come from k8s `Secret` and are never logged.
- Health endpoints exist and are unauthenticated but minimal.

## Reopening

Adding metrics, tracing, an APM agent, or switching deployment target each warrants a new ADR. Adding new log event types is *not* a reopen — it is the normal way new features make themselves observable.
