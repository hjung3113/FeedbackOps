// #510 part B (ADR-0055): DB-level verification of the outcome follow-up
// classifier and the replaced gap predicate.
//
// 1. Band parity: survey.rating_band_for_value must reproduce
//    getRatingBandForValue over every legal (min, max, value) combination —
//    the SQL low band is the classification input, so drift here changes who
//    is poor.
// 2. Count matrix: survey.count_negative_outcome_without_followup, called
//    directly as fops_app, implements decisions 1-6 (low band, closed outcome
//    surveys only, anonymity threshold, generated_finding + current Finding
//    status, current no_follow_up decision).
//
// All seeding and teardown run through the migrate handle; the functions
// under test are called through the app handle so EXECUTE for fops_app is
// itself part of the proof.
import { randomUUID } from 'node:crypto';

import { getRatingBandForValue } from '@fops/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

const TEST_PREFIX = `outcome-gap-${randomUUID()}`;

function expectValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing`);
  return value;
}

function requiredId(row: { id: string } | undefined, label: string): string {
  if (!row?.id) throw new Error(`${label} insert returned no id`);
  return row.id;
}

async function countGaps(
  appHandle: DbHandle,
  workspaceId: string,
  managedSystemIds: string[] | null,
): Promise<number> {
  const { rows } = await appHandle.pool.query<{ count: string }>(
    'select survey.count_negative_outcome_without_followup($1::uuid, $2::uuid[])::text as count',
    [workspaceId, managedSystemIds],
  );
  return Number(rows[0]?.count ?? 0);
}

describe.skipIf(!runIntegration)('Outcome follow-up gap predicate (0052, ADR-0055)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  const workspaceId = randomUUID();
  const managedSystemIds: string[] = [];
  const surveyIds: string[] = [];
  const responseIds: string[] = [];
  const findingIds: string[] = [];
  const actorIds: string[] = [];
  // scenario name -> managed system id
  const scenarios = new Map<string, string>();
  const counting = [
    'counts',
    'finding_not_actionable',
    'finding_archived',
    'evidence_of_only',
    'reopened',
  ];
  let respondentIds: string[] = [];

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      workspaceId,
      'Outcome follow-up gap test',
    ]);
    // No workspace_settings row: the classifier must fall back to the
    // ADR-0033 default threshold of 5, like the TypeScript resolver does.
    for (const label of ['first', 'second', 'third', 'fourth', 'fifth']) {
      const actor = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.actors (workspace_id, external_id, email, display_name, role_level)
         values ($1, $2, $3, $4, 'user') returning id`,
        [
          workspaceId,
          `${TEST_PREFIX}-respondent-${label}`,
          `${TEST_PREFIX}-${label}@local`,
          `Outcome Gap ${label}`,
        ],
      );
      actorIds.push(requiredId(actor.rows[0], `${label} respondent`));
    }
    respondentIds = [...actorIds];

    const seedScenario = async (name: string) => {
      const ms = await migrateHandle.pool.query<{ id: string }>(
        'insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id',
        [workspaceId, `${TEST_PREFIX}-${name}`, `Outcome Gap ${name}`],
      );
      const msId = requiredId(ms.rows[0], `${name} managed system`);
      managedSystemIds.push(msId);
      scenarios.set(name, msId);
      return msId;
    };

    const seedSurveyWithResponses = async (
      name: string,
      survey: { type: 'outcome' | 'discovery'; status: 'draft' | 'open' | 'closed' },
      ratings: number[],
    ) => {
      const msId = await seedScenario(name);
      const surveyRow = await migrateHandle.pool.query<{ id: string }>(
        `insert into survey.surveys (
           workspace_id, display_id, type, status, title, primary_managed_system_id,
           operator_actor_id, created_by, opened_at, closed_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9) returning id`,
        [
          workspaceId,
          `SRV-gap-${name}-${randomUUID()}`,
          survey.type,
          survey.status,
          `Outcome gap ${name}`,
          msId,
          respondentIds[0],
          survey.status === 'draft' ? null : new Date(),
          survey.status === 'closed' ? new Date() : null,
        ],
      );
      const surveyId = requiredId(surveyRow.rows[0], `${name} survey`);
      surveyIds.push(surveyId);
      const question = await migrateHandle.pool.query<{ id: string }>(
        `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt, rating_min, rating_max, sort_order, branch_depth)
         values ($1, $2, 'rating', 'Outcome', 1, 5, 0, 0) returning id`,
        [workspaceId, surveyId],
      );
      const questionId = requiredId(question.rows[0], `${name} question`);
      let subjectResponseId = '';
      // ratings[0] is the scenario subject; 1-5 low band is 1-2 (1 low, 3-4 mid, 5 high).
      for (const [index, rating] of ratings.entries()) {
        const response = await migrateHandle.pool.query<{ id: string }>(
          `insert into survey.survey_responses (workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at)
           values ($1, $2, $3, true, now()) returning id`,
          [workspaceId, surveyId, respondentIds[index]],
        );
        const responseId = requiredId(response.rows[0], `${name} response ${index}`);
        if (index === 0) {
          subjectResponseId = responseId;
          responseIds.push(responseId);
        }
        await migrateHandle.pool.query(
          `insert into survey.survey_response_answers (workspace_id, survey_id, response_id, question_id, answer_kind, answer_value)
           values ($1, $2, $3, $4, 'rating', $5::jsonb)`,
          [workspaceId, surveyId, responseId, questionId, JSON.stringify(rating)],
        );
      }
      return { msId, surveyId, subjectResponseId };
    };

    const seedFinding = async (msId: string, status: string, responseId: string) => {
      const finding = await migrateHandle.pool.query<{ id: string }>(
        `insert into finding.findings (
           workspace_id, display_id, primary_managed_system_id, title, summary,
           source_type, source_id, severity, status, created_by
         ) values ($1, core.next_display_id($1::uuid, 'finding'), $2, 'Gap finding', 'Gap finding summary',
           'survey_response', $3, 'medium', $4, $5) returning id`,
        [workspaceId, msId, responseId, status, expectValue(respondentIds[0], 'first respondent')],
      );
      const findingId = requiredId(finding.rows[0], `${status} finding`);
      findingIds.push(findingId);
      return findingId;
    };

    const seedLink = async (
      msId: string,
      responseId: string,
      findingId: string,
      relationType: 'generated_finding' | 'evidence_of',
    ) => {
      await migrateHandle.pool.query(
        `insert into core.entity_links (
           workspace_id, source_type, source_id, target_type, target_id, relation_type,
           visibility, status, managed_system_id, created_by
         ) values ($1, 'survey_response', $2, 'finding', $3, $4, 'internal_only', 'active', $5, $6)`,
        [workspaceId, responseId, findingId, relationType, msId, respondentIds[0]],
      );
    };

    // Counts: closed outcome survey, cohort 5 (= default threshold), subject 2 (low band).
    await seedSurveyWithResponses('counts', { type: 'outcome', status: 'closed' }, [2, 5, 5, 5, 5]);
    // Not counted: open survey.
    await seedSurveyWithResponses('open', { type: 'outcome', status: 'open' }, [1, 5, 5, 5, 5]);
    // Not counted: draft survey (responses exist only because SQL seeding bypasses the API).
    await seedSurveyWithResponses('draft', { type: 'outcome', status: 'draft' }, [1, 5, 5, 5, 5]);
    // Not counted: cohort 4 is below the default threshold of 5.
    await seedSurveyWithResponses(
      'below_threshold',
      { type: 'outcome', status: 'closed' },
      [2, 5, 5, 5],
    );
    // Not counted: mid/high band answers only.
    await seedSurveyWithResponses(
      'mid_high_only',
      { type: 'outcome', status: 'closed' },
      [3, 4, 5, 5, 5],
    );
    // Not counted: non-outcome survey.
    await seedSurveyWithResponses(
      'non_outcome',
      { type: 'discovery', status: 'closed' },
      [1, 5, 5, 5, 5],
    );

    // Resolved: active generated_finding link to a draft/active/converted Finding.
    for (const status of ['draft', 'active', 'converted'] as const) {
      const seeded = await seedSurveyWithResponses(
        `finding_${status}`,
        { type: 'outcome', status: 'closed' },
        [2, 5, 5, 5, 5],
      );
      await seedLink(
        seeded.msId,
        seeded.subjectResponseId,
        await seedFinding(seeded.msId, status, seeded.subjectResponseId),
        'generated_finding',
      );
    }
    // Resolved: current no_follow_up decision.
    {
      const seeded = await seedSurveyWithResponses(
        'decision',
        { type: 'outcome', status: 'closed' },
        [2, 5, 5, 5, 5],
      );
      await migrateHandle.pool.query(
        `insert into survey.outcome_follow_up_decisions (
           workspace_id, survey_id, response_id, managed_system_id, state, reason, decided_by_actor_id
         ) values ($1, $2, $3, $4, 'no_follow_up', 'handled', $5)`,
        [workspaceId, seeded.surveyId, seeded.subjectResponseId, seeded.msId, respondentIds[0]],
      );
    }
    // Counts again: link target not_actionable.
    {
      const seeded = await seedSurveyWithResponses(
        'finding_not_actionable',
        { type: 'outcome', status: 'closed' },
        [2, 5, 5, 5, 5],
      );
      await seedLink(
        seeded.msId,
        seeded.subjectResponseId,
        await seedFinding(seeded.msId, 'not_actionable', seeded.subjectResponseId),
        'generated_finding',
      );
    }
    // Counts again: link target archived.
    {
      const seeded = await seedSurveyWithResponses(
        'finding_archived',
        { type: 'outcome', status: 'closed' },
        [2, 5, 5, 5, 5],
      );
      await seedLink(
        seeded.msId,
        seeded.subjectResponseId,
        await seedFinding(seeded.msId, 'archived', seeded.subjectResponseId),
        'generated_finding',
      );
    }
    // Counts again: only an evidence_of link — context enrichment is not follow-up.
    {
      const seeded = await seedSurveyWithResponses(
        'evidence_of_only',
        { type: 'outcome', status: 'closed' },
        [2, 5, 5, 5, 5],
      );
      await seedLink(
        seeded.msId,
        seeded.subjectResponseId,
        await seedFinding(seeded.msId, 'draft', seeded.subjectResponseId),
        'evidence_of',
      );
    }
    // Counts again: decision superseded by reopen.
    {
      const seeded = await seedSurveyWithResponses(
        'reopened',
        { type: 'outcome', status: 'closed' },
        [2, 5, 5, 5, 5],
      );
      await migrateHandle.pool.query(
        `insert into survey.outcome_follow_up_decisions (
           workspace_id, survey_id, response_id, managed_system_id, state, reason, decided_by_actor_id
         ) values ($1, $2, $3, $4, 'reopened', 'reopened for finding follow-up', $5)`,
        [workspaceId, seeded.surveyId, seeded.subjectResponseId, seeded.msId, respondentIds[0]],
      );
    }
  });

  afterAll(async () => {
    if (!migrateHandle) return;
    await migrateHandle.pool.query(
      'delete from survey.outcome_follow_up_decisions where response_id = any($1::uuid[]) or decided_by_actor_id = any($2::uuid[])',
      [responseIds, actorIds],
    );
    await migrateHandle.pool.query(
      "delete from core.entity_links where workspace_id = $1 and ((source_type = 'survey_response' and source_id = any($2::uuid[])) or (target_type = 'finding' and target_id = any($3::uuid[])))",
      [workspaceId, responseIds, findingIds],
    );
    await migrateHandle.pool.query('delete from finding.findings where id = any($1::uuid[])', [
      findingIds,
    ]);
    await migrateHandle.pool.query(
      'delete from survey.survey_response_answers where workspace_id = $1',
      [workspaceId],
    );
    await migrateHandle.pool.query('delete from survey.survey_responses where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle.pool.query('delete from survey.survey_questions where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle.pool.query('delete from survey.surveys where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle.pool.query('delete from core.display_counters where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle.pool.query('delete from core.managed_systems where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle.pool.query('delete from core.actors where workspace_id = $1', [
      workspaceId,
    ]);
    await migrateHandle.pool.query('delete from core.workspaces where id = $1', [workspaceId]);
    await appHandle?.close();
    await migrateHandle.close();
  });

  it('rating_band_for_value matches getRatingBandForValue for every legal domain and value', async () => {
    for (let min = 0; min < 10; min += 1) {
      for (let max = min + 1; max <= 10; max += 1) {
        for (let value = min; value <= max; value += 1) {
          const { rows } = await appHandle.pool.query<{ band: string }>(
            'select survey.rating_band_for_value($1::integer, $2::integer, $3::integer) as band',
            [min, max, value],
          );
          expect(rows[0]?.band, `min=${min} max=${max} value=${value}`).toBe(
            getRatingBandForValue(min, max, value),
          );
        }
      }
    }
  });

  it('counts a low-band response in a closed outcome survey at the threshold', async () => {
    await expect(
      countGaps(appHandle, workspaceId, [expectValue(scenarios.get('counts'), 'counts scenario')]),
    ).resolves.toBe(1);
  });

  it.each([
    'open',
    'draft',
    'below_threshold',
    'mid_high_only',
    'non_outcome',
    'finding_draft',
    'finding_active',
    'finding_converted',
    'decision',
  ] as const)('does not count the %s scenario', async (scenario) => {
    await expect(
      countGaps(appHandle, workspaceId, [
        expectValue(scenarios.get(scenario), `${scenario} scenario`),
      ]),
    ).resolves.toBe(0);
  });

  it.each(['finding_not_actionable', 'finding_archived', 'evidence_of_only', 'reopened'] as const)(
    'counts the %s scenario again',
    async (scenario) => {
      await expect(
        countGaps(appHandle, workspaceId, [
          expectValue(scenarios.get(scenario), `${scenario} scenario`),
        ]),
      ).resolves.toBe(1);
    },
  );

  it('counts 5 responses workspace-wide and 0 for an unknown managed system filter', async () => {
    await expect(countGaps(appHandle, workspaceId, null)).resolves.toBe(counting.length);
    await expect(countGaps(appHandle, workspaceId, [randomUUID()])).resolves.toBe(0);
  });
});
