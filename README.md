# FeedbackOps

**The trail from "what we heard" to "what we did about it", kept first-class.**

FeedbackOps is an internal, AD-authenticated operating console for a single Workspace. It closes the loop from voice-of-customer intake to documented outcome, so that the connection between a complaint and the work it caused is a stored relationship rather than something reconstructed by hand later.

Without it, intake, triage decisions, evidence collection, execution tracking, and outcome validation each live in a different tool. FeedbackOps keeps them in one place and makes the links between them queryable.

It is not a public-facing tool, not a marketing site, and not multi-tenant SaaS. Every screen serves an authenticated internal Actor working inside a known Managed System scope.

- **Using the product?** → [`docs/USER-MANUAL.md`](docs/USER-MANUAL.md) — organised by what you are trying to get done.
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

Requires Node, [pnpm](https://pnpm.io/), and PostgreSQL with the `pgvector` extension available.

```bash
pnpm install
cp .env.example .env          # then fill in DATABASE_URL and WORKSPACE_ID
```

Create the schema and load demo data:

```bash
pnpm --filter @fops/backend db:migrate
SEED_MODE=personas pnpm --filter @fops/backend db:seed
```

`SEED_MODE=personas` gives you eight actors across all three role levels with realistic permission grants — the fastest way to see how the product behaves for someone who is *not* an admin. See the User Manual's persona table for who can do what.

Run both apps:

```bash
pnpm dev            # frontend on :3010, backend on :3011
```

`routeTree.gen.ts` is gitignored and generated deterministically by `pnpm gen:routes`; frontend typecheck and test scripts run it first.

Sign in from `/login`. Authentication is mock in local development; pick a persona by its external id (`mock-admin-1`, `mock-developer-1`, `mock-user-1`, …).

> **Serving to other machines on your network?** The dev server binds `0.0.0.0`, so a colleague can reach it by IP — but that origin is not a *secure context*, and browsers withhold `crypto.randomUUID` and `navigator.clipboard` there. Both are handled, but any new browser API you reach for should be checked against that constraint, because it will never reproduce on `localhost`.

---

## Layout

```
apps/backend      Fastify + Drizzle. Domain modules own their own permission checks.
apps/frontend     React + TanStack Router/Query + Vite.
packages/shared   Zod contracts shared by both. The API's actual shape lives here.
packages/ui       Design-system components. No domain imports.
docs/             Design, ADRs, implementation contracts, and the rendered prototype.
```

Two rules explain most of the structure:

- **The backend is authoritative on permissions.** Frontend permission state is a display hint. A domain module decides access, and the advisory `GET /me/permissions/check` endpoint mirrors that decision so the UI cannot claim something the enforcing route would refuse.
- **The prototype is the spec.** `docs/design-prototype/` is a rendered React prototype, and it is the source of truth for labels, layout, and microcopy — not a sketch to be improved on.

---

## Verification

| Gate | Command |
|---|---|
| Backend unit + integration | `pnpm --filter @fops/backend test:integration` |
| Frontend unit | `pnpm --filter @fops/frontend test` |
| Frontend visual regression | `pnpm --filter @fops/frontend test:visual` |
| Typecheck (whole monorepo) | `pnpm typecheck` |
| Frontend typecheck gate | `pnpm gate:fe-typecheck` |
| Lint gate (changed files) | `pnpm gate:fe-lint` |
| Module boundaries | `pnpm check:boundaries` |

Backend integration tests need `DATABASE_URL` and `WORKSPACE_ID`, and **the global setup resets and reseeds the database** — do not run them against data you care about.

The visual suite compares against committed baselines. A new screen needs its fixture, spec, and baseline added together.

---

## Contributing

`AGENTS.md` at the repository root is binding, and each package has its own `AGENTS.md` narrowing the rules for that scope. Read the one closest to what you are changing. `CLAUDE.md` files are pointer stubs to the same content; if they ever disagree, `AGENTS.md` wins and the `CLAUDE.md` line is the bug.
