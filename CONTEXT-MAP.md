# Context Map

This repo is a monorepo with multiple bounded contexts. Each context owns a `CONTEXT.md` that defines its local glossary and invariants. The root `CONTEXT.md` holds the system-wide overview shared across all contexts.

When working in a given path, read the matching context file plus the root one.

## Contexts

| Path                  | Context file                       | Scope                                                                                                  |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/`                   | `CONTEXT.md`                       | System-wide product overview, bounded contexts, cross-system invariants.                               |
| `apps/frontend/`      | `apps/frontend/CONTEXT.md`         | Frontend feature boundaries (`home`, `my-work`, `voc`, `voc-cluster`, `surveys`, `tasks`, `integration`, `admin`). |
| `apps/backend/`       | `apps/backend/CONTEXT.md`          | Backend modules under `apps/backend/src/modules/*`. Controllers, application services, repositories.   |
| `packages/ui/`        | `packages/ui/CONTEXT.md`           | Shared UI components. No API calls, no domain mutations.                                               |
| `packages/shared/`    | `packages/shared/CONTEXT.md`       | Cross-app code (types, utilities). Must not import either app.                                         |

## ADRs

- System-wide decisions: `docs/adr/`
- Context-specific decisions (when present): `apps/<app>/docs/adr/` or `packages/<pkg>/docs/adr/`

## Producer

Per-context `CONTEXT.md` files start as stubs and grow lazily via `/grill-with-docs` as terms and decisions get resolved. Do not flag missing files upfront.
