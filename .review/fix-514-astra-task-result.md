# Final PR526 Astra finding 1 — Task Milestone row

## Change

The Task detail row shows cached Milestone identity only while the Milestone query has no settled error. A pending refetch keeps the current value visible; a settled 403 no longer exposes the cached display ID or title. The query cache is retained. The existing 404 placeholder, null-ID no-fetch behavior, ID-first value, and read-only row remain covered by the existing `TaskDetailPanel` component tests.

The new regression mounts `TaskDetailPanel`, completes a successful Milestone read, invalidates that query, settles the refetch with `403 permission.denied`, confirms the successful DTO remains in React Query, and asserts the row changes to `—` and removes the cached identity.

## TDD

- **RED:** `pnpm --filter frontend exec vitest run src/features/tasks/routes/TaskListRoute.test.tsx -t 'hides cached milestone identity after a denied refetch'` — failed because the cached ID/title remained and `—` did not render after the settled 403.
- **GREEN:** the same command — passed, 1 focused test.

## Verification

- `pnpm --filter frontend exec vitest run src/features/tasks` — 11 files, 117 tests passed.
- `pnpm gate:fe-typecheck` — 0 errors.
- `pnpm gate:fe-lint` — passed with 0 unexpected errors.
- `git diff --check` — passed.
