# Context: apps/frontend

Frontend app shell. Composes typed API hooks and shared components into route-owned features.

See root `CONTEXT.md` for system-wide product domain and `CONTEXT-MAP.md` for the full context list.

## Feature boundaries

Top-level route ownership lives under `apps/frontend/src/features/*`:

- `home`
- `my-work`
- `voc`
- `surveys`
- `tasks`
- `integration` — includes Findings, Evidence, Coverage, Links
- `admin` — includes Managed System Registry, Analytics Areas, Permission Requests, workspace settings

## Invariants

- Screens compose typed API hooks and shared components. They do not enforce backend permissions as truth.
- Do not place source code at the repo root.
- Route composition belongs here, not under `systems/*`.

## Glossary

_Stub. Grow via `/grill-with-docs` as frontend-specific terms get resolved._
