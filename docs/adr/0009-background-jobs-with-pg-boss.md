# Background jobs use pg-boss inside the backend process

FeedbackOps has work that must run outside the request lifecycle:

- Creating a Public-Update review candidate when a Task moves to `Released` (ADR-0005 forbids automatic Reporter-Facing status writes).
- Surfacing High Severity VOC follow-up gaps for Dashboard queues.
- Applying Cluster bulk-update operations candidate-by-candidate (CONTEXT.md: bulk update behavior is candidate-only).
- Sending Surveys and closing them at their deadline (`docs/design/07-survey-system.md`).
- Future audit-log archival once retention policy lands (ADR-0008).
- Periodic entity-link integrity checks for Dashboard "missing link" queries (`docs/implementation/06-entity-linking-contract.md`).

## Runner

We use **[pg-boss](https://github.com/timgit/pg-boss)** as the job runner. It runs entirely on the existing Postgres instance — no Redis, no Temporal cluster — and queues live in their own schema so they do not pollute the domain tables. The same database connection means a job-emitting transaction (e.g. "approve Task Request, enqueue Public-Update candidate creation, write audit row") can commit atomically. Losing the queue means losing the database, which is already the worst-case failure we plan for.

BullMQ was rejected for MVP because it adds Redis as a second stateful dependency for one feature surface; for our load profile (one workspace, tens to low-hundreds of internal Actors) the throughput gain does not justify the operational cost. Temporal was rejected as enterprise-grade workflow orchestration that overshoots a single MVP backend. Naked `setInterval` and bare cron were rejected because they offer no retry, no visibility, and no idempotency story.

## Process layout

Workers run **inside the `apps/backend` process** alongside the HTTP server. Each module that registers jobs does so during boot via a `registerJobs(boss)` function exported from `apps/backend/src/modules/<module>/jobs.ts`. The boot sequence is:

```text
1. Connect Drizzle to Postgres.
2. Start pg-boss against the same connection pool.
3. Register module jobs.
4. Start the Fastify HTTP server.
```

A future ADR can split workers into `apps/worker` if a specific job profile requires its own deploy or scaling envelope, but MVP load does not justify the second process today. The code structure (`registerJobs` per module, no top-level cron files) keeps that split low-cost.

## Amended 2026-07-13

The module registration convention is amended from a single
`apps/backend/src/modules/<module>/jobs.ts` file exporting `registerJobs(boss)`
to a module-owned jobs directory:
`apps/backend/src/modules/<module>/jobs/index.ts` exporting
`register<Module>Jobs(boss, deps)`. The original process decision stands:
workers still run inside the backend process, modules still register their own
jobs during boot, and a separate worker process still requires a future ADR.

## Retry, idempotency, and failure

Defaults locked here:

- **Retries**: `{ retryLimit: 5, retryDelay: 30, retryBackoff: true }`. Five attempts with exponential backoff is enough to ride out transient DB or external-service flaps without retrying forever.
- **Idempotency**: every job handler must be safe to run more than once on the same input. Handlers either use `INSERT … ON CONFLICT DO NOTHING` against a deterministic key, or check current state before mutating. Job payloads include a `correlation_id` so handlers can detect a re-run.
- **Audit emission**: a job that performs an audited action emits its `core.audit_log` row inside the same transaction as the mutation, just like a request-driven handler would. The `actor_id` for system-triggered work is the seeded `system` Actor; the `event_type` carries a `system.` prefix when no user initiated the work.
- **Dead-letter**: pg-boss moves jobs that exhaust retries to its built-in failed-job state. A daily probe job lists failed jobs into the Admin Dashboard so a human can decide retry, drop, or fix-and-retry. We do not silently delete failed jobs.

## What this ADR locks

- One job runner (pg-boss). No mixing with BullMQ or Temporal in the monorepo without a new ADR.
- Workers run in the same process as the HTTP server until a future ADR splits them.
- Every job handler is idempotent and emits its audit row in the same transaction as its mutation.
- Failed jobs surface to the Admin Dashboard rather than disappearing.

## Reopening

Switching to BullMQ or Temporal, splitting workers into a separate process, or weakening the idempotency rule each warrants a new ADR with a migration story for existing jobs and queues. Adding a new job type is *not* a reopen — modules register their own jobs by the established convention.
