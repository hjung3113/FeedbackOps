/**
 * Slice 3 #22 — DB role grants drift check for product tables.
 *
 * Asserts that `fops_app` holds exactly the DML privileges each `voc.*` base
 * table is designed for — no more, no less. Most product tables are full-DML
 * (SELECT/INSERT/UPDATE/DELETE), but several are intentionally append-only or
 * read-only per migration 0010 (`0010_slice3_voc_foundation.sql`):
 *
 *   - voc_public_updates / voc_reporter_replies / voc_internal_comments:
 *     SELECT + INSERT only. These are immutable conversation-feed rows; the
 *     app inserts and reads them but never edits or deletes (see voc/repo.ts).
 *   - reporter_facing_status_transitions: SELECT only. A static
 *     allowed-transition lookup table seeded by migration; the app only reads
 *     it (see voc/transitions.ts).
 *
 * (Note: ADR-0008 itself governs `core.audit_log` immutability only — it does
 * not mandate full-DML for product tables. The append-only grants above come
 * from the 0010 schema design, which keeps reporter-facing VOC history
 * immutable at the role level rather than relying on app code.)
 *
 * The check catches drift in BOTH directions:
 *   - under-grant: a `RENAME`/`CREATE`/`REVOKE` drops a required privilege
 *     without a paired re-GRANT (e.g. missing DELETE on voc.voc_attachments
 *     after 0014's rename, fixed by 0016);
 *   - over-grant: a migration silently widens an append-only table to
 *     UPDATE/DELETE, eroding the immutability guarantee.
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
const DML_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;
type DmlPrivilege = (typeof DML_PRIVILEGES)[number];

const FULL_DML: readonly DmlPrivilege[] = DML_PRIVILEGES;

// Tables intentionally narrower than full-DML for fops_app, keyed by the
// fully-qualified `schema.table` name. Grants come from migration 0010.
const EXPECTED_GRANTS: Record<string, readonly DmlPrivilege[]> = {
  'voc.workspace_display_counters': ['SELECT'],
  'voc.voc_public_updates': ['SELECT', 'INSERT'],
  'voc.voc_reporter_replies': ['SELECT', 'INSERT'],
  'voc.voc_internal_comments': ['SELECT', 'INSERT'],
  'voc.public_update_review_candidates': ['SELECT', 'INSERT'],
  'voc.reporter_facing_status_transitions': ['SELECT'],
};

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

    it('fops_app holds exactly the designed DML privileges on every voc.* base table', async () => {
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
        const expected = new Set<DmlPrivilege>(EXPECTED_GRANTS[fq] ?? FULL_DML);

        const { rows: grants } = await migrateHandle.pool.query<{ privilege_type: string }>(
          `select privilege_type
             from information_schema.role_table_grants
            where grantee = 'fops_app'
              and table_schema = $1
              and table_name = $2`,
          [t.table_schema, t.table_name],
        );
        const got = new Set(grants.map((g) => g.privilege_type));
        for (const priv of DML_PRIVILEGES) {
          if (expected.has(priv) && !got.has(priv)) {
            failures.push(`fops_app missing GRANT ${priv} ON ${fq}; add to a new migration`);
          }
          if (!expected.has(priv) && got.has(priv)) {
            failures.push(
              `fops_app has unexpected GRANT ${priv} ON ${fq}; ${fq} is append-only by design (migration 0010) — REVOKE it or update EXPECTED_GRANTS if the design changed`,
            );
          }
        }
      }

      expect(failures, failures.join('\n')).toEqual([]);
    });
  },
);
