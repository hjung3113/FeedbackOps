import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

function requiredId(row: { id: string } | undefined, label: string): string {
  if (!row?.id) throw new Error(`${label} insert returned no id`);
  return row.id;
}

describe.skipIf(!runIntegration)('Survey response evidence access migration 0039', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  let actorId: string;
  let managedSystemId: string;
  let surveyId: string;
  let responseId: string;
  let textQuestionId: string;
  let otherTextQuestionId: string;
  let activeApprovalId: string;
  const rawText = 'raw response text that may only cross the definer boundary';
  const otherRawText = 'a second answer must not be returned for the first question';

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      workspaceId,
      'Survey response evidence access test',
    ]);
    const actor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level)
       values ($1, $2, $3, $4, 'admin') returning id`,
      [
        workspaceId,
        `survey-evidence-${workspaceId}`,
        `survey-evidence-${workspaceId}@local`,
        'Survey Evidence Actor',
      ],
    );
    actorId = requiredId(actor.rows[0], 'actor');
    const managedSystem = await migrateHandle.pool.query<{ id: string }>(
      'insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id',
      [workspaceId, `survey-evidence-${workspaceId}`, 'Survey Evidence Test System'],
    );
    managedSystemId = requiredId(managedSystem.rows[0], 'managed system');
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (
         workspace_id, display_id, type, status, title, primary_managed_system_id,
         operator_actor_id, created_by, opened_at
       ) values ($1, $2, 'validation', 'open', 'Evidence survey', $3, $4, $4, now()) returning id`,
      [workspaceId, `SRV-evidence-${randomUUID()}`, managedSystemId, actorId],
    );
    surveyId = requiredId(survey.rows[0], 'survey');
    const questions = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, sort_order)
       values
         ($1, $2, 'text', 'What should change?', 0),
         ($1, $2, 'text', 'What should remain?', 1)
       returning id`,
      [workspaceId, surveyId],
    );
    textQuestionId = requiredId(questions.rows[0], 'text question');
    otherTextQuestionId = requiredId(questions.rows[1], 'other text question');
    const response = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_responses (
         workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at
       ) values ($1, $2, $3, true, now()) returning id`,
      [workspaceId, surveyId, actorId],
    );
    responseId = requiredId(response.rows[0], 'response');
    await migrateHandle.pool.query(
      `insert into survey.survey_response_answers (
         workspace_id, survey_id, response_id, question_id, answer_kind, answer_value
       ) values
         ($1, $2, $3, $4, 'text', $5::jsonb),
         ($1, $2, $3, $6, 'text', $7::jsonb)`,
      [
        workspaceId,
        surveyId,
        responseId,
        textQuestionId,
        JSON.stringify(rawText),
        otherTextQuestionId,
        JSON.stringify(otherRawText),
      ],
    );
    const approvals = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_response_excerpt_approvals (
         workspace_id, survey_id, response_id, question_id, redacted_excerpt, approved_by, revoked_at
       ) values
         ($1, $2, $3, $4, 'active redacted excerpt', $5, null),
         ($1, $2, $3, $4, 'revoked redacted excerpt', $5, now())
       returning id`,
      [workspaceId, surveyId, responseId, textQuestionId, actorId],
    );
    activeApprovalId = requiredId(approvals.rows[0], 'active approval');
  });

  afterAll(async () => {
    const seeded = await migrateHandle?.pool.query<{ count: string }>(
      'select count(*)::text as count from survey.survey_response_excerpt_approvals where workspace_id = $1',
      [workspaceId],
    );
    expect(Number(seeded?.rows[0]?.count ?? 0)).toBeGreaterThan(0);
    await migrateHandle?.pool.query(
      'delete from survey.survey_response_excerpt_approvals where workspace_id = $1',
      [workspaceId],
    );
    await migrateHandle?.pool.query(
      'delete from survey.survey_response_answers where workspace_id = $1',
      [workspaceId],
    );
    await migrateHandle?.pool.query('delete from survey.survey_responses where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle?.pool.query('delete from survey.survey_questions where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle?.pool.query('delete from survey.surveys where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle?.pool.query('delete from core.display_counters where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle?.pool.query('delete from core.managed_systems where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle?.pool.query('delete from core.actors where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle?.pool.query('delete from core.workspaces where id = $1', [workspaceId]);
    const remaining = await migrateHandle?.pool.query<{ count: string }>(
      'select count(*)::text as count from survey.survey_response_excerpt_approvals where workspace_id = $1',
      [workspaceId],
    );
    expect(remaining?.rows).toEqual([{ count: '0' }]);
    await appHandle?.close();
    await migrateHandle?.close();
  });

  it('pins the definer functions, owner role, and all ACL surfaces exactly', async () => {
    const { rows: functions } = await migrateHandle.pool.query<{
      proname: string;
      owner: string;
      prosecdef: boolean;
      proconfig: string[] | null;
      provolatile: string;
      privilege_types: string[];
      execute_principals: string[];
    }>(
      `select p.proname, owner_role.rolname as owner, p.prosecdef, p.proconfig, p.provolatile,
              coalesce(array_agg(distinct acl.privilege_type order by acl.privilege_type)
                filter (where acl.privilege_type is not null), '{}'::text[]) as privilege_types,
              coalesce(array_agg(distinct coalesce(grantee.rolname::text, 'PUBLIC') order by coalesce(grantee.rolname::text, 'PUBLIC'))
                filter (where acl.privilege_type = 'EXECUTE'), '{}'::text[]) as execute_principals
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
         left join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl on true
         left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
        where n.nspname = 'survey'
          and p.proname in ('lock_response_evidence_subject', 'read_response_text_candidate', 'read_approved_result_excerpts')
        group by p.proname, owner_role.rolname, p.prosecdef, p.proconfig, p.provolatile
        order by p.proname`,
    );
    expect(functions).toHaveLength(3);
    for (const fn of functions) {
      expect(fn.owner).toBe('fops_survey_evidence_reader_owner');
      expect(fn.prosecdef).toBe(true);
      expect(fn.proconfig).toContain('search_path=pg_catalog');
      expect(fn.privilege_types).toEqual(['EXECUTE']);
      expect(fn.execute_principals).toEqual(['fops_app', 'fops_survey_evidence_reader_owner']);
    }
    expect(functions.map((fn) => [fn.proname, fn.provolatile])).toEqual([
      ['lock_response_evidence_subject', 'v'],
      ['read_approved_result_excerpts', 's'],
      ['read_response_text_candidate', 's'],
    ]);

    const { rows: role } = await migrateHandle.pool.query<{
      rolcanlogin: boolean;
      rolinherit: boolean;
      schema_create: boolean;
      schema_usage: boolean;
      migrate_is_owner_member: boolean;
      owner_is_migrate_member: boolean;
    }>(
      `select owner_role.rolcanlogin, owner_role.rolinherit,
              pg_catalog.has_schema_privilege(owner_role.rolname, 'survey', 'CREATE') as schema_create,
              pg_catalog.has_schema_privilege(owner_role.rolname, 'survey', 'USAGE') as schema_usage,
              pg_catalog.pg_has_role('fops_migrate', owner_role.rolname, 'MEMBER') as migrate_is_owner_member,
              pg_catalog.pg_has_role(owner_role.rolname, 'fops_migrate', 'MEMBER') as owner_is_migrate_member
         from pg_catalog.pg_roles owner_role
        where owner_role.rolname = 'fops_survey_evidence_reader_owner'`,
    );
    expect(role).toEqual([
      {
        rolcanlogin: false,
        rolinherit: false,
        schema_create: false,
        schema_usage: true,
        migrate_is_owner_member: true,
        owner_is_migrate_member: false,
      },
    ]);

    const { rows: ownerTablePrivileges } = await migrateHandle.pool.query(
      `select table_schema, table_name, privilege_type
         from information_schema.table_privileges
        where grantee = 'fops_survey_evidence_reader_owner'
        order by table_schema, table_name, privilege_type`,
    );
    expect(ownerTablePrivileges).toEqual([]);
    const { rows: ownerColumnPrivileges } = await migrateHandle.pool.query<{ privilege: string }>(
      `select table_name || '.' || column_name || '.' || privilege_type as privilege
         from information_schema.column_privileges
        where grantee = 'fops_survey_evidence_reader_owner'
          and table_schema = 'survey'
        order by table_name, column_name, privilege_type`,
    );
    expect(ownerColumnPrivileges.map((row) => row.privilege)).toEqual([
      'survey_questions.id.SELECT',
      'survey_questions.kind.SELECT',
      'survey_questions.prompt.SELECT',
      'survey_questions.survey_id.SELECT',
      'survey_questions.workspace_id.SELECT',
      'survey_response_answers.answer_kind.SELECT',
      'survey_response_answers.answer_value.SELECT',
      'survey_response_answers.question_id.SELECT',
      'survey_response_answers.response_id.SELECT',
      'survey_response_answers.survey_id.SELECT',
      'survey_response_answers.workspace_id.SELECT',
      'survey_response_excerpt_approvals.id.SELECT',
      'survey_response_excerpt_approvals.question_id.SELECT',
      'survey_response_excerpt_approvals.redacted_excerpt.SELECT',
      'survey_response_excerpt_approvals.revoked_at.SELECT',
      'survey_response_excerpt_approvals.survey_id.SELECT',
      'survey_response_excerpt_approvals.workspace_id.SELECT',
      'survey_responses.id.SELECT',
      'survey_responses.identity_protected.SELECT',
      'survey_responses.survey_id.SELECT',
      'survey_responses.workspace_id.SELECT',
      'surveys.analytics_area_id.SELECT',
      'surveys.display_id.SELECT',
      'surveys.id.SELECT',
      'surveys.primary_managed_system_id.SELECT',
      'surveys.status.SELECT',
      'surveys.type.SELECT',
      'surveys.workspace_id.SELECT',
    ]);
    const { rows: appTablePrivileges } = await migrateHandle.pool.query<{
      table_name: string;
      privilege_types: string[];
    }>(
      `with tables(table_name) as (
         values
           ('survey_responses'::text),
           ('survey_response_answers'::text),
           ('survey_response_excerpt_approvals'::text)
       ), privilege_kinds(privilege_type) as (
         values ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text),
                ('TRUNCATE'::text), ('REFERENCES'::text), ('TRIGGER'::text)
       )
       select tables.table_name,
              coalesce(array_agg(privilege_kinds.privilege_type order by privilege_kinds.privilege_type)
                filter (where has_table_privilege(
                  'fops_app', format('survey.%I', tables.table_name), privilege_kinds.privilege_type
                )), '{}'::text[]) as privilege_types
         from tables
         cross join privilege_kinds
        group by tables.table_name
        order by tables.table_name`,
    );
    expect(appTablePrivileges).toEqual([
      {
        table_name: 'survey_response_answers',
        privilege_types: ['INSERT'],
      },
      {
        table_name: 'survey_response_excerpt_approvals',
        privilege_types: ['INSERT', 'SELECT'],
      },
      {
        table_name: 'survey_responses',
        privilege_types: ['INSERT'],
      },
    ]);
    const { rows: appColumnPrivileges } = await migrateHandle.pool.query<{
      table_name: string;
      update_columns: string[];
      privilege_types: string[];
    }>(
      `select table_name,
              array_agg(column_name order by column_name)
                filter (where privilege_type = 'UPDATE')::text[] as update_columns,
              array_agg(distinct privilege_type order by privilege_type)::text[] as privilege_types
         from information_schema.column_privileges
        where grantee = 'fops_app'
          and table_schema = 'survey'
          and table_name in ('survey_responses', 'survey_response_answers', 'survey_response_excerpt_approvals')
        group by table_name
        order by table_name`,
    );
    expect(appColumnPrivileges).toEqual([
      {
        table_name: 'survey_response_excerpt_approvals',
        update_columns: ['revoked_at'],
        privilege_types: ['UPDATE'],
      },
    ]);
  });

  it('allows only the registered findings and entity-link provenance tuples', async () => {
    await expect(
      migrateHandle.pool.query(
        `insert into finding.findings (
           workspace_id, display_id, primary_managed_system_id, title, summary, source_type, source_id, severity, created_by
         ) values ($1, $2, $3, 'Evidence finding', 'From a response', 'survey_response', $4, 'low', $5)`,
        [workspaceId, `FND-evidence-${randomUUID()}`, managedSystemId, responseId, actorId],
      ),
    ).resolves.toBeDefined();
    await expect(
      migrateHandle.pool.query(
        `insert into finding.findings (
           workspace_id, display_id, primary_managed_system_id, title, summary, source_type, source_id, severity, created_by
         ) values ($1, $2, $3, 'Invalid finding', 'Invalid source', 'unregistered', $4, 'low', $5)`,
        [workspaceId, `FND-invalid-${randomUUID()}`, managedSystemId, responseId, actorId],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    const insertLink = (sourceType: string, targetType: string, relationType: string) =>
      migrateHandle.pool.query(
        `insert into core.entity_links (
           workspace_id, source_type, source_id, target_type, target_id, relation_type, managed_system_id, created_by
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          workspaceId,
          sourceType,
          randomUUID(),
          targetType,
          randomUUID(),
          relationType,
          managedSystemId,
          actorId,
        ],
      );
    await expect(
      insertLink('survey_response', 'finding', 'generated_finding'),
    ).resolves.toBeDefined();
    await expect(insertLink('survey_response', 'finding', 'evidence_of')).resolves.toBeDefined();
    await expect(insertLink('survey_response', 'finding', 'created_finding')).rejects.toMatchObject(
      { code: '23514' },
    );
    await expect(
      insertLink('finding', 'survey_response', 'generated_finding'),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(insertLink('survey_response', 'voc', 'generated_finding')).rejects.toMatchObject({
      code: '23514',
    });
    await migrateHandle.pool.query('delete from core.entity_links where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle.pool.query('delete from finding.findings where workspace_id = $1', [
      workspaceId,
    ]);
  });

  it('locks and returns only the allowlisted response subject metadata', async () => {
    const subject = await appHandle.pool.query<Record<string, unknown>>(
      'select * from survey.lock_response_evidence_subject($1::uuid, $2::uuid)',
      [workspaceId, responseId],
    );
    expect(Object.keys(subject.rows[0] ?? {}).sort()).toEqual([
      'analytics_area_id',
      'identity_protected',
      'primary_managed_system_id',
      'response_id',
      'survey_display_id',
      'survey_id',
      'survey_status',
      'survey_type',
    ]);
    expect(subject.rows[0]).toMatchObject({
      response_id: responseId,
      survey_id: surveyId,
      identity_protected: true,
    });
    await expect(
      appHandle.pool.query(
        'select * from survey.lock_response_evidence_subject($1::uuid, $2::uuid)',
        [otherWorkspaceId, responseId],
      ),
    ).resolves.toMatchObject({ rows: [] });
  });

  it('returns only the requested text candidate', async () => {
    const candidate = await appHandle.pool.query<{
      question_id: string;
      question_label: string;
      raw_text: string;
    }>('select * from survey.read_response_text_candidate($1::uuid, $2::uuid, $3::uuid)', [
      workspaceId,
      responseId,
      textQuestionId,
    ]);
    expect(candidate.rows).toEqual([
      { question_id: textQuestionId, question_label: 'What should change?', raw_text: rawText },
    ]);
    expect(JSON.stringify(candidate.rows)).not.toContain(otherRawText);
    for (const [testWorkspaceId, testQuestionId] of [
      [otherWorkspaceId, textQuestionId],
      [workspaceId, randomUUID()],
    ]) {
      const result = await appHandle.pool.query(
        'select * from survey.read_response_text_candidate($1::uuid, $2::uuid, $3::uuid)',
        [testWorkspaceId, responseId, testQuestionId],
      );
      expect(result.rows).toEqual([]);
    }
    await expect(
      appHandle.pool.query('select * from survey.survey_responses'),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('returns active approved excerpts only', async () => {
    const excerpts = await appHandle.pool.query<{
      approved_excerpt_id: string;
      question_id: string;
      redacted_excerpt: string;
    }>('select * from survey.read_approved_result_excerpts($1::uuid, $2::uuid)', [
      workspaceId,
      surveyId,
    ]);
    expect(excerpts.rows).toEqual([
      {
        approved_excerpt_id: activeApprovalId,
        question_id: textQuestionId,
        redacted_excerpt: 'active redacted excerpt',
      },
    ]);
    const crossWorkspaceExcerpts = await appHandle.pool.query(
      'select * from survey.read_approved_result_excerpts($1::uuid, $2::uuid)',
      [otherWorkspaceId, surveyId],
    );
    expect(crossWorkspaceExcerpts.rows).toEqual([]);
  });
});
