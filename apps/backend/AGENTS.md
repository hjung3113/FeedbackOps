# Backend Agent Guide

## Required Docs

- Read `docs/implementation/README.md` before backend changes.
- Use `docs/implementation/03-api-contracts.md` for endpoint behavior.
- Use `docs/implementation/04-database-and-migrations.md` for storage.
- Use `docs/implementation/05-permission-policy.md` for access control.
- Use `docs/implementation/06-entity-linking-contract.md` for links.
- Use `docs/implementation/02-domain-module-boundaries.md` before adding or moving modules.

## Layer Rules

- Controllers handle HTTP parsing, request validation, and response mapping only.
- Application services own transactions, permission checks, audit events, idempotency, and cross-system orchestration.
- Domain services own local business rules only.
- Repositories access tables owned by their module only.
- Read models may compose approved projections but must not become mutation paths.
- Core owns Managed System Registry, Product Areas, Actor, Role Level, audit, shared attachment governance, and default owner/reviewer resolution inputs; Task owns Task Request, Task, future Work Initiative / Project grouping, Milestone, and execution views.
- Mutation services accept the transaction union `Tx` from `db/tx.ts`, never `Db` (the pool). The compiler enforces this — do not re-introduce a `Tx = Db` alias.

## Cross-System Commands

Every cross-system command must validate workspace ownership, check permissions, write the target object, write required `entity_links`, append required audit events, and return data suitable for pending or optimistic UI states.

Source-shaped routes may host request parsing, but target object writes must use the target module's application command or an orchestration service documented in `docs/implementation/02-domain-module-boundaries.md`.

Managed System scope is the MVP filter, defaulting, and Developer permission
boundary. Backend APIs must not create separate per-Managed-System VOC, Survey,
Task, Finding, Dashboard, or Integration systems. Product Area is business
context inside one Managed System, not an MVP permission boundary. Project or
Work Initiative is future execution grouping only unless a later ADR changes
that decision.

## Verification

- Cover permission policy, entity-link side effects, API error codes, validation paths, audit events, and transaction behavior when touched.
- Never rely on frontend checks as the source of authorization truth.
