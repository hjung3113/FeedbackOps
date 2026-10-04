# FeedbackOps

**The trail from "what we heard" to "what we did about it", kept first-class.**

FeedbackOps is an internal, AD-authenticated operating console for a single Workspace. It closes the loop from voice-of-customer intake to documented outcome, so that the connection between a complaint and the work it caused is a stored relationship rather than something reconstructed by hand later.

Without it, intake, triage decisions, evidence collection, execution tracking, and outcome validation each live in a different tool. FeedbackOps keeps them in one place and makes the links between them queryable.

It is not a public-facing tool, not a marketing site, and not multi-tenant SaaS. Every screen serves an authenticated internal Actor working inside a known Managed System scope.

- **Using the product?** → [`docs/USER-MANUAL.md`](docs/USER-MANUAL.md) — organised by what you are trying to get done.
- **Want a visual walkthrough?** → [Interactive user guide](docs/user-guide/index.html) — Korean chapters with annotated screenshots.
- **Changing the code?** → [`AGENTS.md`](AGENTS.md) is the binding rulebook. Read it before any change.
- **Wondering why something is the way it is?** → [`docs/adr/`](docs/adr/) — decisions are recorded, and an ADR supersedes any other document on the decision it made.

---

## The loop

```
  Intake  ─────►  Triage  ─────►  Evidence  ─────►  Execution  ─────►  Outcome
  (VOC)           (severity,      (Finding)         (Task Request      (Survey,
                   owner, area)                      → Task)            Public Update)
     │                                                                      │
     └──────────────── entity_links: the canonical cross-system trail ──────┘
```

Five ideas carry the product:

| Concept | What it is |
|---|---|
| **VOC** | One piece of feedback about one Managed System. Has a reporter-facing status and, separately, an internal triage state. |
| **Finding** | A judgement supported by evidence — the bridge from "people said this" to "we should do something". |
| **Task Request** | A proposal for execution work. It exists so the Task backlog never fills with unreviewed candidates. |
| **Task** | Execution work with its own state machine, deliberately independent of what the reporter is told. |
| **Entity link** | The stored relationship between any of the above. This is what makes the trail real rather than implied. |

**Two invariants worth knowing before you read anything else:**

1. **Reporter-facing status and internal status never auto-map.** A Task reaching `released` does not silently mark a VOC `resolved`. Releases create candidates; a human confirms. Implicit propagation would bypass the audit trail and produce false reassurance — "Task done" is not always "problem solved" (ADR-0005).
2. **Permission-limited content shows a path, not a blank.** A blocked panel shows an approved summary or a request-access action. Never a stack trace, never silence.

---

## Running it locally

Requires Node 22 (`.nvmrc`), [pnpm](https://pnpm.io/), and Docker (or your own PostgreSQL with the `pgvector` extension).

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres with pgvector on :5434, plus MinIO
cp .env.example .env                              # already points at the compose database
set -a; . ./.env; set +a                          # nothing loads .env for you
```

`.env.example` carries working `DATABASE_URL`, `DATABASE_URL_MIGRATE`, and `WORKSPACE_ID` values for the compose database. Neither app reads `.env` itself, so export it in every shell you run the commands below from (`pnpm --filter @fops/backend test:integration` sources it on its own).

Create the schema and load demo data:

```bash
pnpm --filter @fops/backend db:migrate
SEED_MODE=personas pnpm --filter @fops/backend db:seed
```

`SEED_MODE=personas` gives you six login personas across all three role levels with realistic permission grants — the fastest way to see how the product behaves for someone who is *not* an admin. See the User Manual's persona table for who can do what.

Run both apps:

```bash
pnpm dev --env-mode=loose   # frontend on :3010, backend on :3011
```

`--env-mode=loose` is needed because Turborepo runs in strict env mode and would otherwise hide the exported `.env` variables from the backend. The backend port comes from `PORT` (`.env.example` sets `3011`; the code default is `3001`), and the Vite proxy targets `3011`.

`routeTree.gen.ts` is gitignored and generated deterministically by `pnpm gen:routes`; frontend typecheck and test scripts run it first.

Sign in from `/login`. Authentication is mock in local development; pick a persona by its external id (`mock-admin-1`, `mock-developer-1`, `mock-user-1`, …).

> **Serving to other machines on your network?** The backend binds `0.0.0.0` (`HOST`), but the Vite dev server listens on localhost only; start it with `pnpm --filter @fops/frontend exec vite --host` for a colleague to reach it by IP. That origin is not a *secure context*, and browsers withhold `crypto.randomUUID` and `navigator.clipboard` there. Both are handled, but any new browser API you reach for should be checked against that constraint, because it will never reproduce on `localhost`.

---

## Layout

```
apps/backend      Fastify + Drizzle. Domain modules own their own permission checks.
apps/frontend     React + TanStack Router/Query + Vite.
packages/shared   Zod contracts shared by both. The API's actual shape lives here.
packages/ui       Design-system components. No domain imports.
docs/             Design, ADRs, implementation contracts, and the original prototype (reference).
```

Two rules explain most of the structure:

- **The backend is authoritative on permissions.** Frontend permission state is a display hint. A domain module decides access, and the advisory `GET /me/permissions/check` endpoint mirrors that decision so the UI cannot claim something the enforcing route would refuse.
- **The shipped UI is the UI authority.** Existing screens, `apps/frontend/src/lib/copy/*`, and the committed visual baselines decide layout and copy (ADR-0060). `docs/design-prototype/` is the original rendered prototype, kept as a reference for surfaces not built yet.

---

## Verification

| Gate | Command |
|---|---|
| Backend unit + integration | `pnpm --filter @fops/backend test:integration` |
| Frontend unit | `pnpm --filter @fops/frontend test` |
| Frontend visual regression | `pnpm --filter @fops/frontend test:visual` |
| Typecheck (whole monorepo) | `pnpm typecheck` |
| Frontend typecheck gate | `pnpm gate:fe-typecheck` |
| Lint gate (changed files) | `pnpm gate:fe-lint --base origin/develop` |
| Module boundaries | `pnpm check:boundaries` |
| Migration drift | `pnpm gate:db-migration-drift` |

Backend integration tests need `DATABASE_URL`, `DATABASE_URL_MIGRATE`, and `WORKSPACE_ID`, and **the global setup resets and reseeds the database** — do not run them against data you care about.

The visual suite compares against committed baselines. A new screen needs its fixture, spec, and baseline added together.

---

## Contributing

`AGENTS.md` at the repository root is binding, and each package has its own `AGENTS.md` narrowing the rules for that scope. Read the one closest to what you are changing. `CLAUDE.md` files are pointer stubs to the same content; if they ever disagree, `AGENTS.md` wins and the `CLAUDE.md` line is the bug.
