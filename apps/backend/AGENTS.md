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
- Tests must be real smoke tests, not ceremonial. Integration tests hit a live Postgres via the `fops_app` / `fops_migrate` roles (no DB mocks, no in-memory shims). Each test boots the actual Fastify server via `buildServer`, exercises the route through `app.inject`, and asserts on the wire envelope plus the resulting DB state (audit rows, row mutations, idempotency cache, permission grants). Static checks (`pnpm typecheck`, `pnpm check:boundaries`) verify shape only — they never prove behavior. A test that passes without a running Postgres or without asserting observable DB state is not a real test; convert it or delete it. If a DB-dependent scenario cannot be reached from the harness (e.g. mid-tx concurrency), document the gap explicitly rather than substituting a mock.
