# Backend addendum to 00-IMPL-RULES.md (read both)

1. Read `apps/backend/AGENTS.md` and every module `AGENTS.md` you touch, plus
   `docs/implementation/02-domain-module-boundaries.md` §Approved cross-module surfaces.
2. Backend integration suites are env-gated: they skip without a DB, and you cannot run them. The conductor runs
   `pnpm --filter backend test:integration` on a throwaway DB as the low-priv `fops_app` role. Write the tests so
   they pass under that role.
3. **Permission walls are design.** Do not add or widen any GRANT, do not change `fops_app`/`fops_migrate` roles, and
   do not add migrations unless the task says so. If a change seems to need a wider grant, stop and write that in
   the report instead.
4. Behaviour-preserving refactor: every existing test keeps its setup, fixtures and assertions. The error code, HTTP
   status and `fields[].path`/`code` of every existing failure path stay byte-identical.
5. Shared seed helpers live in `apps/backend/src/test-support/`; reuse them instead of new ad-hoc seeds.
6. You may run `pnpm --filter @fops/backend exec tsc --noEmit` and unit tests that need no DB; never `git`, DB
   commands or the integration suite (the conductor runs those on a throwaway DB).
