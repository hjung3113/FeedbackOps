# Backend addendum to 00-IMPL-RULES.md (read both)

1. Read `apps/backend/AGENTS.md` and every module `AGENTS.md` you touch, plus
   `docs/implementation/02-domain-module-boundaries.md` §Approved cross-module surfaces.
2. Backend integration suites are env-gated: they skip without a DB. Your task names **your own throwaway issue
   database** (port 5439) and the exact command:
   `FEEDBACKOPS_ENV_FILE=<abs worktree>/.review/env.verify pnpm --filter backend test:integration <files>`
   (paths relative to `apps/backend`). Run **only the integration files you added or touched**, never the full
   suite, never another env file, never `.env`; the runner refuses port 5434 (the dev database). Each run
   truncates and re-seeds that database, which is expected. The suites run as the low-priv `fops_app` role: write
   the tests so they pass under it. Report the command and its result. If your task adds a migration, the issue
   database does not have it (you cannot migrate): skip the suites that need it and say so; the conductor
   recreates the database and runs them.
3. **Permission walls are design.** Do not add or widen any GRANT, do not change `fops_app`/`fops_migrate` roles, and
   do not add migrations unless the task says so. If a change seems to need a wider grant, stop and write that in
   the report instead.
4. Behaviour-preserving refactor: every existing test keeps its setup, fixtures and assertions. The error code, HTTP
   status and `fields[].path`/`code` of every existing failure path stay byte-identical.
5. Shared seed helpers live in `apps/backend/src/test-support/`; reuse them instead of new ad-hoc seeds.
6. You may run `pnpm --filter @fops/backend exec tsc --noEmit`, unit tests that need no DB, and rule 2's
   integration files; never `git`, DB commands (`db:migrate`, `db:seed`, `psql`) or the full integration suite (the
   conductor runs that).
7. Hand-written migration SQL is only executed by the conductor, so copy proven patterns (s78: two errors surfaced
   only at migrate time): a pg-boss queue insert lists every `pgboss.queue` column as in
   `0051_voc_cluster_autogen_shadow.sql`; inside a plpgsql `IF … THEN`, wrap any `CASE … THEN … END` in parentheses
   (plpgsql ends the IF condition at the first `THEN`).
8. **Error envelopes:** validation and denial responses carry their fields under `detail`; assert
   `body.detail.fields` (and `body.detail.*` generally), not `body.fields` (recurred in s81 #1171 and #1173).
9. **Rate-limit keys** are `<workspace_id>:<actor_id>`; a fixture or assertion that builds a key must use that
   format (s81 #1172).
