# Context: packages/shared

Cross-app code (types, utilities) shared between `apps/frontend` and `apps/backend`.

See root `CONTEXT.md` for system-wide product domain and `CONTEXT-MAP.md` for the full context list.

## Invariants

- Must not import either app.
- Only include code when both apps actually need it. Otherwise it belongs in the consuming app.

## Glossary

_Stub. Grow via `/grill-with-docs` as shared-package terms get resolved._
