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

const PRODUCT_SCHEMAS = ['voc', 'survey'] as const;
const DML_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;
type DmlPrivilege = (typeof DML_PRIVILEGES)[number];

const FULL_DML: readonly DmlPrivilege[] = DML_PRIVILEGES;

// Tables intentionally narrower than full-DML for fops_app, keyed by the
// fully-qualified `schema.table` name. Grants come from migration 0010.
const EXPECTED_GRANTS: Record<string, readonly DmlPrivilege[]> = {
  'survey.surveys': ['SELECT', 'INSERT', 'UPDATE'],
  'survey.survey_questions': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'survey.survey_responses': [],
  'survey.survey_response_answers': [],
  'voc.workspace_display_counters': ['SELECT'],
  'voc.voc_public_updates': ['SELECT', 'INSERT'],
  'voc.voc_reporter_replies': ['SELECT', 'INSERT'],
  'voc.voc_internal_comments': ['SELECT', 'INSERT'],
  // UPDATE is deliberately column-scoped and asserted below. role_table_grants
  // must remain without table-wide UPDATE.
  'voc.public_update_review_candidates': ['SELECT', 'INSERT'],
  'voc.reporter_facing_status_transitions': ['SELECT'],
};

describe.skipIf(!runIntegration)('ADR-0008 role grants — product tables (Slice 3 #22)', () => {
  let migrateHandle: DbHandle;
  let appHandle: DbHandle;

  beforeAll(() => {
    migrateHandle = createDb(MIGRATE_URL);
    appHandle = createDb(APP_URL);
  });

  afterAll(async () => {
    await migrateHandle?.close();
    await appHandle?.close();
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

  it('fops_app UPDATE on review candidates is limited to resolution columns', async () => {
    const { rows } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'fops_app'
            and table_schema = 'voc'
            and table_name = 'public_update_review_candidates'
            and privilege_type = 'UPDATE'
          order by column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'actioned_public_update_id',
      'dismissal_reason',
      'resolved_at',
      'resolved_by_actor_id',
      'status',
      'updated_at',
    ]);
    const { rows: tablePrivileges } = await migrateHandle.pool.query<{
      has_table_update: boolean;
      has_delete: boolean;
      has_truncate: boolean;
    }>(
      `select
           has_table_privilege('fops_app', 'voc.public_update_review_candidates', 'UPDATE') as has_table_update,
           has_table_privilege('fops_app', 'voc.public_update_review_candidates', 'DELETE') as has_delete,
           has_table_privilege('fops_app', 'voc.public_update_review_candidates', 'TRUNCATE') as has_truncate`,
    );
    expect(tablePrivileges[0]).toEqual({
      has_table_update: false,
      has_delete: false,
      has_truncate: false,
    });
  });

  it('fops_app may create Surveys but cannot submit responses before #185', async () => {
    const actor = await migrateHandle.pool.query<{ id: string }>(
      'select id from core.actors where workspace_id = $1 order by created_at limit 1',
      [WORKSPACE_ID],
    );
    const managedSystem = await migrateHandle.pool.query<{ id: string }>(
      'select id from core.managed_systems where workspace_id = $1 order by created_at limit 1',
      [WORKSPACE_ID],
    );
    const actorId = actor.rows[0]?.id;
    const managedSystemId = managedSystem.rows[0]?.id;
    if (!actorId || !managedSystemId)
      throw new Error('seed must contain an actor and managed system');

    const survey = await appHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (
           workspace_id, display_id, type, title, primary_managed_system_id,
           operator_actor_id, created_by
         ) values ($1, $2, 'discovery', 'Role grant survey', $3, $4, $4) returning id`,
      [WORKSPACE_ID, `SRV-role-grant-${Date.now()}`, managedSystemId, actorId],
    );
    const surveyId = survey.rows[0]?.id;
    expect(surveyId).toBeTruthy();

    await expect(
      appHandle.pool.query(
        `insert into survey.survey_responses (
           workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at
         ) values ($1, $2, $3, false, now())`,
        [WORKSPACE_ID, surveyId, actorId],
      ),
    ).rejects.toMatchObject({ code: '42501' });

    await migrateHandle.pool.query('delete from survey.surveys where id = $1', [surveyId]);
  });
});
