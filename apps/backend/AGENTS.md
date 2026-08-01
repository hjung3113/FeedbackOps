# Backend Agent Guide

## Required Docs

- Read `docs/implementation/README.md` before backend changes.
- Use `docs/implementation/03-api-contracts.md` for endpoint behavior.
- Use `docs/implementation/04-database-and-migrations.md` for storage.
- Use `docs/implementation/05-permission-policy.md` for access control.
- Use `docs/implementation/06-entity-linking-contract.md` for links.
- Use `docs/implementation/02-domain-module-boundaries.md` before adding or moving modules.

## Layer Rules

Layer boundaries (controllers, application services, repositories) are defined in root `AGENTS.md` → Implementation Boundaries.

Backend-specific additions beyond root:

- Domain services own local business rules only.
- Read models may compose approved projections but must not become mutation paths.
- Core owns Managed System Registry, Product Areas, Actor, Role Level, audit, shared attachment governance, and default owner/reviewer resolution inputs; Task owns Task Request, Task, future Work Initiative / Project grouping, Milestone, and execution views.
- Mutation services accept the transaction union `Tx` from `db/tx.ts`, never `Db` (the pool). The compiler enforces this — do not re-introduce a `Tx = Db` alias.

## Cross-System Commands

Every cross-system command must validate workspace ownership, check permissions, write the target object, write required `entity_links`, append required audit events, and return data suitable for pending or optimistic UI states.

Source-shaped routes may host request parsing, but target object writes must use the target module's application command or an orchestration service documented in `docs/implementation/02-domain-module-boundaries.md`.

Backend-specific additions to root's Managed System invariant: Product Area is business
context inside one Managed System, not an MVP permission boundary. Project or
Work Initiative is future execution grouping only unless a later ADR changes
that decision.

## Verification

- Cover permission policy, entity-link side effects, API error codes, validation paths, audit events, and transaction behavior when touched.
- Never rely on frontend checks as the source of authorization truth.
- **`test:integration` is the gate. `test` alone is not.** All 90 integration suites use `describe.skipIf(!runIntegration)` where `runIntegration` requires `DATABASE_URL`, `DATABASE_URL_MIGRATE`, and (in most files) `WORKSPACE_ID`, so a bare `pnpm --filter backend test` skips every one of them and touches no database. `pnpm --filter backend test:integration` (`scripts/test-integration.sh`) exports the repo `.env` and runs the same suite with the integration path live; it forwards extra args to vitest, so a narrow filter still works. `FEEDBACKOPS_ENV_FILE=<path>` points it at a different env file. **A green `test` on its own proves only the unit path** — `src/test-support/__tests__/integration-gate.test.ts` is the one ungated suite and it fails the default run for exactly that reason (#204). On a machine with no Postgres, `ALLOW_SKIPPED_INTEGRATION=1` opts out explicitly; a run carrying that flag is not a gate result and must not be reported as one.
- **The integration gate resets the database.** With the env exported, the vitest `globalSetup` at `src/test-support/global-setup.ts` **truncates every product table and re-seeds before the run**, so a run's result never depends on how many runs came before it (#205). Point `DATABASE_URL`/`DATABASE_URL_MIGRATE` at a throwaway database if the contents of your dev database matter to you; `TEST_DB_NO_RESET=1` opts out of the reset and back into non-reproducible counts, and `NODE_ENV=production` is refused. Deviating from the `skipIf` idiom is a bug: a bare `describe` runs its `beforeAll` in the default gate and fails the suite.
- **Black-box persona seed.** `SEED_MODE=personas pnpm --filter @fops/backend db:seed` runs the unchanged core seed first, then adds the mock Admin, User, and Developer personas plus their test-only grants. Omit `SEED_MODE` (or set `core`) for the canonical core-only seed.
- **Canonical issue verification requires `VERIFY_CLEAN_COMMAND='node scripts/verify-clean-state.mjs'` alongside `VERIFY_DATABASE_URL` and `VERIFY_DATABASE_URL_MIGRATE`.** The probe reads those verify URLs (falling back to the `DATABASE_URL` values that `verify.sh` copies them into): it uses the app URL for its role and seeded-data sentinel, and the migrate URL only for the protected Drizzle migration ledger, preserving the `fops_app` privilege boundary.
- **Teardown must walk the FK graph into `core.actors`, and `core.audit_log` needs the migrate role.** Every request a test actor makes writes `core.audit_log`, and `audit_log.actor_id` is a plain FK — so `delete from core.actors` fails unless the audit rows go first, and `fops_app` holds no DELETE on `core.audit_log` by design (ADR-0008/0019), so that one statement has to run through `DATABASE_URL_MIGRATE`. The same applies to `permission.permission_requests.requester_actor_id`. A failing delete aborts the whole `afterAll` hook, so every statement after it silently never runs and the fixtures leak — this single omission accounted for 134 of 137 failures (#205). A suite that creates fixtures and closes its handles without deleting them is incomplete, even if its own assertions pass: `db/__tests__/seed` asserts an exact managed-system list and fails on anyone else's leftovers.
- **Provisioning a throwaway database.** `create database <name> owner fops_migrate` (owner matters — a database owned by `postgres` leaves the schemas owned by `postgres`, and then even `fops_migrate` gets `permission denied for schema voc`, producing hundreds of phantom failures), then `create extension vector` as a superuser, then migrate and seed with both role URLs pointed at it.
- Tests must be real smoke tests, not ceremonial. Integration tests hit a live Postgres via the `fops_app` / `fops_migrate` roles (no DB mocks, no in-memory shims). Each test boots the actual Fastify server via `buildServer`, exercises the route through `app.inject`, and asserts on the wire envelope plus the resulting DB state (audit rows, row mutations, idempotency cache, permission grants). Static checks (`pnpm typecheck`, `pnpm check:boundaries`) verify shape only — they never prove behavior. A test that passes without a running Postgres or without asserting observable DB state is not a real test; convert it or delete it. If a DB-dependent scenario cannot be reached from the harness (e.g. mid-tx concurrency), document the gap explicitly rather than substituting a mock.
