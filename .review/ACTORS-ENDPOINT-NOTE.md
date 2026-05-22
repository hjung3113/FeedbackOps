# `/actors` endpoint — drift fix

## Why it was missed

Filed in the Slice 3 #21 era. The Triage `<OwnerPicker>` work landed
`useWorkspaceActors` (`apps/frontend/src/features/voc/hooks/useWorkspaceActors.ts`)
calling `GET /actors?workspace=current`, but the matching backend route was
never registered. Two CI guards were in place at the time — `pnpm typecheck`,
`pnpm check:boundaries`, and `vite-proxy-completeness.test.ts` — but each only
catches drift in one direction:

- TypeScript / boundaries: only check **shape**, never **wire reality**.
- `vite-proxy-completeness.test.ts`: **BE→proxy** drift only (every backend
  route must be proxied). It does not check that every FE call resolves to a
  registered backend route — the opposite direction.

Result: dev experience showed an empty assignee picker (BE 404 swallowed by
react-query `retry: 1`, then a generic error), and no test failed.

## What this PR adds

1. **BE route**: `apps/backend/src/modules/auth/list-actors-routes.ts` registered
   in `server.ts` after `authRoutes`. Auth-gated, workspace-scoped, returns
   `{ actors: [{ id, display_name, email, role_level }] }` sorted by
   `display_name ASC, id ASC`.
2. **Shared schema**: `packages/shared/src/auth/list-actors.ts` with
   `listActorsResponseSchema` + `ActorListItem` / `ListActorsResponse` types.
3. **FE alignment**: `useWorkspaceActors` now consumes `ListActorsResponse`
   from `@fops/shared` and maps each row to the OwnerPicker's `{id,
   display_name, kind: 'user'}` shape. `kind` is hardcoded to `'user'`
   because the data model has no team actors yet (ADR-0018).
4. **Vite proxy entry**: `/actors` added to `apps/frontend/vite.config.ts`.
5. **Reverse drift test**: `apps/backend/src/__tests__/fe-call-endpoints-exist.test.ts`
   scans `apps/frontend/src/**/*.{ts,tsx}` for `apiClient` / `fetch` URL
   literals and asserts each root prefix is registered by some
   `app.route({ url: ... })` in BE.

## Validation that the reverse drift test catches this class of bug

Manually verified the failure mode: deleting the new `/actors` route makes
the test fail with the exact missing prefix (`'/actors'`) and the calling
file (`apps/frontend/src/features/voc/hooks/useWorkspaceActors.ts`). Adding
it back makes the test pass.

## Spec deltas from the original plan

- Plan said 400 for the unsupported `workspace` value; the codebase's Zod
  error handler returns **422 `validation.failed`** for query schema failures
  (`apps/backend/src/server.ts:296-304`). Followed codebase convention.
- Plan said `role_level: 'admin' | 'user' | 'guest'`; the canonical enum
  (`packages/shared/src/enums/index.ts:7`) is **`admin | developer | user`**.
  Followed the canonical enum.
- Plan claimed the seed contains 28 actors; the actual seed
  (`apps/backend/src/seed/index.ts:28-50`) seeds 3 baseline actors. The route
  works regardless of count; the smoke assertion is `actors.length >= 3`.
- Plan suggested the route may live in `apps/backend/src/modules/core/` —
  `core/` has no actor read service yet, and `auth/` already owns the actor
  identity surface (`/me`, `/auth/mock-login`). Colocated under
  `apps/backend/src/modules/auth/list-actors-routes.ts`.

## Tests added

- `apps/backend/src/modules/auth/__tests__/list-actors.integration.test.ts`
  (5 cases: 200 sorted; 200 workspace-scoped via row-count cross-check; 401
  no-cookie; 422 unsupported workspace value; 422 missing workspace).
- `packages/shared/src/auth/__tests__/list-actors.test.ts` (4 schema cases).
- `apps/backend/src/__tests__/fe-call-endpoints-exist.test.ts` (the reverse
  drift smoke).
