/**
 * Slice 3 #22 — DB role grants drift check for product tables.
 *
 * Asserts that `fops_app` holds exactly the DML privileges each product-schema
 * base table is designed for — no more, no less. Most product tables are
 * full-DML (SELECT/INSERT/UPDATE/DELETE), but several are intentionally
 * append-only or read-only per migration 0010 (`0010_slice3_voc_foundation.sql`):
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

const PRODUCT_SCHEMAS = [
  'core',
  'finding',
  'permission',
  'survey',
  'task',
  'task_request',
  'voc',
  'voc_cluster',
] as const;
const DML_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;
type DmlPrivilege = (typeof DML_PRIVILEGES)[number];

const FULL_DML: readonly DmlPrivilege[] = DML_PRIVILEGES;
const SURVEY_AGGREGATE_FUNCTIONS = [
  'count_negative_outcome_without_followup',
  'read_result_aggregates',
  'read_result_response_count',
] as const;

// Tables intentionally narrower than full-DML for fops_app, keyed by the
// fully-qualified `schema.table` name. Grants come from the cited migrations.
//
// A table absent from this map is asserted as full-DML. That default is why a
// new narrower table shows up here as a missing-DELETE failure rather than as
// silence: the entry is the design record, and adding one is a decision, not
// paperwork (#207).
const EXPECTED_GRANTS: Record<string, readonly DmlPrivilege[]> = {
  // Migration 0000 makes the audit log append-only so application writes retain
  // an immutable history.
  'core.audit_log': ['SELECT', 'INSERT'],
  // Migration 0027 keeps counter mutation inside next_display_id, a SECURITY
  // DEFINER function; the application can only read the backing counter rows.
  'core.display_counters': ['SELECT'],
  // Migrations 0018 and 0019 record canonical link history by inserting and
  // soft-detaching links (status='detached'), never hard-deleting them.
  'core.entity_links': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0009 revokes writes per ADR-0019 Section C: teams remain a
  // read-only placeholder until a team-management service ships.
  'core.teams': ['SELECT'],
  // Migration 0041 grants the settings upsert path; settings are updated in
  // place and are not deleted by the application.
  'core.workspace_settings': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0021 models evidence as maintained finding context, allowing
  // creation and correction but no application hard-delete path.
  'finding.evidence_highlights': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0020 uses Finding status transitions (including archived) rather
  // than application hard deletes.
  'finding.findings': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0025 models Task lifecycle through status updates, not deletion.
  'task.tasks': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0023 preserves Task Request review/conversion history through
  // status transitions rather than application hard deletes.
  'task_request.task_requests': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0022 makes clusters draft/confirmed records, updated in place
  // rather than deleted by the application.
  'voc_cluster.voc_clusters': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0022 treats membership as a mutable set: members are added or
  // removed, but their immutable join rows are never updated.
  'voc_cluster.voc_cluster_members': ['SELECT', 'INSERT', 'DELETE'],
  'survey.surveys': ['SELECT', 'INSERT', 'UPDATE'],
  'survey.survey_questions': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'survey.survey_responses': ['INSERT'],
  'survey.survey_response_answers': ['INSERT'],
  // UPDATE is deliberately column-scoped and asserted by the #187 evidence
  // access integration test. role_table_grants must remain without table-wide UPDATE.
  'survey.survey_response_excerpt_approvals': ['SELECT', 'INSERT'],
  'voc.workspace_display_counters': ['SELECT'],
  'voc.voc_public_updates': ['SELECT', 'INSERT'],
  'voc.voc_reporter_replies': ['SELECT', 'INSERT'],
  'voc.voc_internal_comments': ['SELECT', 'INSERT'],
  // UPDATE is deliberately column-scoped and asserted below. role_table_grants
  // must remain without table-wide UPDATE.
  'voc.public_update_review_candidates': ['SELECT', 'INSERT'],
  'voc.reporter_facing_status_transitions': ['SELECT'],
  // No DELETE by design (migration 0044): a dismissal the application can
  // erase is not a dismissal that survives recomputation. UPDATE is granted
  // for the one legal transition out of a terminal state — a dismissed pair
  // promoted to `confirmed` in place (ADR-0034 D3).
  'voc.voc_recommendation_decisions': ['SELECT', 'INSERT', 'UPDATE'],
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

  it('fops_app holds exactly the designed DML privileges on every product-schema base table', async () => {
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
    const schemasWithoutTables = PRODUCT_SCHEMAS.filter(
      (schema) => !tables.some((table) => table.table_schema === schema),
    );
    expect(
      schemasWithoutTables,
      `product schemas without discovered base tables: ${schemasWithoutTables.join(', ')}`,
    ).toEqual([]);
    expect(tables.length, 'should discover at least 38 product tables').toBeGreaterThanOrEqual(38);

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
            `fops_app has unexpected GRANT ${priv} ON ${fq}; ${fq} is narrower than full-DML by design (see the migration that created it) — REVOKE it or update EXPECTED_GRANTS if the design changed`,
          );
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('fops_app reaches survey response aggregates only through the registered definer functions', async () => {
    const { rows } = await migrateHandle.pool.query<{
      proname: string;
      app_execute: boolean;
      public_execute: boolean;
    }>(
      `select p.proname,
              pg_catalog.has_function_privilege('fops_app', p.oid, 'EXECUTE') as app_execute,
              pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE') as public_execute
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
        where n.nspname = 'survey'
          and owner_role.rolname = 'fops_survey_aggregate_owner'
        order by p.proname`,
    );
    expect(rows.map((row) => row.proname)).toEqual(SURVEY_AGGREGATE_FUNCTIONS);
    expect(rows).toEqual(SURVEY_AGGREGATE_FUNCTIONS.map((proname) => ({
      proname,
      app_execute: true,
      public_execute: false,
    })));
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

  it('fops_app may submit survey responses (INSERT-only, #185 migration 0037)', async () => {
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
    ).resolves.toBeDefined();

    await expect(
      appHandle.pool.query('select * from survey.survey_responses'),
    ).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      appHandle.pool.query(
        'update survey.survey_responses set submitted_at = submitted_at where false',
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      appHandle.pool.query('delete from survey.survey_responses where false'),
    ).rejects.toMatchObject({ code: '42501' });

    await migrateHandle.pool.query(
      `delete from survey.survey_response_answers
       where response_id in (
         select id from survey.survey_responses where survey_id = $1
       )`,
      [surveyId],
    );
    await migrateHandle.pool.query('delete from survey.survey_responses where survey_id = $1', [
      surveyId,
    ]);
    await migrateHandle.pool.query('delete from survey.surveys where id = $1', [surveyId]);
  });
});
