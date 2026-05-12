# Backend Agent Guide

## Required Docs

- Read `docs/implementation/README.md` before backend changes.
- Use `docs/implementation/03-api-contracts.md` for endpoint behavior.
- Use `docs/implementation/04-database-and-migrations.md` for storage.
- Use `docs/implementation/05-permission-policy.md` for access control.
- Use `docs/implementation/06-entity-linking-contract.md` for links.

## Layer Rules

- Controllers handle HTTP parsing, request validation, and response mapping only.
- Application services own transactions, permission checks, audit events, idempotency, and cross-system orchestration.
- Domain services own local business rules only.
- Repositories access tables owned by their module only.
- Read models may compose approved projections but must not become mutation paths.

## Cross-System Commands

Every cross-system command must validate workspace ownership, check permissions, write the target object, write required `entity_links`, append required audit events, and return data suitable for pending or optimistic UI states.

Source-shaped routes may host request parsing, but target object writes must use the target module's application command or an orchestration service documented in `docs/implementation/02-domain-module-boundaries.md`.

## Verification

- Cover permission policy, entity-link side effects, API error codes, validation paths, audit events, and transaction behavior when touched.
- Never rely on frontend checks as the source of authorization truth.
