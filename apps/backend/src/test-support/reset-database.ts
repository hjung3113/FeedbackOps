// Truncate every product table so a test run always starts from the same
// state. Used by the vitest globalSetup (`global-setup.ts`).
//
// Why this exists: see #205. The 90 integration suites each hand-roll their
// own `afterAll` cleanup, and several of them delete `core.actors` before the
// rows that reference it (`core.audit_log`, `core.sessions`,
// `permission.permission_grants`, ...). The FK violation aborts the hook, so
// every delete after that line never runs and the fixtures leak. The leaked
// rows then collide with the next run — measured on a freshly migrated
// database, back-to-back runs of the same suite went 137 failures then 246.
//
// Truncating up front does not fix those broken teardowns; it makes every run
// a first run, so failure counts stop depending on how many times the suite
// has been executed before. That determinism is the precondition for fixing
// the teardown order itself.
//
// Runs as the migrate role: `fops_app` deliberately has no DELETE on
// `core.audit_log` (ADR-0008/0019), so it cannot clear the table that causes
// the FK abort in the first place.

import { createDb } from '../db/client.js';

// `drizzle` holds the applied-migration ledger. Truncating it would make
// drizzle-kit replay every migration against a schema that already has them.
//
// `pgboss` holds queue and cron-schedule registrations, which are boot-time
// infrastructure rather than test fixtures — the boot-wiring suites assert
// that `pgboss.queue` and `pgboss.schedule` contain the registered entries,
// and wiping them makes those assertions skip instead of run.
const PRESERVED_SCHEMAS = ['pg_catalog', 'information_schema', 'drizzle', 'pgboss'];

// Reference data inserted by a migration rather than by the seed. Truncating
// this is unrecoverable without replaying migrations — the seed does not know
// how to put the rows back — and wiping it silently turned four VOC suites red
// with an empty `next_reporter_states.allowed` list.
//
// The other two migration-populated tables, `core.display_counters` and
// `voc.workspace_display_counters`, are deliberately NOT preserved. They are
// mutable counters, and carrying them across runs makes display-id values
// depend on how many runs came before: preserving them measured 137, 139, 137
// failures on three consecutive runs, while truncating them measured 137 every
// time. The seed re-creates the rows it needs.
const PRESERVED_TABLES = ['voc.reporter_facing_status_transitions'];

export interface ResetResult {
  tablesTruncated: number;
}

export async function resetDatabase(migrateUrl: string): Promise<ResetResult> {
  const handle = createDb(migrateUrl);
  try {
    const { rows } = await handle.pool.query<{ qualified: string }>(
      `select quote_ident(table_schema) || '.' || quote_ident(table_name) as qualified
         from information_schema.tables
        where table_type = 'BASE TABLE'
          and table_schema <> all($1::text[])
          and table_schema || '.' || table_name <> all($2::text[])
        order by table_schema, table_name`,
      [PRESERVED_SCHEMAS, PRESERVED_TABLES],
    );

    if (rows.length === 0) return { tablesTruncated: 0 };

    // One statement so CASCADE resolves the whole FK graph at once — deleting
    // these tables one at a time is exactly the ordering problem being worked
    // around here.
    const targets = rows.map((row) => row.qualified).join(', ');
    await handle.pool.query(`truncate table ${targets} restart identity cascade`);

    return { tablesTruncated: rows.length };
  } finally {
    await handle.close();
  }
}
