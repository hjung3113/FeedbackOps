-- ADR-0019 Section C (resolves review DB-003 + ADR-0018 internal contradiction).
--
-- Migration 0005 granted fops_app full DML on core.teams per ADR-0018:23,
-- but ADR-0018:39 simultaneously declares "fops_app cannot
-- INSERT/UPDATE/DELETE on core.teams … because no Slice 2 application
-- service touches it." The two clauses contradict each other; the practical
-- result is a writeable surface with no service-layer caller — the exact
-- least-privilege drift ADR-0008 was written to prevent.
--
-- Resolution: revoke INSERT/UPDATE/DELETE on core.teams from fops_app.
-- SELECT remains so the existing list/picker reads continue to work and
-- the placeholder narrative in ADR-0018:7-46 is preserved. The slice
-- that ships team CRUD restores the write grants in its own migration
-- alongside the management service.

REVOKE INSERT, UPDATE, DELETE ON "core"."teams" FROM fops_app;
