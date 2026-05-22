/**
 * Slice 3 #22 — DB role grants drift check for product tables.
 *
 * Asserts that `fops_app` retains SELECT + INSERT + UPDATE + DELETE on every
 * base table in the `voc` schema after migrations apply. ADR-0008 exempts
 * `core.audit_log` (INSERT + SELECT only) but every product table is full-DML
 * for fops_app.
 *
 * Catches the class of drift bug where a migration `RENAME` / `CREATE` /
 * `REVOKE` drops a previously-granted privilege without a paired re-GRANT.
 * The latest occurrence was the missing DELETE on `voc.voc_attachments`
 * after migration 0014's rename, fixed by migration 0016.
 *
 * Skipped without DATABASE_URL / DATABASE_URL_MIGRATE / WORKSPACE_ID,
 * matching the existing role-grants integration test.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';

const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const PRODUCT_SCHEMAS = ['voc'] as const;
const REQUIRED_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;

// ADR-0008: core.audit_log is INSERT + SELECT only by design. No other
// product-table exceptions today.
const KNOWN_LIMITED_GRANTS = new Set<string>([
  // 'core.audit_log' — not iterated because PRODUCT_SCHEMAS=['voc'] only.
]);

describe.skipIf(!runIntegration)(
  'ADR-0008 role grants — product tables (Slice 3 #22)',
  () => {
    let migrateHandle: DbHandle;

    beforeAll(() => {
      migrateHandle = createDb(MIGRATE_URL);
    });

    afterAll(async () => {
      await migrateHandle?.close();
    });

    it('fops_app has SELECT + INSERT + UPDATE + DELETE on every voc.* base table', async () => {
      const { rows: tables } = await migrateHandle.pool.query<{
        table_schema: string;
        table_name: string;
      }>(
        `select table_schema, table_name
           from information_schema.tables
          where table_schema = ANY($1::text[])
            and table_type = 'BASE TABLE'
          order by table_schema, table_name`,
        [PRODUCT_SCHEMAS as unknown as string[]],
      );
      expect(tables.length, 'should discover at least one product table').toBeGreaterThan(0);

      const failures: string[] = [];
      for (const t of tables) {
        const fq = `${t.table_schema}.${t.table_name}`;
        if (KNOWN_LIMITED_GRANTS.has(fq)) continue;

        const { rows: grants } = await migrateHandle.pool.query<{ privilege_type: string }>(
          `select privilege_type
             from information_schema.role_table_grants
            where grantee = 'fops_app'
              and table_schema = $1
              and table_name = $2`,
          [t.table_schema, t.table_name],
        );
        const got = new Set(grants.map((g) => g.privilege_type));
        for (const priv of REQUIRED_PRIVILEGES) {
          if (!got.has(priv)) {
            failures.push(`fops_app missing GRANT ${priv} ON ${fq}; add to a new migration`);
          }
        }
      }

      expect(failures, failures.join('\n')).toEqual([]);
    });
  },
);
