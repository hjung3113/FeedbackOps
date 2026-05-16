# Context: apps/backend

Backend app. Domain modules under `apps/backend/src/modules/*`.

See root `CONTEXT.md` for system-wide product domain and `CONTEXT-MAP.md` for the full context list.

## Layer responsibilities

- **Controllers** — parse HTTP and map responses only.
- **Application services** — own transactions, permissions, audits, idempotency, and cross-system commands.
- **Repositories** — write only tables owned by their module.

## Invariants

- Source-shaped routes do not grant write ownership to the source module.
- Cross-system history is canonical through `entity_links`, not convenience columns.
- Backend implementation belongs under `apps/backend/src/modules/*`, never `systems/{system}/backend`.

## Sources of truth

- API behavior: `docs/implementation/03-api-contracts.md`
- Database and migrations: `docs/implementation/04-database-and-migrations.md`
- Module ownership: `docs/implementation/02-domain-module-boundaries.md`
- Permission decisions: `docs/implementation/05-permission-policy.md`
- Entity links: `docs/implementation/06-entity-linking-contract.md`

## Glossary

_Stub. Grow via `/grill-with-docs` as backend-specific terms get resolved._
