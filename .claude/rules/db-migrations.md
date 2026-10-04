---
paths:
  - "apps/backend/migrations/**"
  - "apps/backend/src/db/**"
  - "apps/backend/drizzle.config.ts"
  - "scripts/db/**"
---

# Database and migration traps

Registering every migration in `migrations/meta/_journal.json` is a rule in `apps/backend/AGENTS.md`. These are the other measured traps.

## Permission walls are design

- The DB roles are deliberately narrow (ADR-0033: even Admin cannot bypass `survey.read_personal_responses`). When a query hits `permission denied`, split the read instead of widening a grant: have a `SECURITY DEFINER` function return ids and let the app role query the rest.
- `fops_app` has only INSERT on `survey.survey_responses` and no SELECT on `survey_responses` / `survey_response_answers`. Response reads go through definer functions owned by `fops_survey_aggregate_owner` / `fops_survey_evidence_reader_owner`, with `fops_app` holding only EXECUTE. Add a definer function; do not grant the table.
- `fops_survey_evidence_reader_owner` has USAGE on the `survey` schema only, not `core`, so column grants on `core.entity_links` do nothing for it.
- `ALTER FUNCTION … OWNER TO <role>` needs that role to have CREATE on the schema. Wrap it as `GRANT CREATE ON SCHEMA` → transfer → `REVOKE CREATE` (see `migrations/0046_*.sql`).
- Keep existing security checks (e.g. `requireReadable`) when changing a query path; removing one can leave every test green.

## drizzle and Postgres traps

- drizzle-kit does not read `.env`; without `DATABASE_URL_MIGRATE` it falls back to port 5432 and fails with a misleading `password authentication failed`. `db:migrate` and `db:seed` also need the URLs exported in the shell.
- `pnpm gate:db-migration-drift` needs no database and fails on an unregistered or missing migration, a nonzero `drizzle-kit check`, or schema-vs-migration drift (details: `scripts/gates/AGENTS.md`); treat a failure there as a real history problem and investigate it.
- Editing a migration that is already applied is silently skipped by the journal. Recreate the database, or run the SQL in the suite via `readFileSync`.
- A JS `null` in `.values()` becomes SQL `NULL`, not JSON `null`, so a `NOT NULL` jsonb column fails at runtime with a green typecheck. Use `{}` or `'null'::jsonb`.
- `CREATE EXTENSION vector` needs a superuser; `fops_migrate` is not one. `scripts/db/init.sql` creates it on a fresh volume only, and migration 0042 only asserts it.
- A throwaway database must be created with `owner fops_migrate`: see `apps/backend/AGENTS.md` → Verification → Provisioning a throwaway database.
