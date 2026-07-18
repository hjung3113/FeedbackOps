import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';

function requiredId(row: { id: string } | undefined, label: string): string {
  if (!row?.id) throw new Error(`${label} insert returned no id`);
  return row.id;
}

describe('Survey foundation migration 0036', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  const workspaceId = randomUUID();
  let actorId: string;
  let managedSystemId: string;

  beforeAll(async () => {
    if (!APP_URL || !MIGRATE_URL)
      throw new Error('DATABASE_URL and DATABASE_URL_MIGRATE are required');
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      workspaceId,
      'Survey foundation test',
    ]);
    const actor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level)
       values ($1, $2, $3, $4, 'admin') returning id`,
      [
        workspaceId,
        `survey-test-${workspaceId}`,
        `survey-test-${workspaceId}@local`,
        'Survey Test Actor',
      ],
    );
    actorId = requiredId(actor.rows[0], 'actor');
    const system = await migrateHandle.pool.query<{ id: string }>(
      'insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id',
      [workspaceId, `survey-${workspaceId}`, 'Survey Test System'],
    );
    managedSystemId = requiredId(system.rows[0], 'managed system');
  });

  afterAll(async () => {
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
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function insertSurvey(displayId = `SRV-test-${randomUUID()}`): Promise<string> {
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id, display_id, type, title, primary_managed_system_id, operator_actor_id, created_by)
       values ($1, $2, 'discovery', 'Survey test', $3, $4, $4) returning id`,
      [workspaceId, displayId, managedSystemId, actorId],
    );
    return requiredId(result.rows[0], 'survey');
  }

  it('creates all Survey tables', async () => {
    const { rows } = await migrateHandle.pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'survey' order by table_name`,
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      'survey_questions',
      'survey_response_answers',
      'survey_responses',
      'surveys',
    ]);
  });

  it('rejects draft lifecycle timestamps and duplicate workspace display IDs', async () => {
    await expect(
      migrateHandle.pool.query(
        `insert into survey.surveys (workspace_id, display_id, type, title, primary_managed_system_id, operator_actor_id, created_by, opened_at)
       values ($1, 'SRV-invalid-draft', 'discovery', 'Invalid', $2, $3, $3, now())`,
        [workspaceId, managedSystemId, actorId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await insertSurvey('SRV-duplicate');
    await expect(insertSurvey('SRV-duplicate')).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects a branch of a branch through the depth-qualified parent FK', async () => {
    const surveyId = await insertSurvey();
    const parent = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, sort_order)
       values ($1, $2, 'single_choice', 'Parent', 0) returning id`,
      [workspaceId, surveyId],
    );
    const child = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, sort_order, branch_depth, branch_parent_question_id, branch_parent_depth, branch_trigger_option_key)
       values ($1, $2, 'text', 'Child', 1, 1, $3, 0, 'yes') returning id`,
      [workspaceId, surveyId, requiredId(parent.rows[0], 'parent question')],
    );
    await expect(
      migrateHandle.pool.query(
        `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, sort_order, branch_depth, branch_parent_question_id, branch_parent_depth, branch_trigger_option_key)
       values ($1, $2, 'text', 'Impossible grandchild', 2, 1, $3, 0, 'yes')`,
        [workspaceId, surveyId, requiredId(child.rows[0], 'child question')],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects answers whose response or question belongs to another Survey', async () => {
    const surveyA = await insertSurvey();
    const surveyB = await insertSurvey();
    const question = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, sort_order)
       values ($1, $2, 'text', 'Question', 0) returning id`,
      [workspaceId, surveyA],
    );
    const response = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_responses (workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at)
       values ($1, $2, $3, false, now()) returning id`,
      [workspaceId, surveyB, actorId],
    );
    await expect(
      migrateHandle.pool.query(
        `insert into survey.survey_response_answers (workspace_id, survey_id, response_id, question_id, answer_kind, answer_value)
       values ($1, $2, $3, $4, 'text', '"answer"'::jsonb)`,
        [
          workspaceId,
          surveyA,
          requiredId(response.rows[0], 'response'),
          requiredId(question.rows[0], 'question'),
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    const questionInB = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, sort_order)
       values ($1, $2, 'text', 'Other Survey Question', 0) returning id`,
      [workspaceId, surveyB],
    );
    const responseInA = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_responses (workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at)
       values ($1, $2, $3, false, now()) returning id`,
      [workspaceId, surveyA, actorId],
    );
    await expect(
      migrateHandle.pool.query(
        `insert into survey.survey_response_answers (workspace_id, survey_id, response_id, question_id, answer_kind, answer_value)
       values ($1, $2, $3, $4, 'text', '"answer"'::jsonb)`,
        [
          workspaceId,
          surveyA,
          requiredId(responseInA.rows[0], 'Survey A response'),
          requiredId(questionInB.rows[0], 'Survey B question'),
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('allocates SRV IDs from 1000 and preserves every shared prefix', async () => {
    const expected: Record<string, string> = {
      task: 'TASK-',
      finding: 'FIN-',
      cluster: 'CLU-',
      task_request: 'REQ-',
      survey: 'SRV-',
    };
    for (const [entityType, prefix] of Object.entries(expected)) {
      const { rows } = await appHandle.pool.query<{ value: string }>(
        'select core.next_display_id($1::uuid, $2) as value',
        [workspaceId, entityType],
      );
      expect(rows[0]?.value).toBe(`${prefix}1000`);
    }
    const { rows } = await appHandle.pool.query<{ value: string }>(
      `select core.next_display_id($1::uuid, 'survey') as value`,
      [workspaceId],
    );
    expect(rows[0]?.value).toBe('SRV-1001');
  });
});
