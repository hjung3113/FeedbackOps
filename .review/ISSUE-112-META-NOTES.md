# Issue #112 Migration Meta Notes

## What `drizzle-kit generate` produced

Command run from the repo root:

```sh
pnpm --filter backend exec drizzle-kit generate
```

Result: no migration files were produced. Drizzle exited with:

```text
Error: [migrations/meta/0003_snapshot.json, migrations/meta/0004_snapshot.json] are pointing to a parent snapshot: migrations/meta/0003_snapshot.json/snapshot.json which is a collision.
```

That existing 0003/0004 snapshot collision is outside the Issue #112 allowed scope, so those files were not changed.

To obtain Drizzle's current schema snapshot shape without touching workspace migrations, I generated into `/private/tmp/fops-112-drizzle-snapshot-20260615e` using a temporary config with the same schema inputs as `apps/backend/drizzle.config.ts`.

Scratch generate output:

```text
13 tables
actors 9 columns 3 indexes 1 fks
analytics_areas 10 columns 3 indexes 4 fks
audit_log 9 columns 4 indexes 2 fks
entity_links 13 columns 4 indexes 3 fks
idempotency_keys 6 columns 1 indexes 1 fks
managed_systems 11 columns 2 indexes 4 fks
rate_limits 4 columns 1 indexes 0 fks
sessions 9 columns 2 indexes 2 fks
teams 7 columns 2 indexes 2 fks
workspaces 4 columns 0 indexes 0 fks
permission_denies 10 columns 2 indexes 0 fks
permission_grants 14 columns 3 indexes 0 fks
permission_requests 16 columns 3 indexes 0 fks
```

The scratch SQL was not copied into the repo because it is a full-schema generated migration and would replace hand-reviewed migration history.

## Reconciliation performed

- Added `apps/backend/migrations/meta/_journal.json` entry:
  - `idx`: `18`
  - `version`: `"7"`
  - `when`: `1781533641945`
  - `tag`: `"0018_entity_links"`
  - `breakpoints`: `true`
- Added `apps/backend/migrations/meta/0018_snapshot.json` from the scratch Drizzle snapshot, with `prevId` chained to the latest existing snapshot id from `0004_snapshot.json`.
- Kept `apps/backend/migrations/0018_entity_links.sql` unchanged as the only `0018*.sql` file.

## Preserved hand-written SQL requirements

`apps/backend/migrations/0018_entity_links.sql` remains the migration applied by the journal and still contains:

- `GRANT INSERT, SELECT ON "core"."entity_links" TO fops_app;`
- raw `CHECK` constraints for relation type, visibility, status, source type, target type, and not-self.
- partial active indexes with `WHERE "status" = 'active'`.

Verifier should validate a fresh `drizzle-kit migrate` applies journal entries `0000` through `0018`, where idx 18 resolves to `apps/backend/migrations/0018_entity_links.sql`.
