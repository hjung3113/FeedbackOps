# Slice 1 Adversarial Review

## Critical (block before next slice)

### [F-001] Audit event name `permission.requested` contradicts policy doc's locked vocabulary
**Where:** `packages/shared/src/enums/audit-events.ts:12`, `apps/backend/src/modules/permissions/request-service.ts:73`
**Why it matters:** `docs/implementation/05-permission-policy.md:146-156` locks the audit-event vocabulary verbatim:
`permission_requested`, `permission_approved`, `permission_rejected`, … (no dot, single token). ADR-0008:38 separately
shows a `subject_type.verb` convention with `permission_request.decided`. The implementation chose a third spelling,
`permission.requested`, which matches neither contract. Future Slice 1.4 work that emits `permission_approved` /
`permission_rejected` per the policy doc will produce audit rows that cannot be filtered by a single naming convention,
and any consumer (BI export, ops dashboard) that hardcoded the policy-doc names will silently miss every Slice 1 row.
**Recommendation:** Pick one convention now while the table has zero deployed history. Either rename to
`permission_request.requested` (ADR-0008 style: `<subject_type>.<verb>`) or to `permission_requested` (policy doc style).
Update `AUDIT_EVENT_TYPES`, the service constant, the migration of historical rows is empty so no backfill is needed,
and pin the chosen convention in ADR-0008 so the next event added doesn't drift again.

### [F-002] Client-side `crypto.randomUUID()` per click defeats Idempotency-Key contract
**Where:** `apps/frontend/src/features/admin/permissions/request-access-button.tsx:40`
**Why it matters:** ADR-0015:71-90 specifies Idempotency-Key as the safety net for network retries of the *same logical
intent*. The Request access button generates a fresh UUIDv4 inside the mutation function on every click, so a
double-click, a network retry inside TanStack Query, or a Cmd-R after a stalled response sends a *different* key each
time. The only thing preventing duplicate rows is the partial unique index `permission_requests_active_uq` — exactly
the DB-constraint-only path ADR-0015:93 explicitly rejected ("forces each client to re-handle the conflict differently
per endpoint"). The UI works in the happy path only because the second request rounds to a 409 `permission_request_duplicate`
that the button silently swallows. Replace the swallow with a flaky network and the user sees an opaque conflict toast.
**Recommendation:** Derive the key from a stable logical-intent tuple for the gate session — e.g., generate once in a
`useMemo` keyed on `(capability, managedSystemId)` and reset only after a successful submission, or move the key into
the mutation cache so React Query retries reuse it. Verify with a test that simulates two `mutate()` calls in flight.

### [F-003] `audit_log.workspace_id` has no foreign key; permission tables have no FKs at all
**Where:** `apps/backend/src/db/schema/core.ts:116`, `apps/backend/src/db/schema/permission.ts:30-31,68-69,94-95`
**Why it matters:** ADR-0015:55-61 and `docs/implementation/04-database-and-migrations.md` mandate referential integrity
on every `workspace_id`/`actor_id`. The audit log table declares `workspaceId: uuid('workspace_id').notNull()` with no
`.references(workspaces.id)`. All three permission tables (`permission_grants`, `permission_denies`, `permission_requests`)
have neither a workspace nor actor FK. Result: a future cleanup that drops a stale workspace row leaves orphan permission
rows that the check service will treat as live, and a typo'd `actor_id` in any service write inserts silently. The audit
log is the most acute case because ADR-0008 makes audit rows the source of truth for "what happened" — an orphan audit
row whose workspace was deleted is unreviewable.
**Recommendation:** Add `.references(() => workspaces.id)` to `auditLog.workspaceId` and to all `workspaceId`/`actorId`
columns in `permission.ts`. Regenerate the migration; the table is empty in any non-prod env so no backfill is needed.

### [F-004] GET /me/permissions/check open-request lookup ignores `managed_system_id`, can render wrong UI state
**Where:** `apps/backend/src/modules/permissions/routes.ts:126-137`
**Why it matters:** The query `select … from permission_requests where workspace_id = … and requester_actor_id = … and
requested_capability = …` does not filter on `requested_managed_system_id`. If a Developer opens a workspace-level
request for capability X and the same user then probes the gate for X scoped to a different `managed_system_id`,
the state mapper returns `pending_request` instead of `request_access`. The Slice 1 seed has zero MS scopes, so this
is latent today, but Slice 1.4 / Slice 2 will exercise MS-scoped checks immediately and the bug ships preinstalled.
The inline comment at routes.ts:124 acknowledges the gap ("S1.2 will tighten this match") but no tracked follow-up exists.
**Recommendation:** Match the open-request lookup on the same scope tuple the partial unique index uses:
`(workspace_id, requester_actor_id, requested_capability, COALESCE(requested_managed_system_id, sentinel))`. Add a unit
test that pins both branches (matched and unmatched MS) before S1.2 starts.

### [F-005] Idempotency `record` insert has no conflict handling — concurrent first-time requests will 500
**Where:** `apps/backend/src/modules/core/idempotency/idempotency-service.ts:61-76`
**Why it matters:** ADR-0015:71-90 requires that two concurrent requests with the same `(actor_id, key)` resolve
deterministically (one wins, the loser sees the cached response). `record()` is a plain `INSERT` against the
`(actor_id, key)` primary key. The protocol of "lookup → miss → run handler → record" runs inside a single transaction,
but two concurrent transactions both see "miss" at lookup, both run the handler, and the second `INSERT` hits a
unique_violation that bubbles out as `internal.unexpected` (500). The user-visible failure mode for a legitimate
network retry is therefore "first try succeeds silently, second try 500s," exactly the surface the ADR was designed
to suppress.
**Recommendation:** Either (a) `INSERT … ON CONFLICT DO NOTHING` and re-`SELECT` the winning row's stored response,
or (b) take a row-level advisory lock keyed on `hash(actor_id, key)` at the start of the transaction so one writer
blocks until the other commits and then sees the stored response on retry. Add an integration test that fires two
concurrent POSTs with the same key and asserts both observe a 201 with identical bodies.

## High (must fix this slice)

### [F-006] `AUTH_PROVIDER` env var is parsed but never read; server.ts hardcodes mock
**Where:** `apps/backend/src/config.ts:15`, `apps/backend/src/server.ts:17,180`, `apps/backend/src/modules/auth/routes.ts:3-4`
**Why it matters:** ADR-0006:16 says the two providers are "swapped by `AUTH_PROVIDER` env var." The config schema parses
the var, but no code reads it: `server.ts` imports `createMockAuthProvider` directly at the top of the file and
instantiates it unconditionally. The `apps/backend/src/modules/auth/routes.ts:3-4` comment claims "the plugin is the only
place the AUTH_PROVIDER env var is consulted" — that statement is false. Deploying with `AUTH_PROVIDER=oidc` today still
serves the mock provider with no warning. Worse, the mock-login route only checks `authProvider.name !== 'mock'`
(`routes.ts:37,53`); because the provider is always mock, that branch never fires in prod even if the env signaled oidc.
**Recommendation:** Either (a) make the provider selection real now — a small switch in `buildServer` keyed on
`config.AUTH_PROVIDER`, with `oidc` throwing `Error('OidcAuthProvider not yet implemented (ADR-0006)')`, or (b) remove
`AUTH_PROVIDER` from the config schema and the misleading comments until the slice that adds OIDC. Don't leave a parsed
but unused env knob: it's a footgun in CI/CD configuration.

### [F-007] `loadAndTouch` SELECT and UPDATE not in a single transaction; lost-revoke race
**Where:** `apps/backend/src/modules/auth/session-service.ts:168-220`
**Why it matters:** ADR-0006:40 mandates that "logout, role changes, and permission revocations take effect immediately."
`loadAndTouch` does (1) a SELECT to find the active session, (2) returns to the caller, (3) issues a separate UPDATE to
touch `last_seen_at`. Between (1) and (3) a concurrent `revoke()` can set `revoked_at`; the UPDATE then writes
`last_seen_at` over the revoked row, and `requireSession` proceeds to populate `req.session` even though the row is
revoked at commit time. The request continues end-to-end against a revoked session.
**Recommendation:** Wrap the SELECT and UPDATE in `deps.db.transaction(async (tx) => …)`, or — simpler — fold both
into a single SQL: `UPDATE core.sessions SET last_seen_at = $now WHERE id = $id AND revoked_at IS NULL AND expires_at > $now RETURNING …`,
then derive null vs found from rowCount.

### [F-008] Raw client IP stored as `created_ip_summary`; ADR-0006 says "summary"
**Where:** `apps/backend/src/modules/auth/session-service.ts:151-152`
**Why it matters:** ADR-0006:38 names the column `created_ip_summary` and `created_user_agent_summary` with the explicit
intent that they be derived summaries (subnet, browser family) rather than full PII. The current write stores
`input.ip?.slice(0, 64)` — `req.ip` is the full client IP, truncated only by the 64-char column safety. For IPv6 this
keeps the entire address. Slice 1 has no GDPR / privacy review pending, but the schema's design intent is being violated
silently on every login.
**Recommendation:** Either (a) hash + truncate IP to a /24 (v4) or /48 (v6) subnet before storage, or (b) rename the
column to `created_ip` and accept the privacy debt with an explicit ADR note. The same applies to the User-Agent
string (`slice(0, 256)` is not a summary; it's truncation).

### [F-009] `req.ip` used for rate-limit keys with no `trustProxy` configured
**Where:** `apps/backend/src/server.ts:51-57, 101, 130, 137`
**Why it matters:** ADR-0015:7-14 lists `Per-IP (when unauthenticated): 50 requests/minute` as a tier. `req.ip` defaults
to the connecting peer. Behind any production ingress (k8s service / Nginx / AWS ALB) every anonymous request looks
like it originates from the load balancer IP, so the rate-limit tier collapses to "every anonymous request anywhere"
and either DOSes the entire anon-IP slot or, if the LB is exempted, becomes a no-op. Fastify's `trustProxy` flag is
absent.
**Recommendation:** Set `trustProxy: true` (or a more specific allow-list) on the Fastify constructor in `buildServer`,
documented in the slice as the deployment assumption. Add a comment that ties it to ADR-0015 so it isn't undone.

### [F-010] `pgboss.create_queue` (DDL) is grant-EXECUTE-able to `fops_app` — quiet hole in ADR-0008 role separation
**Where:** `apps/backend/migrations/0002_dapper_pgboss.sql:231-311, 342-344`
**Why it matters:** ADR-0008 enforces "the application connects as a role with INSERT, SELECT only on `core.audit_log`"
and migration 0002 declares "the running app must never DDL pg-boss schema — it only writes jobs … and runs the
create_queue/delete_queue stored functions." But `create_queue` performs `EXECUTE format('CREATE TABLE pgboss.%I …')`
and `ALTER TABLE … ATTACH PARTITION`, and the migration grants `EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO fops_app`.
Because these functions run with the *invoker's* rights (no `SECURITY DEFINER`), they would normally fail under fops_app
— but the schema-level `GRANT … ON ALL TABLES IN SCHEMA pgboss TO fops_app` plus default `CREATE` privileges on tables
within the schema let the running app effectively spawn new partitions. This is opposite of "DDL-less app."
**Recommendation:** Decide explicitly. Either (a) keep the EXECUTE grant and document that pg-boss `create_queue` is
an intentional exception with bounded DDL surface — pin it in ADR-0009 — or (b) revoke EXECUTE from fops_app on
`create_queue` / `delete_queue` and call them only during the migration step or via a separate operator script.

**Status (2026-05-17): RESOLVED via issue #8, option 1 (SECURITY DEFINER shim).**
Migration `0007_pgboss_create_queue_shim.sql` renames the raw function to
`pgboss._create_queue_unsafe`, revokes `EXECUTE` from `fops_app` and `PUBLIC`, and
re-creates `pgboss.create_queue(text, jsonb)` as a `SECURITY DEFINER` wrapper
owned by `fops_migrate`. The wrapper hard-rejects `partition := true` with
SQLSTATE `42501` and delegates everything else to `_create_queue_unsafe`.
`fops_app` retains `EXECUTE` only on the wrapper. pg-boss boot remains green
because `manager.createQueue` (dist/plans.js) invokes the same signature and
the internal `__pgboss__send-it` queue defaults to `partition: false`.

Verified by:
- `migration.test.ts › Slice 2 #8 migration 0007 installs SECURITY DEFINER shim` (unit).
- `role-grants.integration.test.ts › fops_app must NOT EXECUTE pgboss._create_queue_unsafe` + sibling shim assertions (integration).
- `boot.integration.test.ts` continues to pass (5/5), confirming the wrapper path is transparent to pg-boss.

### [F-011] `Idempotency-Key` regex accepts any UUID v1-v5; ADR-0015 says UUIDv4
**Where:** `apps/backend/src/modules/permissions/routes.ts:31-32`
**Why it matters:** ADR-0015:72 states "UUIDv4 client-generated." The regex on routes.ts is a generic UUID format check
(no version-nibble constraint). A client (or attacker) supplying a UUIDv1 with the host-MAC half-baked in passes
validation; future tooling that assumes v4-only randomness will be surprised.
**Recommendation:** Tighten the regex to require `4` at position 14 and `[89ab]` at position 19, or use
`z.string().uuid()` with a custom refinement. The message `validation.malformed_idempotency_key` already exists.

## Medium (queue follow-up)

### [F-012] Hardcoded `text-red-600` in login page violates design token convention
**Where:** `apps/frontend/src/routes/login.tsx:62`
**Why it matters:** Task-prompt #14 notes the upcoming design-system reference and explicit instruction for strict
functional rendering only. Every other surface uses `text-accent-danger`; only login.tsx ships a raw Tailwind palette
class. This is exactly the kind of drift the prompt told reviewers to flag — when the design-system reference lands,
this single class will either be missed (the rest of the file will swap to tokens, this won't) or trigger a noisy diff.
**Recommendation:** Swap `text-red-600` → `text-accent-danger` to match `request-access-button.tsx:104`.

### [F-013] `ROLE_LEVELS` in `@fops/shared` is capital-cased; DB stores lower-case
**Where:** `packages/shared/src/enums/index.ts:4`, `apps/backend/src/db/schema/core.ts:70-73`,
`apps/backend/src/modules/permissions/check-service.ts:178-188`
**Why it matters:** `ROLE_LEVELS = ['Admin','Developer','User']` (capital) is exported as the canonical role enum, but
the DB CHECK constraint requires lower-case `('admin','developer','user')`, and the check-service compares against
lower-case. Slice 1 never uses `ROLE_LEVELS`, but the next consumer that imports it (likely Slice 2 admin UI dropdowns)
will silently mismatch — `RoleLevel = 'Admin' | 'Developer' | 'User'` cannot be passed to the DB or compared with
`actor.role_level`. CONTEXT.md uses Title-Case in prose for the *concept*; that is not the storage form.
**Recommendation:** Either drop the capital-case enum and re-export a single source of truth, or split into
`ROLE_LEVEL_LABELS` (display) vs `ROLE_LEVEL_VALUES` (storage) with explicit mapping. Pick before Slice 2 imports it.

### [F-014] `workspace.admin` capability classified as non-sensitive, despite policy listing "Admin permission" as sensitive
**Where:** `packages/shared/src/enums/capabilities.ts:18,33-36`,
`docs/implementation/05-permission-policy.md:62-76`
**Why it matters:** The policy doc Sensitive Permissions list includes "Admin permission". The Slice 1 capability vocab
ships `workspace.admin` with `sensitive: false`. The capabilities.ts comment justifies this with a reference to
"grill Q11 locked decision," but that decision is not documented in any ADR or the policy file. When Slice 1.4 reaches
admin-grant flows, a permission request for `workspace.admin` will skip the reason-required Sensitive path. Worse,
the seed creates `mock-admin-1` with `role_level=admin` directly — granting workspace.admin without ever exercising
the sensitive-request flow.
**Recommendation:** Either (a) pin the grill-Q11 rationale in a one-paragraph addendum to ADR-0006 or the policy doc
explaining why workspace.admin is not the "Admin permission" the policy means, or (b) flip the flag and add the reason
requirement at request-creation time.

### [F-015] Frontend `/login` route is reachable in production
**Where:** `apps/frontend/src/routes/login.tsx`, `apps/backend/src/modules/auth/routes.ts:36-43,53`
**Why it matters:** The backend `/auth/mock-login` correctly returns 404 in production (`isProd || authProvider.name !== 'mock'`).
The frontend `/login` page is unconditionally registered as a route, hardcodes two mock actor IDs, and posts to the
backend endpoint. In prod the backend will refuse, so no session is issued, but the page itself leaks the seeded
external_ids and invites probing. Once OIDC ships there will be a *real* `/login` and this dev surface needs to
disappear or be rewritten.
**Recommendation:** Render an `import.meta.env.PROD`-aware empty/redirect-home page, or split the route into
`login.mock.tsx` and guard the import. At minimum, hide the seed roster strings.

### [F-016] `session-service.ts` re-exports drizzle's `sql` helper through the auth module
**Where:** `apps/backend/src/modules/auth/session-service.ts:237`
**Why it matters:** AGENTS.md:66 says backend application services own narrow responsibilities; re-exporting
`drizzle-orm`'s `sql` template helper through the auth module makes the auth module a SQL-utility middleman.
The comment in the file claims tests may want to import it from there — no test does. This is dead surface area that
encourages future "let me grab `sql` from auth" anti-patterns.
**Recommendation:** Delete the re-export. Tests can import `sql` directly from `drizzle-orm`.

### [F-017] Two `TODO(...)` markers in production code with no tracked follow-up issues
**Where:** `apps/backend/src/modules/permissions/check-service.ts:155`,
`packages/shared/src/enums/capabilities.ts:12`
**Why it matters:** AGENTS.md asks reviewers to flag "anything that says 'later' but isn't tracked." Both TODOs
reference imagined future slices (`S1.2`, `S1.4`) but neither is filed as a GitHub issue. The MS-scoped-grant TODO
in particular is the exact gap behind F-004; if F-004 is fixed, this TODO becomes stale, and if F-004 isn't fixed,
the TODO is the only record of it.
**Recommendation:** Either resolve them as part of fixing F-004 / decide F-014, or convert each to an issue and
replace the TODO with a permalink to the issue.

### [F-018] `core.rate_limits` has no purge job — unbounded row growth
**Where:** `apps/backend/migrations/0001_jazzy_miracleman.sql`, `apps/backend/src/lib/rate-limit-pg-store.ts`
**Why it matters:** ADR-0015:9 specifies a Postgres-backed rate-limit store. Each unique `(key, route_group)`
upserts a row; the upsert resets `counter` and `expires_at` but never deletes anything. Anon-IP keys are unbounded
(every new client IP is a new row). With `idempotency_keys` getting an hourly pg-boss purge but `rate_limits` not,
this is asymmetric.
**Recommendation:** Add a sibling pg-boss job alongside `core.idempotency_purge` that deletes
`WHERE expires_at < now() - interval '1 hour'`, or fold it into the idempotency-purge job to share scheduling.

## Low / Nits

### [F-019] Stray `void ttlSeconds` and two empty placeholder job files
**Where:** `apps/backend/src/modules/auth/routes.ts:133`,
`apps/backend/src/modules/auth/jobs.ts`,
`apps/backend/src/modules/permissions/jobs.ts`
**Why it matters:** `const ttlSeconds = …; void ttlSeconds;` is dead code that suppresses an unused-variable warning
without ever using the value. The two placeholder `jobs.ts` files only export `{}` or `export const __authJobs = {} as const`
— they exist to "match module shape" but compile into modules with no exports. Each is a small but real
maintenance trap (someone will read the file looking for a job and find nothing).
**Recommendation:** Remove the `void ttlSeconds` line (delete the unused `const`). Either delete the empty
`jobs.ts` placeholders or replace their body with a one-line `export {};` and a TODO that points at an issue.

### [F-020] `statusForCode(code as never)` in the error handler bypasses the closed ErrorCode union
**Where:** `apps/backend/src/server.ts:147`
**Why it matters:** The error handler regex-validates the code shape (`/^[a-z_]+\.[a-z_]+$/`) and then forcibly casts
through `as never`. Any string that matches the regex but isn't in `ERROR_CODES` (e.g., `internal.something_new`)
will pass the cast and fall through to the default 500 — which happens to be correct *today* but defeats the
"closed ADR-0012 enum" intent. The cast hides the bug that would otherwise be caught at compile time.
**Recommendation:** Use `errorCodeSchema.safeParse(code).success` instead of the regex+cast pair; on success it's
typed as `ErrorCode` without the assertion.

### [F-021] Routes use both inline actor-lookup and `loadActorContext` helper inconsistently
**Where:** `apps/backend/src/modules/permissions/routes.ts:55-65, 98-103, 189-191, 218-221`
**Why it matters:** `loadActorContext` exists as a helper inside the plugin, used by POST and GET-mine. The
GET /me/permissions/check handler ignores it and inlines the same query. Tiny code-quality issue that ladders into
the bigger boundary issue: every handler reaches into `actors` directly rather than asking the auth module for the
actor record (AGENTS.md:66 — services own permissions/actors).
**Recommendation:** Use `loadActorContext` in all three handlers, or escalate the helper into a public
`sessionService.loadActor()` method so the permissions module stops reaching into `core.actors`.

## Things I checked that were clean

- The `permissionRequests` insert and its audit row share the same Drizzle `tx` handle (request-service.ts:134, 175) — no path commits one without the other.
- Boundary script (`pnpm check:boundaries`) reports OK; `packages/shared` and `packages/ui` are mutually independent of `apps/*` and each other.
- No `apps/frontend` file branches on `role_level` to enforce a decision; the field is rendered only as display text in index.tsx and login.tsx.
- Helmet CSP in `server.ts` exactly matches the directive list in ADR-0015:24-35 — no `'unsafe-eval'` or other widening was introduced.
- Migration SQL is hand-reviewed Drizzle output (per ADR-0015:43-51); no `DROP` without backfill and no in-place column renames appear in `0000`/`0001`/`0002`.
- `Retry-After` is included in the rate-limit `addHeaders` config (server.ts:117) so 429 responses carry the ADR-0015:18 header.
- `noUncheckedIndexedAccess` and friends are honored: only one `as unknown as Db` exists (request-service.ts) to bridge the Drizzle Tx/Db type gap, no `// @ts-expect-error` or `any` in product code.
