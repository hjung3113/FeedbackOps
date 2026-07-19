import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(MIGRATE_URL);

function requiredId(row: { id: string } | undefined, label: string): string {
  if (!row?.id) throw new Error(`${label} insert returned no id`);
  return row.id;
}

describe.skipIf(!runIntegration)('Survey response submission migration 0037', () => {
  let migrateHandle: DbHandle;
  const workspaceId = randomUUID();
  const actorIds: string[] = [];
  let managedSystemId: string;

  beforeAll(async () => {
    migrateHandle = createDb(MIGRATE_URL);
    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      workspaceId,
      'Survey response submission test',
    ]);

    for (const label of ['first', 'second', 'third']) {
      const actor = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.actors (workspace_id, external_id, email, display_name, role_level)
         values ($1, $2, $3, $4, 'admin') returning id`,
        [
          workspaceId,
          `survey-response-${label}-${workspaceId}`,
          `survey-response-${label}-${workspaceId}@local`,
          `Survey Response ${label} Actor`,
        ],
      );
      actorIds.push(requiredId(actor.rows[0], `${label} actor`));
    }

    const managedSystem = await migrateHandle.pool.query<{ id: string }>(
      'insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id',
      [workspaceId, `survey-response-${workspaceId}`, 'Survey Response Test System'],
    );
    managedSystemId = requiredId(managedSystem.rows[0], 'managed system');
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
    await migrateHandle?.close();
  });

  async function insertSurvey(displayId = `SRV-response-${randomUUID()}`): Promise<string> {
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (
         workspace_id, display_id, type, title, primary_managed_system_id, operator_actor_id, created_by
       ) values ($1, $2, 'discovery', 'Survey response test', $3, $4, $4) returning id`,
      [workspaceId, displayId, managedSystemId, actorIds[0]],
    );
    return requiredId(result.rows[0], 'survey');
  }

  it('creates the exact unique survey respondent index', async () => {
    const { rows } = await migrateHandle.pool.query<{
      indexName: string;
      columns: string[];
    }>(
      `select index_class.relname as "indexName", array_agg(attribute.attname::text order by key_column.ordinality) as columns
         from pg_class index_class
         join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
         join pg_index index_definition on index_definition.indexrelid = index_class.oid
         join unnest(index_definition.indkey) with ordinality as key_column(attnum, ordinality) on true
         join pg_attribute attribute
           on attribute.attrelid = index_definition.indrelid and attribute.attnum = key_column.attnum
        where index_namespace.nspname = 'survey'
          and index_class.relname = 'survey_responses_survey_respondent_actor_uq'
          and index_definition.indisunique
        group by index_class.relname`,
    );

    expect(rows).toEqual([
      {
        indexName: 'survey_responses_survey_respondent_actor_uq',
        columns: ['survey_id', 'respondent_actor_id'],
      },
    ]);
  });

  it('grants only INSERT to fops_app on response submission tables', async () => {
    for (const tableName of ['survey_responses', 'survey_response_answers']) {
      const { rows } = await migrateHandle.pool.query<{
        canInsert: boolean;
        canSelect: boolean;
        canUpdate: boolean;
        canDelete: boolean;
      }>(
        `select
           has_table_privilege('fops_app', format('survey.%I', $1::text), 'INSERT') as "canInsert",
           has_table_privilege('fops_app', format('survey.%I', $1::text), 'SELECT') as "canSelect",
           has_table_privilege('fops_app', format('survey.%I', $1::text), 'UPDATE') as "canUpdate",
           has_table_privilege('fops_app', format('survey.%I', $1::text), 'DELETE') as "canDelete"`,
        [tableName],
      );
      const privileges = rows[0];
      expect(privileges?.canInsert, `${tableName} INSERT`).toBe(true);
      expect(privileges?.canSelect, `${tableName} SELECT`).toBe(false);
      expect(privileges?.canUpdate, `${tableName} UPDATE`).toBe(false);
      expect(privileges?.canDelete, `${tableName} DELETE`).toBe(false);
    }
  });

  it('allows one response per survey respondent while accepting distinct respondents', async () => {
    const surveyId = await insertSurvey();
    const firstActorId = actorIds[0];
    const secondActorId = actorIds[1];
    const thirdActorId = actorIds[2];
    if (!firstActorId || !secondActorId || !thirdActorId)
      throw new Error('response actors were not created');
    const insertResponse = (respondentActorId: string) =>
      migrateHandle.pool.query(
        `insert into survey.survey_responses (
           workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at
         ) values ($1, $2, $3, false, now())`,
        [workspaceId, surveyId, respondentActorId],
      );

    await insertResponse(firstActorId);
    await expect(insertResponse(firstActorId)).rejects.toMatchObject({ code: '23505' });
    await expect(insertResponse(secondActorId)).resolves.toBeDefined();
    await expect(insertResponse(thirdActorId)).resolves.toBeDefined();
  });
});
