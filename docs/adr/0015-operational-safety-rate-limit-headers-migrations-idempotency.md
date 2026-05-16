# Operational safety: rate limit, security headers, migrations, idempotency

Four small but load-bearing decisions that the engineering skills and reviewers need a stable answer to. None of them is large enough to deserve a separate ADR; they share one document and one reopening discipline.

## Rate limit

`@fastify/rate-limit` is installed with a Postgres-backed store so limits survive across pods (the in-memory store would let an actor exceed the limit by hitting different pods). Defaults:

```text
- Per-Actor (when authenticated):     100 requests / minute
- Per-IP   (when unauthenticated):     50 requests / minute
- Per-Actor mutation tier:             10 requests / minute on POST/PUT/PATCH/DELETE
- Per-Actor Sensitive Permission use:   5 requests / minute (Task Request Self-Approval, Permission Request decisions)
```

Limit responses use the ADR-0012 envelope: `{ code: 'rate_limited.actor', message: '...', detail: { retry_after_seconds } }`. The response also carries `Retry-After` so generic HTTP clients honor it.

Rate-limit decisions are **not** audited (volume; would drown the audit log). They are logged at `warn` level so spikes are still visible in the company log collector (per ADR-0013).

## Security headers

`@fastify/helmet` is mounted with the defaults enabled (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`) **plus** an explicit Content-Security-Policy:

```text
default-src 'self';
script-src 'self';                                                -- no inline scripts, no eval
style-src 'self' 'unsafe-inline';                                  -- shadcn/Tailwind generates inline style attributes; class-based wins long term
img-src 'self' data: {{ATTACHMENT_ORIGIN}};                        -- images include our attachment proxy origin
font-src 'self' data:;
connect-src 'self' {{ATTACHMENT_ORIGIN}};
frame-ancestors 'none';
form-action 'self';
base-uri 'self';
object-src 'none';
```

`{{ATTACHMENT_ORIGIN}}` is resolved at boot from `PUBLIC_ATTACHMENT_ORIGIN` env var; the attachment endpoint is always same-origin in MVP but the CSP slot is parameterised so a future ADR can move attachments to a sub-origin without code change. Inline scripts and `eval` are forbidden in MVP — this rules out a class of XSS escalations through rich-content rendering.

CORS: not enabled. Frontend and backend share an origin behind the ingress. Adding CORS later is a follow-up ADR with a explicit allowlist; we do not configure permissive CORS in dev to avoid the habit.

## DB migrations

Migrations are authored as **Drizzle Kit-generated SQL files** committed to `apps/backend/migrations/`:

```text
1. Edit the Drizzle schema in apps/backend/src/db/schema/*.ts.
2. Run `pnpm drizzle-kit generate` to produce a new timestamped `.sql` migration.
3. Read the generated SQL. Hand-edit if Drizzle's diff is wrong or unsafe (e.g. add `CONCURRENTLY`, split a one-line column rename into add+backfill+drop, declare an explicit `USING` for type changes).
4. Commit the schema change and the SQL file together.
5. The migration job (one k8s Job per release) runs `pnpm drizzle-kit migrate` against the target database.
```

`drizzle-kit push` is **not used** outside local dev. CI runs `drizzle-kit check` to detect schema drift between code and the committed migrations; a drift makes CI fail.

Index conventions for review:

- Every foreign-key column gets its own index unless a covering composite already exists.
- Every `(workspace_id, ...)` query path starts with `workspace_id` in the index — workspace tenancy is the outermost filter on every read.
- `core.audit_log` indexed on `(workspace_id, created_at desc)` and `(workspace_id, subject_type, subject_id, created_at desc)`.
- `core.notifications` indexed on `(workspace_id, actor_id, read_at, created_at desc)`.
- `core.entity_links` indexed on `(workspace_id, source_type, source_id)` and `(workspace_id, target_type, target_id)`.

Other database conventions:

- All primary keys are `uuid` (v7 from `pg_uuidv7` if available, else app-side v4).
- All timestamps are `timestamptz`, defaulted to `now()` server-side.
- All money/quantity columns use explicit `numeric(p, s)` — no `float`.
- Soft delete is *not* the default; if a domain needs it, a per-table `archived_at` column with explicit query helpers, never a global `WHERE deleted_at IS NULL` middleware.

## Idempotency

Mutation endpoints accept an optional `Idempotency-Key` header (UUIDv4 client-generated). When present, the handler:

1. Looks up `core.idempotency_keys WHERE actor_id, key` (24-hour TTL).
2. If found and the stored request hash matches, returns the stored response verbatim.
3. If found but the request hash differs (same key, different payload — client bug), returns `409 conflict.idempotency_key_reuse`.
4. If not found, runs the handler, stores `(actor_id, key, request_hash, response_status, response_body, created_at)` inside the same transaction as the mutation, and returns the response.

```text
core.idempotency_keys
- actor_id        uuid  -- composite primary key (actor_id, key)
- key             uuid
- request_hash    text
- response_status int
- response_body   jsonb
- created_at      timestamptz not null default now()
```

A periodic pg-boss job purges rows older than 24h. The header is honored on all `POST/PUT/PATCH/DELETE` endpoints; `GET` is safe-by-spec so no key is required.

AGENTS.md already states "application services own transactions, permissions, audits, **idempotency**, and cross-system commands." This ADR is the implementation contract for that responsibility.

DB-constraint-only idempotency was rejected: it surfaces as `409 conflict.duplicate_key` to clients that legitimately retry on network timeout, forcing each client to re-handle the conflict differently per endpoint.

## What this ADR locks

- One rate-limit plugin, Postgres-backed, four tiers (anon-IP, authenticated, mutation, Sensitive Permission). Limit responses use the ADR-0012 envelope.
- `@fastify/helmet` defaults + explicit, no-inline-script CSP. No CORS in MVP.
- Drizzle Kit-generated, hand-reviewed SQL migrations. No `drizzle-kit push` outside local dev. Index and timestamp conventions are required for new tables.
- Optional `Idempotency-Key` header on every mutation endpoint, persisted for 24h.

## Reopening

Each section is independently reopenable. Tightening or relaxing rate limits, switching off CSP, adopting a different migration tool, or removing the idempotency table each warrants a new ADR. Adding new index types or new rate-limit tiers within the established structure is *not* a reopen.
