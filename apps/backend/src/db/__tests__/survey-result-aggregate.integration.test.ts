import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

type AggregateRow = {
  question_id: string;
  question_kind: string;
  bucket_key: string | null;
  bucket_count: string;
};

function requiredId(row: { id: string } | undefined, label: string): string {
  if (!row?.id) throw new Error(`${label} insert returned no id`);
  return row.id;
}

describe.skipIf(!runIntegration)('Survey aggregate security boundary (0038, 0046)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  const workspaceId = randomUUID();
  const mismatchedWorkspaceId = randomUUID();
  const actorIds: string[] = [];
  let managedSystemId: string;
  let surveyId: string;
  let choiceQuestionId: string;
  let multipleChoiceQuestionId: string;
  let ratingQuestionId: string;
  let textQuestionId: string;
  let mismatchedTextQuestionId: string;
  const textAnswer = 'must never leave the aggregate interface';

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    await migrateHandle.pool.query('delete from core.rate_limits');
    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      workspaceId,
      'Survey result aggregate test',
    ]);

    for (const label of ['first', 'second', 'third']) {
      const actor = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.actors (workspace_id, external_id, email, display_name, role_level)
         values ($1, $2, $3, $4, 'admin') returning id`,
        [
          workspaceId,
          `survey-result-${label}-${workspaceId}`,
          `survey-result-${label}-${workspaceId}@local`,
          `Survey Result ${label} Actor`,
        ],
      );
      actorIds.push(requiredId(actor.rows[0], `${label} actor`));
    }

    const managedSystem = await migrateHandle.pool.query<{ id: string }>(
      'insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id',
      [workspaceId, `survey-result-${workspaceId}`, 'Survey Result Test System'],
    );
    managedSystemId = requiredId(managedSystem.rows[0], 'managed system');

    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (
         workspace_id, display_id, type, status, title, primary_managed_system_id,
         operator_actor_id, created_by, opened_at
       ) values ($1, $2, 'discovery', 'open', 'Aggregate survey', $3, $4, $4, now()) returning id`,
      [workspaceId, `SRV-result-${randomUUID()}`, managedSystemId, actorIds[0]],
    );
    surveyId = requiredId(survey.rows[0], 'survey');

    const questions = await migrateHandle.pool.query<{ id: string; kind: string }>(
      `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, options, rating_min, rating_max, sort_order)
       values
         ($1, $2, 'single_choice', 'Choice', '[{"key":"yes","label":"Yes"},{"key":"no","label":"No"}]'::jsonb, null, null, 0),
         ($1, $2, 'multiple_choice', 'Multiple choice', '[{"key":"alpha","label":"Alpha"},{"key":"beta","label":"Beta"},{"key":"gamma","label":"Gamma"}]'::jsonb, null, null, 1),
         ($1, $2, 'rating', 'Rating', null, 1, 5, 2),
         ($1, $2, 'text', 'Text', null, null, null, 3),
         ($1, $2, 'text', 'Mismatched text', null, null, null, 4)
       returning id, kind`,
      [workspaceId, surveyId],
    );
    choiceQuestionId = requiredId(questions.rows.find((row) => row.kind === 'single_choice'), 'choice question');
    multipleChoiceQuestionId = requiredId(
      questions.rows.find((row) => row.kind === 'multiple_choice'),
      'multiple-choice question',
    );
    ratingQuestionId = requiredId(questions.rows.find((row) => row.kind === 'rating'), 'rating question');
    const textQuestions = questions.rows.filter((row) => row.kind === 'text');
    textQuestionId = requiredId(textQuestions[0], 'text question');
    mismatchedTextQuestionId = requiredId(textQuestions[1], 'mismatched text question');

    for (const [index, actorId] of actorIds.entries()) {
      const response = await migrateHandle.pool.query<{ id: string }>(
        `insert into survey.survey_responses (
           workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at
         ) values ($1, $2, $3, false, now()) returning id`,
        [workspaceId, surveyId, actorId],
      );
      const responseId = requiredId(response.rows[0], `response ${index}`);
      const choice = index === 2 ? 'no' : 'yes';
      const rating = index === 2 ? 5 : 3;
      const multipleChoice = [
        ['alpha', 'beta'],
        ['beta', 'gamma'],
        ['alpha', 'gamma'],
      ][index];
      await migrateHandle.pool.query(
        `insert into survey.survey_response_answers (
           workspace_id, survey_id, response_id, question_id, answer_kind, answer_value
         ) values
           ($1, $2, $3, $4, 'single_choice', $5::jsonb),
           ($1, $2, $3, $6, 'multiple_choice', $7::jsonb),
           ($1, $2, $3, $8, 'rating', $9::jsonb),
           ($1, $2, $3, $10, 'text', $11::jsonb)`,
        [
          workspaceId,
          surveyId,
          responseId,
          choiceQuestionId,
          JSON.stringify(choice),
          multipleChoiceQuestionId,
          JSON.stringify(multipleChoice),
          ratingQuestionId,
          JSON.stringify(rating),
          textQuestionId,
          JSON.stringify(textAnswer),
        ],
      );

      if (index === 0) {
        await migrateHandle.pool.query(
          `insert into survey.survey_response_answers (
             workspace_id, survey_id, response_id, question_id, answer_kind, answer_value
           ) values ($1, $2, $3, $4, 'rating', '1'::jsonb)`,
          [workspaceId, surveyId, responseId, mismatchedTextQuestionId],
        );
      }
    }
  });

  afterAll(async () => {
    await migrateHandle?.pool.query('delete from survey.survey_response_answers where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle?.pool.query('delete from survey.survey_responses where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle?.pool.query('delete from survey.survey_questions where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle?.pool.query('delete from survey.surveys where workspace_id = $1', [workspaceId]);
    await migrateHandle?.pool.query('delete from core.display_counters where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle?.pool.query('delete from core.managed_systems where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle?.pool.query('delete from core.actors where workspace_id = $1', [workspaceId]);
    await migrateHandle?.pool.query('delete from core.workspaces where id = $1', [workspaceId]);
    await appHandle?.close();
    await migrateHandle?.close();
  });

  it('keeps fops_app from reading raw response or answer rows', async () => {
    for (const table of ['survey.survey_responses', 'survey.survey_response_answers']) {
      await expect(appHandle.pool.query(`select * from ${table}`)).rejects.toMatchObject({
        code: '42501',
      });
    }
  });

  it('returns one answer-count row per question plus choice and rating distribution buckets', async () => {
    const aggregates = await appHandle.pool.query<AggregateRow>(
      'select * from survey.read_result_aggregates($1::uuid, $2::uuid) order by question_kind, bucket_key',
      [workspaceId, surveyId],
    );
    expect(aggregates.rows).toEqual([
      { question_id: multipleChoiceQuestionId, question_kind: 'multiple_choice', bucket_key: 'alpha', bucket_count: '2' },
      { question_id: multipleChoiceQuestionId, question_kind: 'multiple_choice', bucket_key: 'beta', bucket_count: '2' },
      { question_id: multipleChoiceQuestionId, question_kind: 'multiple_choice', bucket_key: 'gamma', bucket_count: '2' },
      { question_id: multipleChoiceQuestionId, question_kind: 'multiple_choice', bucket_key: null, bucket_count: '3' },
      { question_id: ratingQuestionId, question_kind: 'rating', bucket_key: '3', bucket_count: '2' },
      { question_id: ratingQuestionId, question_kind: 'rating', bucket_key: '5', bucket_count: '1' },
      { question_id: ratingQuestionId, question_kind: 'rating', bucket_key: null, bucket_count: '3' },
      { question_id: choiceQuestionId, question_kind: 'single_choice', bucket_key: 'no', bucket_count: '1' },
      { question_id: choiceQuestionId, question_kind: 'single_choice', bucket_key: 'yes', bucket_count: '2' },
      { question_id: choiceQuestionId, question_kind: 'single_choice', bucket_key: null, bucket_count: '3' },
      { question_id: textQuestionId, question_kind: 'text', bucket_key: null, bucket_count: '3' },
    ]);
    expect(JSON.stringify(aggregates.rows)).not.toContain(textAnswer);
    expect(aggregates.rows).not.toContainEqual(
      expect.objectContaining({ question_id: mismatchedTextQuestionId }),
    );

    const count = await appHandle.pool.query<{ count: string }>(
      'select survey.read_result_response_count($1::uuid, $2::uuid) as count',
      [workspaceId, surveyId],
    );
    expect(count.rows).toEqual([{ count: '3' }]);
  });

  it('returns no aggregate data when the workspace does not own the survey', async () => {
    const aggregates = await appHandle.pool.query<AggregateRow>(
      'select * from survey.read_result_aggregates($1::uuid, $2::uuid)',
      [mismatchedWorkspaceId, surveyId],
    );
    expect(aggregates.rows).toEqual([]);
    const count = await appHandle.pool.query<{ count: string }>(
      'select survey.read_result_response_count($1::uuid, $2::uuid) as count',
      [mismatchedWorkspaceId, surveyId],
    );
    expect(count.rows).toEqual([{ count: '0' }]);
  });

  it('pins the aggregate-only SECURITY DEFINER interface and least-privilege owner', async () => {
    const { rows } = await migrateHandle.pool.query<{
      proname: string;
      owner: string;
      prosecdef: boolean;
      proconfig: string[] | null;
      provolatile: string;
      public_execute: boolean;
      app_execute: boolean;
      rolcanlogin: boolean;
      rolinherit: boolean;
      schema_create: boolean;
      schema_usage: boolean;
      core_schema_usage: boolean;
      execute_principals: string[];
    }>(
      `select p.proname, owner_role.rolname as owner, p.prosecdef, p.proconfig, p.provolatile,
              pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
              pg_catalog.has_function_privilege('fops_app', p.oid, 'EXECUTE') as app_execute,
              aggregate_owner.rolcanlogin, aggregate_owner.rolinherit,
              pg_catalog.has_schema_privilege('fops_survey_aggregate_owner', 'survey', 'CREATE') as schema_create,
              pg_catalog.has_schema_privilege('fops_survey_aggregate_owner', 'survey', 'USAGE') as schema_usage,
              pg_catalog.has_schema_privilege('fops_survey_aggregate_owner', 'core', 'USAGE') as core_schema_usage,
              coalesce((
                select array_agg(privilege_principal order by privilege_principal)
                  from (
                    select owner_role.rolname::text as privilege_principal
                    union
                    select coalesce(grantee.rolname::text, 'PUBLIC') as privilege_principal
                      from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
                      left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
                     where acl.privilege_type = 'EXECUTE'
                  ) execute_acl
              ), '{}'::text[]) as execute_principals
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
         join pg_catalog.pg_roles aggregate_owner on aggregate_owner.rolname = 'fops_survey_aggregate_owner'
        where n.nspname = 'survey'
          and p.proname in (
            'count_negative_outcome_without_followup',
            'read_result_aggregates',
            'read_result_response_count'
          )
        order by p.proname`,
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.owner).toBe('fops_survey_aggregate_owner');
      expect(row.prosecdef).toBe(true);
      expect(row.proconfig).toContain('search_path=pg_catalog');
      expect(row.provolatile).toBe('s');
      expect(row.public_execute).toBe(false);
      expect(row.app_execute).toBe(true);
      expect(row.rolcanlogin).toBe(false);
      expect(row.rolinherit).toBe(false);
      expect(row.schema_create).toBe(false);
      expect(row.schema_usage).toBe(true);
      expect(row.core_schema_usage).toBe(true);
      expect(row.execute_principals).toEqual(['fops_app', 'fops_survey_aggregate_owner']);
    }

    const columnPrivileges = await migrateHandle.pool.query<{ privilege: string }>(
      `select table_name || '.' || column_name || '.' || privilege_type as privilege
         from information_schema.column_privileges
        where grantee = 'fops_survey_aggregate_owner'
          and table_schema = 'survey'
        order by table_name, column_name, privilege_type`,
    );
    expect(columnPrivileges.rows.map((row) => row.privilege)).toEqual([
      'survey_questions.id.SELECT',
      'survey_questions.kind.SELECT',
      'survey_questions.rating_min.SELECT',
      'survey_questions.survey_id.SELECT',
      'survey_questions.workspace_id.SELECT',
      'survey_response_answers.answer_kind.SELECT',
      'survey_response_answers.answer_value.SELECT',
      'survey_response_answers.question_id.SELECT',
      'survey_response_answers.response_id.SELECT',
      'survey_response_answers.survey_id.SELECT',
      'survey_response_answers.workspace_id.SELECT',
      'survey_responses.id.SELECT',
      'survey_responses.survey_id.SELECT',
      'survey_responses.workspace_id.SELECT',
      'surveys.id.SELECT',
      'surveys.primary_managed_system_id.SELECT',
      'surveys.type.SELECT',
      'surveys.workspace_id.SELECT',
    ]);

    const linkColumnPrivileges = await migrateHandle.pool.query<{ privilege: string }>(
      `select table_name || '.' || column_name || '.' || privilege_type as privilege
         from information_schema.column_privileges
        where grantee = 'fops_survey_aggregate_owner'
          and table_schema = 'core'
          and table_name = 'entity_links'
        order by table_name, column_name, privilege_type`,
    );
    expect(linkColumnPrivileges.rows.map((row) => row.privilege)).toEqual([
      'entity_links.source_id.SELECT',
      'entity_links.source_type.SELECT',
      'entity_links.status.SELECT',
      'entity_links.target_type.SELECT',
      'entity_links.workspace_id.SELECT',
    ]);

    const tablePrivileges = await migrateHandle.pool.query<{
      table_schema: string;
      table_name: string;
      privilege_type: string;
    }>(
      `select table_schema, table_name, privilege_type
         from information_schema.table_privileges
        where grantee = 'fops_survey_aggregate_owner'
        order by table_schema, table_name, privilege_type`,
    );
    expect(tablePrivileges.rows).toEqual([]);

    const membership = await migrateHandle.pool.query<{
      migrate_is_owner_member: boolean;
      owner_is_migrate_member: boolean;
    }>(
      `select pg_catalog.pg_has_role('fops_migrate', 'fops_survey_aggregate_owner', 'MEMBER') as migrate_is_owner_member,
              pg_catalog.pg_has_role('fops_survey_aggregate_owner', 'fops_migrate', 'MEMBER') as owner_is_migrate_member`,
    );
    expect(membership.rows).toEqual([{ migrate_is_owner_member: true, owner_is_migrate_member: false }]);
  });
});
