# Shared Package Agent Guide

## Allowed Content

- Generated API types.
- Validation schemas.
- Enum constants and discriminated unions.
- DTO helpers that do not orchestrate workflows.
- Pure utilities with no app, database, or UI dependency.

## Forbidden Content

- Imports from `apps/backend` or `apps/frontend`.
- Database access.
- HTTP clients.
- React components or hooks.
- Permission decisions with runtime authority.
- Domain workflow orchestration.

## Rules

- Prefer explicit exported return types for shared helpers.
- Keep domain values centralized; avoid stringly typed statuses outside schema or enum definitions.
- Changes here affect both apps, so update backend and frontend tests when contracts change.
