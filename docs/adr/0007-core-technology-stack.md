# Core technology stack

FeedbackOps MVP uses one decision per layer rather than per-team or per-feature variation:

- **Runtime**: Node.js 22 LTS.
- **Backend framework**: Fastify.
- **Database**: PostgreSQL 16.
- **ORM / query builder**: Drizzle.
- **Monorepo**: pnpm workspaces with Turborepo for task orchestration and local caching.
- **Test runner (unit + integration)**: Vitest, for both `apps/backend` and `apps/frontend`.
- **End-to-end tests**: Playwright.
- **Validation**: Zod, used at API boundaries, DTO definitions, and Form schemas; canonical schemas live in `packages/shared`.
- **Server state on the frontend**: TanStack Query.
- **Client state on the frontend**: Zustand.
- **Forms**: React Hook Form with `@hookform/resolvers/zod`.
- **Router**: TanStack Router.
- **API type sharing**: shared Zod schemas in `packages/shared` consumed by Fastify Type Provider on the backend and TanStack Query hooks on the frontend. No OpenAPI codegen, no tRPC.
- **Lint and format**: Biome.
- **CI**: GitHub Actions.
- **Frontend build**: Vite (already implied by `apps/frontend` and `docs/tech-stack/component-stack.md`).
- **Frontend component layer**: shadcn/ui on Radix, governed as in `docs/tech-stack/component-stack.md`.

## Why these choices

The shape constraints in `AGENTS.md` and `docs/implementation/00-architecture.md` drive most picks:

- "Backend controllers parse HTTP and map responses only; application services own transactions, permissions, audits, idempotency, and cross-system commands." That rules out frameworks that force a particular module shape on the domain layer. **Fastify** keeps controllers thin and lets application services be plain classes; **NestJS** would force the domain layer into a NestJS-decorator shape and couple repositories to a DI container we do not need.
- The data contracts in `docs/design/15-data-contracts.md` already assume PostgreSQL semantics (uuid, enum, jsonb) and the entity-link table is heterogeneous-target. **PostgreSQL 16** is the only mainstream choice that natively supports all three; MySQL would force enum-as-string and jsonb-as-json compromises that ripple into Drizzle and Zod.
- The repository layer is the only writer of its module's tables (`docs/implementation/02-domain-module-boundaries.md`). **Drizzle** gives raw-SQL-shaped queries with TS types, keeping the repository thin and the migration story explicit; Prisma's generated client and migration runner hide behavior we want visible during audits.
- `packages/shared` is the boundary that both apps depend on. Choosing **Zod as the single schema language** lets one definition serve API validation, DTO type, drizzle-zod adapter input, and React Hook Form resolver. OpenAPI codegen would add a build step and a parallel type universe; tRPC would override the REST contract already drafted in `docs/design/14-api-draft.md`.
- Tests must verify product invariants that are visible to both backend and frontend (`docs/implementation/07-testing-strategy.md`). **Vitest** runs in both targets with one config language; **Playwright** handles multi-origin, file upload, and Korean input scenarios that Cypress cannot reliably do.

## Boundaries this ADR locks

- No mixing two backend frameworks, two ORMs, two test runners, two validation libraries, or two server-state libraries inside the monorepo without a new ADR. The boundary cost of those duplications swamps the local gain.
- Remote build cache is optional. Turborepo's local cache requires no external service; if we later need remote cache, we self-host `turborepo-remote-cache` rather than depending on Vercel's hosted service.

## Reopening

Replacing any single layer (e.g. Drizzle → Prisma, Fastify → Hono, Vitest → Jest) requires a new ADR describing the migration cost on existing modules, not a silent swap. Adding a *new* layer (e.g. introducing a background-job runner, a feature-flag service, an i18n library) is a separate ADR and does not invalidate this one.
