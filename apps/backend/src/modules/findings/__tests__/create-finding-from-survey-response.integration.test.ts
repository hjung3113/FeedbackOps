import { waitForResponseEvidenceWaiters } from '../../../test-support/response-evidence-barrier.js';
// Route-level contract for the only permitted Survey Response -> Finding command.
// It deliberately uses the fops_app server path and the fops_migrate handle only
// for fixtures, observable persistence assertions, and deterministic cleanup.

import { randomUUID } from 'node:crypto';

import {
  entityLinkDtoSchema,
  evidenceHighlightDtoSchema,
  evidenceInventoryItemSchema,
  findingDtoSchema,
  listEvidenceInventoryResponseSchema,
  surveyResultDtoSchema,
} from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { createAa, insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { createSurveyFindingLink } from '../../entity-links/index.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG = 'it-survey-finding';
const RAW_ANSWER = 'Raw answer that must never leave the Survey boundary';
const APPROVED = 'Approved, redacted operational excerpt';

type Source = {
  msId: string;
  surveyId: string;
  questionId: string;
  responseId: string;
};

describe.skipIf(!runIntegration)('POST /survey-responses/:id/create-finding (#187 C4)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminId: string;
  let adminCookie: string;
  const foreignWorkspaceIds = new Set<string>();
  const teamIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const result = await migrateHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminId = result.rows[0]?.id ?? '';
    if (!adminId) throw new Error('mock admin fixture is missing');
  });

  beforeEach(async () => {
    await cleanup();
    await migrateHandle.pool.query('delete from core.rate_limits where key=$1', [
      `${WORKSPACE_ID}:${adminId}`,
    ]);
  });
  afterEach(async () => cleanup());
  afterAll(async () => {
    await cleanup();
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanup() {
    if (!migrateHandle) return;
    const systems = 'select id from core.managed_systems where workspace_id=$1 and slug like $2';
    const surveys = `select id from survey.surveys where workspace_id=$1 and primary_managed_system_id in (${systems})`;
    const responses = `select id from survey.survey_responses where survey_id in (${surveys})`;
    const approvals = `select id from survey.survey_response_excerpt_approvals where survey_id in (${surveys})`;
    const findings = `select id from finding.findings where workspace_id=$1 and primary_managed_system_id in (${systems})`;
    const links = `select id from core.entity_links where workspace_id=$1 and (source_id in (${responses}) or target_id in (${findings}))`;
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where workspace_id=$1
          and (subject_id in (${responses})
            or subject_id in (${findings})
            or subject_id in (${approvals})
            or subject_id in (${links})
            or actor_id in (select id from core.actors where workspace_id=$1 and external_id like 'mock-dev-read-' || $2))`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links where workspace_id=$1 and (source_id in (${responses}) or target_id in (${findings}))`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from finding.evidence_highlights where workspace_id=$1 and finding_id in (${findings})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(`delete from finding.findings where id in (${findings})`, [
      WORKSPACE_ID,
      `${SLUG}%`,
    ]);
    await migrateHandle.pool.query(
      `delete from survey.survey_response_excerpt_approvals where survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_response_answers where response_id in (${responses})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_responses where id in (${responses})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_questions where survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(`delete from survey.surveys where id in (${surveys})`, [
      WORKSPACE_ID,
      `${SLUG}%`,
    ]);
    await migrateHandle.pool.query(
      `delete from permission.permission_denies where workspace_id=$1 and managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_grants where workspace_id=$1 and managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits where key in (
         select workspace_id::text || ':' || id::text from core.actors
         where workspace_id=$1 and external_id like 'mock-dev-read-' || $2
       )`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      "delete from core.idempotency_keys where actor_id in (select id from core.actors where workspace_id=$1 and external_id like 'mock-dev-read-' || $2)",
      [WORKSPACE_ID, `${SLUG}-%`],
    );
    await migrateHandle.pool.query(
      "delete from core.sessions where actor_id in (select id from core.actors where workspace_id=$1 and external_id like 'mock-dev-read-' || $2)",
      [WORKSPACE_ID, `${SLUG}-%`],
    );
    await migrateHandle.pool.query(
      `update core.managed_systems set default_owner_actor_id=null,default_owner_team_id=null where id in (${systems})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      "delete from core.actors where workspace_id=$1 and external_id like 'mock-dev-read-' || $2",
      [WORKSPACE_ID, `${SLUG}-%`],
    );
    await migrateHandle.pool.query(
      `delete from core.responsibility_default_failures where managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.analytics_areas where managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(`delete from core.managed_systems where id in (${systems})`, [
      WORKSPACE_ID,
      `${SLUG}%`,
    ]);
    await migrateHandle.pool.query('delete from core.teams where id=any($1::uuid[])', [teamIds]);
    teamIds.length = 0;
    for (const workspaceId of foreignWorkspaceIds) {
      await migrateHandle.pool.query('delete from core.audit_log where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.entity_links where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query(
        'delete from survey.survey_response_answers where workspace_id=$1',
        [workspaceId],
      );
      await migrateHandle.pool.query('delete from survey.survey_responses where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from survey.survey_questions where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from survey.surveys where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.actors where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query(
        'delete from core.responsibility_default_failures where workspace_id=$1',
        [workspaceId],
      );
      await migrateHandle.pool.query('delete from core.managed_systems where workspace_id=$1', [
        workspaceId,
      ]);
      await migrateHandle.pool.query('delete from core.workspaces where id=$1', [workspaceId]);
    }
    foreignWorkspaceIds.clear();
  }

  async function actor() {
    const seeded = await insertDevActor(migrateHandle, WORKSPACE_ID, `${SLUG}-${randomUUID()}`);
    return { ...seeded, cookie: await loginAs(app, seeded.externalId) };
  }
  async function grant(actorId: string, capability: string, msId: string) {
    await grantCapability(migrateHandle, WORKSPACE_ID, actorId, capability, msId, adminId);
  }
  async function seed(
    status: 'draft' | 'open' = 'open',
    identityProtected = true,
  ): Promise<Source> {
    const msId = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      uid(SLUG),
      'Survey Finding MS',
    );
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at)
       values ($1,$2,'outcome',$3,'Private survey',$4,$5,$6,$5,case when $3='open' then now() else null end) returning id`,
      [WORKSPACE_ID, `S-${randomUUID()}`, status, msId, adminId, identityProtected],
    );
    const surveyId = survey.rows[0]?.id ?? '';
    const question = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,sort_order,branch_depth)
       values ($1,$2,'text','What needs improvement?',true,0,0) returning id`,
      [WORKSPACE_ID, surveyId],
    );
    const questionId = question.rows[0]?.id ?? '';
    const response = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_responses (workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at)
       values ($1,$2,$3,$4,now()) returning id`,
      [WORKSPACE_ID, surveyId, adminId, identityProtected],
    );
    const responseId = response.rows[0]?.id ?? '';
    await migrateHandle.pool.query(
      `insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value)
       values ($1,$2,$3,$4,'text',$5::jsonb)`,
      [WORKSPACE_ID, surveyId, responseId, questionId, JSON.stringify(RAW_ANSWER)],
    );
    return { msId, surveyId, questionId, responseId };
  }
  async function seedSuppressedRatingAggregate(source: Source): Promise<string> {
    const question = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_questions (
         workspace_id,survey_id,kind,prompt,is_required,rating_min,rating_max,sort_order,branch_depth
       ) values ($1,$2,'rating','How would you rate this?',false,1,5,1,0) returning id`,
      [WORKSPACE_ID, source.surveyId],
    );
    const questionId = question.rows[0]?.id ?? '';
    if (!questionId) throw new Error('rating question seed failed');
    await migrateHandle.pool.query(
      `insert into survey.survey_response_answers (
         workspace_id,survey_id,response_id,question_id,answer_kind,answer_value
       ) values ($1,$2,$3,$4,'rating','1'::jsonb)`,
      [WORKSPACE_ID, source.surveyId, source.responseId, questionId],
    );
    for (let index = 0; index < 4; index += 1) {
      const respondent = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.actors (
           workspace_id,external_id,email,display_name,role_level,actor_type
         ) values ($1,$2,$3,'Suppressed aggregate respondent','user','internal_member') returning id`,
        [
          WORKSPACE_ID,
          `${SLUG}-suppressed-${randomUUID()}`,
          `${SLUG}-suppressed-${randomUUID()}@example.test`,
        ],
      );
      const response = await migrateHandle.pool.query<{ id: string }>(
        `insert into survey.survey_responses (
           workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at
         ) values ($1,$2,$3,true,now()) returning id`,
        [WORKSPACE_ID, source.surveyId, respondent.rows[0]?.id],
      );
      await migrateHandle.pool.query(
        `insert into survey.survey_response_answers (
           workspace_id,survey_id,response_id,question_id,answer_kind,answer_value
         ) values ($1,$2,$3,$4,'rating','3'::jsonb)`,
        [WORKSPACE_ID, source.surveyId, response.rows[0]?.id, questionId],
      );
    }
    return questionId;
  }
  async function approve(source: Source, cookie: string, text = APPROVED): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/survey-responses/${source.responseId}/approved-excerpts`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
      payload: { question_id: source.questionId, redacted_excerpt: text },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ approved_excerpt_id: string }>().approved_excerpt_id;
  }
  function post(cookie: string, responseId: string, body: object, key = randomUUID()) {
    return app.inject({
      method: 'POST',
      url: `/survey-responses/${responseId}/create-finding`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: body,
    });
  }
  async function counts(responseId: string) {
    const result = await migrateHandle.pool.query<{
      findings: string;
      links: string;
      highlights: string;
      audits: string;
    }>(
      `select
         (select count(*) from survey.finding_response_bindings where response_id=$1::uuid)::text as findings,
         (select count(*) from core.entity_links where source_type='survey_response' and source_id=$1::uuid)::text as links,
         (select count(*) from survey.highlight_response_bindings where response_id=$1::uuid)::text as highlights,
         (select count(*) from core.audit_log where detail->>'source_survey_response_id'=$1::text)::text as audits`,
      [responseId],
    );
    const row = result.rows[0];
    return {
      findings: Number(row?.findings ?? 0),
      links: Number(row?.links ?? 0),
      highlights: Number(row?.highlights ?? 0),
      audits: Number(row?.audits ?? 0),
    };
  }
  async function seedForeignResponse() {
    const workspaceId = randomUUID();
    foreignWorkspaceIds.add(workspaceId);
    await migrateHandle.pool.query('insert into core.workspaces (id,name) values ($1,$2)', [
      workspaceId,
      `${SLUG} foreign`,
    ]);
    const foreignActor = await migrateHandle.pool.query<{ id: string }>(
      "insert into core.actors (workspace_id,external_id,email,display_name,role_level,actor_type) values ($1,$2,$3,'Foreign','admin','internal_member') returning id",
      [workspaceId, `${SLUG}-${workspaceId}`, `${workspaceId}@example.test`],
    );
    const msId = await insertMsDirectly(
      migrateHandle,
      workspaceId,
      uid(`${SLUG}-foreign`),
      'Foreign MS',
    );
    const survey = await migrateHandle.pool.query<{ id: string }>(
      "insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at) values ($1,$2,'outcome','open','Foreign',$3,$4,true,$4,now()) returning id",
      [workspaceId, `S-${randomUUID()}`, msId, foreignActor.rows[0]?.id],
    );
    const response = await migrateHandle.pool.query<{ id: string }>(
      'insert into survey.survey_responses (workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at) values ($1,$2,$3,true,now()) returning id',
      [workspaceId, survey.rows[0]?.id, foreignActor.rows[0]?.id],
    );
    return response.rows[0]?.id ?? '';
  }

  it('Survey mutation returns only a local ID/outcome and preserves canonical replay history', async () => {
    const source = await seed();
    const creator = await actor();
    for (const permission of ['survey.read', 'survey.read_personal_responses', 'finding.manage'])
      await grant(creator.id, permission, source.msId);
    const created = await post(creator.cookie, source.responseId, {
      severity: 'medium',
      approved_excerpt_ids: [],
    });
    expect(created.statusCode).toBe(201);
    const findingId = created.json<{ id: string }>().id;
    const before = await counts(source.responseId);
    const result = await appHandle.db.transaction((tx) =>
      createSurveyFindingLink(tx, {
        workspaceId: WORKSPACE_ID,
        responseId: source.responseId,
        findingId,
        relationType: 'generated_finding',
        managedSystemId: source.msId,
        createdBy: creator.id,
      }),
    );
    expect(result).toEqual({ id: expect.any(String), inserted: false });
    expect(await counts(source.responseId)).toEqual(before);
    const canonical = await migrateHandle.pool.query(
      'select source_id, target_id, created_by from core.entity_links where id = $1',
      [result.id],
    );
    expect(canonical.rows).toEqual([
      {
        source_id: source.responseId,
        target_id: findingId,
        created_by: creator.id,
      },
    ]);
  });

  it('checks the complete personal source gate before disclosing invalid owner or target, with no diagnostic side effects', async () => {
    const source = await seed();
    const creator = await actor();
    await grant(creator.id, 'finding.manage', source.msId);
    const hidden = await post(creator.cookie, source.responseId, {
      severity: 'high',
      approved_excerpt_ids: [],
      primary_managed_system_id: randomUUID(),
      owner_actor_id: randomUUID(),
    });
    const missing = await post(creator.cookie, randomUUID(), {
      severity: 'high',
      approved_excerpt_ids: [],
      primary_managed_system_id: randomUUID(),
      owner_actor_id: randomUUID(),
    });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual(missing.json());
    expect(await counts(source.responseId)).toEqual({
      findings: 0,
      links: 0,
      highlights: 0,
      audits: 0,
    });
    expect(
      (
        await migrateHandle.pool.query(
          'select id from core.responsibility_default_failures where managed_system_id=$1',
          [source.msId],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it.each(['omitted', 'actor', 'team', 'aa', 'fallback', 'null', 'invalid'] as const)(
    'Survey responsibility %s preserves the approved-excerpt body and atomic replay',
    async (variant) => {
      const source = await seed();
      const creator = await actor();
      await grant(creator.id, 'survey.read', source.msId);
      await grant(creator.id, 'survey.read_personal_responses', source.msId);
      await grant(creator.id, 'survey.manage', source.msId);
      await grant(creator.id, 'finding.manage', source.msId);
      const approvedId = await approve(source, creator.cookie);
      await migrateHandle.pool.query(
        'update core.managed_systems set default_owner_actor_id=$1 where id=$2',
        [adminId, source.msId],
      );
      let teamId: string | undefined;
      let aaId: string | undefined;
      if (variant === 'team' || variant === 'aa') {
        const team = await migrateHandle.pool.query<{ id: string }>(
          'insert into core.teams (workspace_id,name) values ($1,$2) returning id',
          [WORKSPACE_ID, uid('Survey owner team')],
        );
        teamId = team.rows[0]?.id ?? '';
        teamIds.push(teamId);
        if (variant === 'aa') {
          aaId = await createAa(app, adminCookie, {
            managed_system_id: source.msId,
            slug: uid(SLUG),
            name: 'Survey Owner AA',
          });
          await migrateHandle.pool.query(
            'update core.analytics_areas set owner_team_id=$1 where id=$2',
            [teamId, aaId],
          );
        }
      }
      if (variant === 'aa' || variant === 'fallback')
        await migrateHandle.pool.query(
          'update core.managed_systems set default_owner_actor_id=null where id=$1',
          [source.msId],
        );
      const automatic = variant === 'omitted' || variant === 'aa' || variant === 'fallback';
      const rule =
        variant === 'omitted'
          ? 'managed_system_owner'
          : variant === 'aa'
            ? 'analytics_area_owner'
            : variant === 'fallback'
              ? 'workspace_fallback_queue'
              : 'explicit';
      const body = {
        severity: 'high',
        approved_excerpt_ids: [approvedId],
        ...(aaId ? { analytics_area_id: aaId } : {}),
        ...(automatic
          ? {}
          : variant === 'team'
            ? { owner_team_id: teamId }
            : {
                owner_actor_id:
                  variant === 'actor' ? adminId : variant === 'null' ? null : randomUUID(),
              }),
      };
      const key = randomUUID();
      const created = await post(creator.cookie, source.responseId, body, key);
      if (variant === 'invalid') {
        expect(created.statusCode).toBe(422);
        expect(await counts(source.responseId)).toEqual({
          findings: 0,
          links: 0,
          highlights: 0,
          audits: 0,
        });
      } else {
        expect(created.statusCode).toBe(201);
        expect(created.json()).toMatchObject({
          owner_actor_id:
            variant === 'null' || variant === 'team' || variant === 'aa' || variant === 'fallback'
              ? null
              : adminId,
          owner_team_id: variant === 'team' || variant === 'aa' ? teamId : null,
          default_resolved: variant === 'omitted' || variant === 'aa',
          source_rule: rule,
          source_type: 'survey_response',
        });
        expect(created.json().source_id).toBeUndefined();
        expect(JSON.stringify(created.json())).not.toContain(RAW_ANSWER);
        expect((await post(creator.cookie, source.responseId, body, key)).json()).toEqual(
          created.json(),
        );
        expect(await counts(source.responseId)).toEqual({
          findings: 1,
          links: 2,
          highlights: 1,
          audits: 1,
        });
        const audit = await migrateHandle.pool.query<{ detail: unknown }>(
          'select detail from core.audit_log where subject_id=$1 and event_type=$2',
          [created.json().id, 'finding_created_from_survey_response'],
        );
        expect(audit.rows).toHaveLength(1);
        expect(audit.rows[0]?.detail).toMatchObject({
          owner_actor_id:
            variant === 'null' || variant === 'team' || variant === 'aa' || variant === 'fallback'
              ? null
              : adminId,
          source_rule: rule,
        });
      }
      expect(
        (
          await migrateHandle.pool.query(
            'select id from core.responsibility_default_failures where managed_system_id=$1',
            [source.msId],
          )
        ).rows,
      ).toHaveLength(variant === 'aa' ? 1 : variant === 'fallback' ? 2 : 0);
    },
  );

  it('201 persists the Finding, generated_finding and evidence_of links, highlights, and exact audit counts', async () => {
    const source = await seed();
    const creator = await actor();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'survey.manage', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    const first = await approve(source, creator.cookie);
    const second = await approve(source, creator.cookie, 'Second approved excerpt');
    const response = await post(creator.cookie, source.responseId, {
      severity: 'high',
      confidence: 'medium',
      approved_excerpt_ids: [first, second],
    });
    expect(response.statusCode).toBe(201);
    const finding = response.json<{
      id: string;
      evidence_count: number;
      source_id?: string;
      source_type: string;
    }>();
    expect(finding).toMatchObject({ source_type: 'survey_response', evidence_count: 2 });
    expect(finding.source_id).toBeUndefined();
    const persisted = await migrateHandle.pool.query<{ relation_type: string; count: string }>(
      "select relation_type,count(*)::text as count from core.entity_links where target_id=$1 and status='active' group by relation_type order by relation_type",
      [finding.id],
    );
    expect(persisted.rows).toEqual([
      { relation_type: 'evidence_of', count: '1' },
      { relation_type: 'generated_finding', count: '1' },
    ]);
    expect(await counts(source.responseId)).toEqual({
      findings: 1,
      links: 2,
      highlights: 2,
      audits: 1,
    });
    const auditCounts = await migrateHandle.pool.query<{ event_type: string; count: string }>(
      `select event_type,count(*)::text as count
         from core.audit_log
        where subject_id=$1
           or subject_id in (select id from core.entity_links where target_id=$1)
        group by event_type order by event_type`,
      [finding.id],
    );
    expect(auditCounts.rows).toEqual([
      { event_type: 'entity_link.created', count: '2' },
      { event_type: 'evidence_highlight_added', count: '2' },
      { event_type: 'finding_created_from_survey_response', count: '1' },
    ]);
  });

  it('keeps metadata in public parents and exact provenance only behind migrate (#739)', async () => {
    const source = await seed();
    const creator = await actor();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'survey.manage', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    await grant(creator.id, 'finding.read', source.msId);
    const approval = await approve(source, creator.cookie);
    const created = await post(creator.cookie, source.responseId, {
      severity: 'medium',
      approved_excerpt_ids: [approval],
    });
    expect(created.statusCode).toBe(201);
    const finding = findingDtoSchema.parse(created.json());
    expect(finding.summary).toMatch(/^Survey response from outcome · /);
    expect(finding.summary).not.toContain(APPROVED);
    const publicRows = await appHandle.pool.query(
      `select f.source_id, h.source_id as highlight_source_id, h.approved_excerpt_id,
                h.quote_or_summary from finding.findings f
         join finding.evidence_highlights h on h.finding_id=f.id where f.id=$1`,
      [finding.id],
    );
    expect(publicRows.rows).toEqual([
      {
        source_id: null,
        highlight_source_id: null,
        approved_excerpt_id: null,
        quote_or_summary: null,
      },
    ]);
    const privateRows = await migrateHandle.pool.query(
      `select b.response_id, h.response_id as highlight_response_id,
                h.approved_excerpt_id, h.approved_excerpt_snapshot
         from survey.finding_response_bindings b
         join finding.evidence_highlights e on e.finding_id=b.finding_id
         join survey.highlight_response_bindings h on h.highlight_id=e.id
         where b.workspace_id=$1 and b.finding_id=$2`,
      [WORKSPACE_ID, finding.id],
    );
    expect(privateRows.rows).toEqual([
      {
        response_id: source.responseId,
        highlight_response_id: source.responseId,
        approved_excerpt_id: approval,
        approved_excerpt_snapshot: APPROVED,
      },
    ]);
    for (const table of ['finding_response_bindings', 'highlight_response_bindings']) {
      await expect(appHandle.pool.query(`select * from survey.${table}`)).rejects.toMatchObject({
        code: '42501',
      });
    }
    const detail = await app.inject({
      method: 'GET',
      url: `/findings/${finding.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${creator.cookie}` },
    });
    const list = await app.inject({
      method: 'GET',
      url: '/findings',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${creator.cookie}` },
    });
    for (const response of [detail, list]) {
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(APPROVED);
    }
  });
  it('replays the same idempotency key without duplicate rows or audits', async () => {
    const source = await seed();
    const creator = await actor();
    const key = randomUUID();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    const first = await post(
      creator.cookie,
      source.responseId,
      { severity: 'medium', approved_excerpt_ids: [] },
      key,
    );
    const before = await counts(source.responseId);
    const replay = await post(
      creator.cookie,
      source.responseId,
      { severity: 'medium', approved_excerpt_ids: [] },
      key,
    );
    expect(replay.statusCode).toBe(201);
    const firstBody = first.json<{ id: string }>();
    const replayBody = replay.json<{ id: string }>();
    expect(replayBody).toEqual(firstBody);
    expect(replayBody.id).toBe(firstBody.id);
    expect(await counts(source.responseId)).toEqual(before);
  });

  it('rejects a same-key different-payload replay with 409', async () => {
    const source = await seed();
    const creator = await actor();
    const key = randomUUID();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    expect(
      (
        await post(
          creator.cookie,
          source.responseId,
          { severity: 'low', approved_excerpt_ids: [] },
          key,
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await post(
          creator.cookie,
          source.responseId,
          { severity: 'high', approved_excerpt_ids: [] },
          key,
        )
      ).statusCode,
    ).toBe(409);
  });

  it('creates a distinct Finding for a distinct idempotency key', async () => {
    const source = await seed();
    const creator = await actor();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    const a = await post(creator.cookie, source.responseId, {
      severity: 'low',
      approved_excerpt_ids: [],
    });
    const b = await post(creator.cookie, source.responseId, {
      severity: 'low',
      approved_excerpt_ids: [],
    });
    expect(a.json<{ id: string }>().id).not.toBe(b.json<{ id: string }>().id);
    expect(await counts(source.responseId)).toEqual({
      findings: 2,
      links: 2,
      highlights: 0,
      audits: 2,
    });
  });

  it('returns byte-identical 404 bodies for missing, cross-workspace, no-read, and no-personal probes with zero side effects', async () => {
    const source = await seed();
    const noRead = await actor();
    const noPersonal = await actor();
    const foreign = await seedForeignResponse();
    await grant(noPersonal.id, 'survey.read', source.msId);
    const body = { severity: 'medium', approved_excerpt_ids: [] };
    const responses = await Promise.all([
      post(adminCookie, randomUUID(), body),
      post(adminCookie, foreign, body),
      post(noRead.cookie, source.responseId, body),
      post(noPersonal.cookie, source.responseId, body),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([404, 404, 404, 404]);
    expect(responses.map((response) => response.body)).toEqual(
      Array.from({ length: 4 }, () => responses[0]?.body),
    );
    expect(await counts(source.responseId)).toEqual({
      findings: 0,
      links: 0,
      highlights: 0,
      audits: 0,
    });
    expect(await counts(foreign)).toEqual({
      findings: 0,
      links: 0,
      highlights: 0,
      audits: 0,
    });
  });

  it('returns 403 for a readable personal source when finding.manage is missing', async () => {
    const source = await seed();
    const reader = await actor();
    await grant(reader.id, 'survey.read', source.msId);
    await grant(reader.id, 'survey.read_personal_responses', source.msId);
    expect(
      (
        await post(reader.cookie, source.responseId, {
          severity: 'medium',
          approved_excerpt_ids: [],
        })
      ).statusCode,
    ).toBe(403);
    expect(await counts(source.responseId)).toEqual({
      findings: 0,
      links: 0,
      highlights: 0,
      audits: 0,
    });
  });

  it('hides an identity-protected response from an admin without the personal capability', async () => {
    const source = await seed();
    expect(
      (await post(adminCookie, source.responseId, { severity: 'medium', approved_excerpt_ids: [] }))
        .statusCode,
    ).toBe(404);
    expect(await counts(source.responseId)).toEqual({
      findings: 0,
      links: 0,
      highlights: 0,
      audits: 0,
    });
  });

  it('allows identity-protected responses only with explicit personal capability', async () => {
    const source = await seed('open', true);
    const creator = await actor();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    expect(
      (
        await post(creator.cookie, source.responseId, {
          severity: 'medium',
          approved_excerpt_ids: [],
        })
      ).statusCode,
    ).toBe(201);
  });

  it('allows a personally authorized response even when aggregate suppression would apply', async () => {
    const source = await seed();
    const ratingQuestionId = await seedSuppressedRatingAggregate(source);
    const aggregateReader = await actor();
    const creator = await actor();
    await grant(aggregateReader.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    const results = await app.inject({
      method: 'GET',
      url: `/surveys/${source.surveyId}/results`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${aggregateReader.cookie}` },
    });
    expect(results.statusCode).toBe(200);
    const parsedResults = surveyResultDtoSchema.parse(results.json());
    expect(parsedResults.questions).toContainEqual({
      question_id: ratingQuestionId,
      visibility: 'suppressed',
      response_count: null,
      suppression: { code: 'anonymity_threshold' },
    });
    expect(
      (
        await post(creator.cookie, source.responseId, {
          severity: 'medium',
          approved_excerpt_ids: [],
        })
      ).statusCode,
    ).toBe(201);
  });

  it('returns draft 409 only after authorization and 404 before it', async () => {
    const source = await seed('draft');
    const authorized = await actor();
    const unauthorized = await actor();
    await grant(authorized.id, 'survey.read', source.msId);
    await grant(authorized.id, 'survey.read_personal_responses', source.msId);
    await grant(authorized.id, 'finding.manage', source.msId);
    expect(
      (
        await post(authorized.cookie, source.responseId, {
          severity: 'medium',
          approved_excerpt_ids: [],
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post(unauthorized.cookie, source.responseId, {
          severity: 'medium',
          approved_excerpt_ids: [],
        })
      ).statusCode,
    ).toBe(404);
  });

  it('rejects foreign, revoked, and duplicate excerpt ids with 422, and accepts an empty excerpt array', async () => {
    const source = await seed();
    const other = await seed();
    const creator = await actor();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'survey.manage', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    const approved = await approve(source, creator.cookie);
    await grant(creator.id, 'survey.read', other.msId);
    await grant(creator.id, 'survey.read_personal_responses', other.msId);
    await grant(creator.id, 'survey.manage', other.msId);
    const foreign = await approve(other, creator.cookie);
    await migrateHandle.pool.query(
      'update survey.survey_response_excerpt_approvals set revoked_at=now() where id=$1',
      [approved],
    );
    expect(
      (
        await post(creator.cookie, source.responseId, {
          severity: 'medium',
          approved_excerpt_ids: [foreign],
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await post(creator.cookie, source.responseId, {
          severity: 'medium',
          approved_excerpt_ids: [approved],
        })
      ).statusCode,
    ).toBe(422);
    const active = await approve(source, creator.cookie);
    expect(
      (
        await post(creator.cookie, source.responseId, {
          severity: 'medium',
          approved_excerpt_ids: [active, active],
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await post(creator.cookie, source.responseId, {
          severity: 'medium',
          approved_excerpt_ids: [],
        })
      ).statusCode,
    ).toBe(201);
  });

  it('shows an approved snapshot through Finding evidence with survey.read but no personal capability', async () => {
    const source = await seed();
    const creator = await actor();
    const safeReader = await actor();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'survey.manage', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    await grant(safeReader.id, 'survey.read', source.msId);
    await grant(safeReader.id, 'finding.read', source.msId);
    const excerptId = await approve(source, creator.cookie);
    const created = await post(creator.cookie, source.responseId, {
      severity: 'medium',
      approved_excerpt_ids: [excerptId],
    });
    const findingId = created.json<{ id: string }>().id;
    const evidence = await app.inject({
      method: 'GET',
      url: `/findings/${findingId}/evidence-highlights`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${safeReader.cookie}` },
    });
    expect(evidence.statusCode).toBe(200);
    expect(evidence.json<{ items: Array<{ quote_or_summary?: string }> }>().items).toEqual([
      expect.objectContaining({ quote_or_summary: APPROVED }),
    ]);
  });

  it('hides a highlight when its attached approval is revoked despite a duplicate active approval', async () => {
    const source = await seed();
    const creator = await actor();
    const safeReader = await actor();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'survey.manage', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    await grant(safeReader.id, 'survey.read', source.msId);
    await grant(safeReader.id, 'finding.read', source.msId);
    const attached = await approve(source, creator.cookie);
    await approve(source, creator.cookie); // Same text, independently revocable approval.
    const created = await post(creator.cookie, source.responseId, {
      severity: 'medium',
      approved_excerpt_ids: [attached],
    });
    expect(created.statusCode).toBe(201);
    await migrateHandle.pool.query(
      'update survey.survey_response_excerpt_approvals set revoked_at=now() where id=$1',
      [attached],
    );
    const evidence = await app.inject({
      method: 'GET',
      url: `/findings/${created.json<{ id: string }>().id}/evidence-highlights`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${safeReader.cookie}` },
    });
    expect(evidence.statusCode).toBe(200);
    expect(evidence.json<{ items: Array<{ quote_or_summary?: string }> }>().items).toEqual([
      expect.not.objectContaining({ quote_or_summary: APPROVED }),
    ]);
  });

  it('omits the response UUID and raw answer from Finding, evidence, and entity-link serializations', async () => {
    const source = await seed();
    const creator = await actor();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'survey.manage', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    await grant(creator.id, 'finding.read', source.msId);
    const excerptId = await approve(source, creator.cookie);
    const created = await post(creator.cookie, source.responseId, {
      severity: 'medium',
      approved_excerpt_ids: [excerptId],
    });
    const findingId = created.json<{ id: string }>().id;
    const finding = await app.inject({
      method: 'GET',
      url: `/findings/${findingId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${creator.cookie}` },
    });
    const evidence = await app.inject({
      method: 'GET',
      url: `/findings/${findingId}/evidence-highlights`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${creator.cookie}` },
    });
    const links = await app.inject({
      method: 'GET',
      url: `/entity-links?target_type=finding&target_id=${findingId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${creator.cookie}` },
    });
    expect(finding.statusCode).toBe(200);
    expect(evidence.statusCode).toBe(200);
    expect(links.statusCode).toBe(200);
    findingDtoSchema.parse(finding.json());
    const parsedEvidence = evidence.json<{ items: unknown[] }>();
    for (const item of parsedEvidence.items) evidenceHighlightDtoSchema.parse(item);
    const parsedLinks = links.json<{ items: unknown[] }>();
    for (const item of parsedLinks.items) entityLinkDtoSchema.parse(item);
    for (const payload of [finding.body, evidence.body, links.body]) {
      expect(payload).not.toContain(source.responseId);
      expect(payload).not.toContain(RAW_ANSWER);
    }
  });

  it('omits quote and source metadata after an explicit source deny to Admin (#739)', async () => {
    const source = await seed();
    await grant(adminId, 'survey.read_personal_responses', source.msId);
    const approval = await approve(source, adminCookie);
    const created = await post(adminCookie, source.responseId, {
      severity: 'medium',
      approved_excerpt_ids: [approval],
    });
    expect(created.statusCode).toBe(201);
    await migrateHandle.pool.query(
      `insert into permission.permission_denies
          (workspace_id,actor_id,capability,managed_system_id,created_by_actor_id,reason)
         values ($1,$2,'survey.read',$3,$2,'#739 source withdrawn')`,
      [WORKSPACE_ID, adminId, source.msId],
    );
    const before = await counts(source.responseId);
    const deniedCreate = await post(adminCookie, source.responseId, {
      severity: 'medium',
      approved_excerpt_ids: [approval],
    });
    expect(deniedCreate.statusCode).toBe(404);
    expect(await counts(source.responseId)).toEqual(before);
    const evidence = await app.inject({
      method: 'GET',
      url: `/findings/${created.json<{ id: string }>().id}/evidence-highlights`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(evidence.statusCode).toBe(200);
    const items = evidence.json<{ items: Array<Record<string, unknown>> }>().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.quote_or_summary).toBeUndefined();
    expect(items[0]?.source_meta).toBe('Survey response · Unknown · Identity protected');
    expect(evidence.body).not.toContain(source.responseId);
    expect(evidence.body).not.toContain(APPROVED);
  });

  it.each(['read-first', 'revoke-first'] as const)(
    'serializes competing highlight read/revoke routes: %s (#739)',
    async (order) => {
      const source = await seed();
      await grant(adminId, 'survey.read_personal_responses', source.msId);
      const approval = await approve(source, adminCookie);
      const created = await post(adminCookie, source.responseId, {
        severity: 'medium',
        approved_excerpt_ids: [approval],
      });
      expect(created.statusCode).toBe(201);
      const findingId = created.json<{ id: string }>().id;
      const blocker = await appHandle.pool.connect();
      const headers = { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` };
      const read = () =>
        app.inject({ method: 'GET', url: `/findings/${findingId}/evidence-highlights`, headers });
      const revoke = () =>
        app.inject({
          method: 'DELETE',
          url: `/survey-responses/${source.responseId}/approved-excerpts/${approval}`,
          headers,
        });
      let first: ReturnType<typeof read> | undefined;
      let second: ReturnType<typeof read> | undefined;
      try {
        await blocker.query('begin');
        await blocker.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
          source.responseId,
        ]);
        // Calling then starts inject immediately; observing pg_locks is the barrier.
        first = (order === 'read-first' ? read() : revoke()).then((r) => r);
        await waitForResponseEvidenceWaiters(migrateHandle, source.responseId, 1, first);
        second = (order === 'read-first' ? revoke() : read()).then((r) => r);
        await waitForResponseEvidenceWaiters(migrateHandle, source.responseId, 2, second);
        await blocker.query('commit');
        const [a, b] = await Promise.all([first, second]);
        const readResult = order === 'read-first' ? a : b;
        const revokeResult = order === 'read-first' ? b : a;
        expect(readResult.statusCode).toBe(200);
        expect(revokeResult.statusCode).toBe(200);
        const quote = readResult.json<{ items: Array<{ quote_or_summary?: string }> }>().items[0]
          ?.quote_or_summary;
        expect(quote).toBe(order === 'read-first' ? APPROVED : undefined);
        const later = await read();
        expect(later.body).not.toContain(APPROVED);
        expect(created.body).not.toContain(APPROVED);
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await Promise.allSettled([first, second].filter((p) => p !== undefined));
      }
    },
  );
  it('generates title and summary without raw answer text', async () => {
    const source = await seed();
    const creator = await actor();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'survey.manage', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    const excerptId = await approve(source, creator.cookie);
    const response = await post(creator.cookie, source.responseId, {
      severity: 'medium',
      approved_excerpt_ids: [excerptId],
    });
    const body = response.json<{ title: string; summary: string }>();
    expect(body.title).not.toContain(RAW_ANSWER);
    expect(body.summary).not.toContain(RAW_ANSWER);
  });

  it('rolls back all residue when a post-finding highlight insert fails', async () => {
    const source = await seed();
    const creator = await actor();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'survey.manage', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    const active = await approve(source, creator.cookie);
    // The Finding is inserted before evidence highlights. Removing only this
    // privilege makes the request fail after that insert and pins tx rollback.
    await migrateHandle.pool.query('revoke insert on finding.evidence_highlights from fops_app');
    try {
      expect(
        (
          await post(creator.cookie, source.responseId, {
            severity: 'medium',
            approved_excerpt_ids: [active],
          })
        ).statusCode,
      ).toBe(500);
    } finally {
      await migrateHandle.pool.query(
        'grant select, insert, update on finding.evidence_highlights to fops_app',
      );
    }
    expect(await counts(source.responseId)).toEqual({
      findings: 0,
      links: 0,
      highlights: 0,
      audits: 0,
    });
  });
  function inventoryRead(cookie: string, suffix = '') {
    return app.inject({
      method: 'GET',
      url: `/evidence-highlights${suffix}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }
  // The personal-response grant is unique per active tuple: grant it once per source.
  async function attachedInventory(source: Source, grantPersonal = true) {
    if (grantPersonal) await grant(adminId, 'survey.read_personal_responses', source.msId);
    const approval = await approve(source, adminCookie);
    const created = await post(adminCookie, source.responseId, {
      severity: 'medium',
      approved_excerpt_ids: [approval],
    });
    expect(created.statusCode).toBe(201);
    const findingId = created.json<{ id: string }>().id;
    const nested = await app.inject({
      method: 'GET',
      url: `/findings/${findingId}/evidence-highlights`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(nested.statusCode).toBe(200);
    return {
      approval,
      findingId,
      id: nested.json<{ items: Array<{ id: string }> }>().items[0]?.id ?? '',
    };
  }

  it('inventory keeps below-threshold attached Survey audience and suppresses exact revoked approvals between pages', async () => {
    const source = await seed(); // one respondent, below result-picker threshold
    const older = await attachedInventory(source);
    const newer = await attachedInventory(source, false);
    const reader = await actor();
    await grant(reader.id, 'finding.read', source.msId);
    await grant(reader.id, 'survey.read', source.msId);
    const before = await migrateHandle.pool.query(
      'select count(*)::int as count from core.audit_log where workspace_id=$1',
      [WORKSPACE_ID],
    );
    const first = await inventoryRead(reader.cookie, `?managed_system_id=${source.msId}&limit=1`);
    expect(first.statusCode).toBe(200);
    const parsed = listEvidenceInventoryResponseSchema.parse(first.json());
    expect(parsed.items[0]).toMatchObject({
      id: newer.id,
      content_state: 'available',
      quote_or_summary: APPROVED,
      source: {
        survey_type: 'outcome',
        question_label: 'What needs improvement?',
        identity_protected: true,
      },
    });
    const firstItem = parsed.items[0];
    if (!firstItem || firstItem.source_type !== 'survey_response')
      throw new Error('Survey item missing');
    expect(Object.keys(firstItem.source ?? {}).sort()).toEqual([
      'identity_protected',
      'question_label',
      'survey_display_id',
      'survey_type',
    ]);
    for (const secret of [
      source.responseId,
      older.approval,
      newer.approval,
      RAW_ANSWER,
      'Private survey',
    ])
      expect(first.body).not.toContain(secret);
    // Direct detail must work for an item absent from the loaded page.
    const detail = await inventoryRead(reader.cookie, `/${older.id}`);
    expect(detail.statusCode).toBe(200);
    expect(evidenceInventoryItemSchema.parse(detail.json()).id).toBe(older.id);
    expect(
      (
        await migrateHandle.pool.query(
          'select count(*)::int as count from core.audit_log where workspace_id=$1',
          [WORKSPACE_ID],
        )
      ).rows,
    ).toEqual(before.rows);
    const revoke = await app.inject({
      method: 'DELETE',
      url: `/survey-responses/${source.responseId}/approved-excerpts/${older.approval}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(revoke.statusCode).toBe(200);
    const next = await inventoryRead(
      reader.cookie,
      `?managed_system_id=${source.msId}&limit=1&cursor=${encodeURIComponent(parsed.page.cursor ?? '')}`,
    );
    expect(next.statusCode).toBe(200);
    expect(next.json().items[0]).toMatchObject({ id: older.id, content_state: 'withheld' });
    expect(next.json().items[0]).not.toHaveProperty('source');
    expect(next.json().items[0]).not.toHaveProperty('quote_or_summary');
    expect((await inventoryRead(reader.cookie, `/${older.id}`)).json().content_state).toBe(
      'withheld',
    );
    const searched = await inventoryRead(
      reader.cookie,
      `?managed_system_id=${source.msId}&q=${encodeURIComponent(APPROVED)}&limit=1`,
    );
    expect(searched.json().items.map((item: { id: string }) => item.id)).toEqual([newer.id]);
    expect(searched.json().page).toEqual({ has_more: false });
  });

  it('inventory withholds Survey text and source labels from an explicitly denied Admin', async () => {
    const source = await seed();
    const attached = await attachedInventory(source);
    await migrateHandle.pool.query(
      `insert into permission.permission_denies
       (workspace_id,actor_id,capability,managed_system_id,created_by_actor_id,reason)
       values ($1,$2,'survey.read',$3,$2,'inventory source denied')`,
      [WORKSPACE_ID, adminId, source.msId],
    );
    const selected = await inventoryRead(adminCookie, `/${attached.id}`);
    expect(selected.statusCode).toBe(200);
    expect(selected.json().content_state).toBe('withheld');
    expect(selected.json()).not.toHaveProperty('source');
    const searched = await inventoryRead(
      adminCookie,
      `?managed_system_id=${source.msId}&q=${encodeURIComponent(APPROVED)}`,
    );
    expect(searched.json()).toEqual({ items: [], page: { has_more: false } });
    const parent = await migrateHandle.pool.query<{ title: string }>(
      'select title from finding.findings where id=$1',
      [attached.findingId],
    );
    const safe = await inventoryRead(
      adminCookie,
      `?managed_system_id=${source.msId}&q=${encodeURIComponent(parent.rows[0]?.title ?? '')}`,
    );
    expect(safe.json().items.map((item: { id: string }) => item.id)).toEqual([attached.id]);
  });

  it.each([
    ['list', 'read-first'],
    ['list', 'revoke-first'],
    ['detail', 'read-first'],
    ['detail', 'revoke-first'],
  ] as const)('inventory %s serializes exact-approval revoke: %s', async (surface, order) => {
    const source = await seed();
    const attached = await attachedInventory(source);
    const blocker = await appHandle.pool.connect();
    const read = () =>
      inventoryRead(
        adminCookie,
        surface === 'detail' ? `/${attached.id}` : `?managed_system_id=${source.msId}`,
      );
    const revoke = () =>
      app.inject({
        method: 'DELETE',
        url: `/survey-responses/${source.responseId}/approved-excerpts/${attached.approval}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      });
    let first: ReturnType<typeof read> | undefined;
    let second: ReturnType<typeof read> | undefined;
    try {
      await blocker.query('begin');
      await blocker.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        source.responseId,
      ]);
      first = (order === 'read-first' ? read() : revoke()).then((r) => r);
      await waitForResponseEvidenceWaiters(migrateHandle, source.responseId, 1, first);
      second = (order === 'read-first' ? revoke() : read()).then((r) => r);
      await waitForResponseEvidenceWaiters(migrateHandle, source.responseId, 2, second);
      await blocker.query('commit');
      const [a, b] = await Promise.all([first, second]);
      const result = order === 'read-first' ? a : b;
      expect(result.statusCode).toBe(200);
      expect((order === 'read-first' ? b : a).statusCode).toBe(200);
      const item = surface === 'detail' ? result.json() : result.json().items[0];
      expect(item.quote_or_summary).toBe(order === 'read-first' ? APPROVED : undefined);
      expect(item.content_state).toBe(order === 'read-first' ? 'available' : 'withheld');
      expect((await read()).body).not.toContain(APPROVED);
    } finally {
      await blocker.query('rollback');
      blocker.release();
      await Promise.allSettled([first, second].filter((p) => p !== undefined));
    }
  });

  it('inventory hides foreign workspace highlights and rejects foreign cursor context', async () => {
    const responseId = await seedForeignResponse();
    const foreign = await migrateHandle.pool.query<{
      workspace_id: string;
      primary_managed_system_id: string;
      created_by: string;
    }>(
      `select s.workspace_id,s.primary_managed_system_id,s.created_by from survey.surveys s
      join survey.survey_responses r on r.survey_id=s.id where r.id=$1`,
      [responseId],
    );
    const subject = foreign.rows[0];
    if (!subject) throw new Error('foreign fixture absent');
    const findingId = randomUUID();
    const highlightId = randomUUID();
    try {
      await migrateHandle.pool.query(
        `insert into finding.findings (id,workspace_id,display_id,primary_managed_system_id,
          title,summary,source_type,severity,status,created_by)
         values ($1,$2,'FIN-FOREIGN',$3,'foreign hidden title','foreign summary','manual','medium','draft',$4)`,
        [findingId, subject.workspace_id, subject.primary_managed_system_id, subject.created_by],
      );
      await migrateHandle.pool.query(
        `insert into finding.evidence_highlights (id,workspace_id,finding_id,primary_managed_system_id,
          source_type,quote_or_summary,created_by)
         values ($1,$2,$3,$4,'note','foreign hidden quote',$5)`,
        [
          highlightId,
          subject.workspace_id,
          findingId,
          subject.primary_managed_system_id,
          subject.created_by,
        ],
      );
      expect((await inventoryRead(adminCookie, `/${highlightId}`)).statusCode).toBe(404);
      expect((await inventoryRead(adminCookie, '?q=foreign hidden')).json()).toEqual({
        items: [],
        page: { has_more: false },
      });
      const cursor = Buffer.from(
        JSON.stringify({
          timestamp: '2026-10-13T00:00:00Z',
          id: highlightId,
          workspace: subject.workspace_id,
          actor: adminId,
          scope: 'all',
          source: 'all',
          q: '',
        }),
      ).toString('base64url');
      expect((await inventoryRead(adminCookie, `?cursor=${cursor}`)).statusCode).toBe(422);
    } finally {
      await migrateHandle.pool.query('delete from finding.evidence_highlights where id=$1', [
        highlightId,
      ]);
      await migrateHandle.pool.query('delete from finding.findings where id=$1', [findingId]);
    }
  });

  it('measures cross-Finding Survey batch hydration and stable continuation', async () => {
    const scopeIds: string[] = [];
    for (let index = 0; index < 4; index++) {
      const source = await seed();
      scopeIds.push(source.msId);
      const creator = await actor(); // one Actor per sensitive-tier burst
      for (const capability of ['survey.read', 'survey.read_personal_responses', 'finding.manage'])
        await grant(creator.id, capability, source.msId);
      const approvals = await migrateHandle.pool.query<{ id: string }>(
        `insert into survey.survey_response_excerpt_approvals
          (workspace_id,survey_id,response_id,question_id,redacted_excerpt,approved_by)
         select $1::uuid,$2::uuid,$3::uuid,$4::uuid,'inventory-fanout excerpt',$5::uuid
         from generate_series(1,75) n returning id`,
        [WORKSPACE_ID, source.surveyId, source.responseId, source.questionId, adminId],
      );
      const created = await post(creator.cookie, source.responseId, {
        severity: 'medium',
        approved_excerpt_ids: approvals.rows.map((row) => row.id),
      });
      expect(created.statusCode).toBe(201);
    }
    const url = '?source_type=survey_response&q=inventory-fanout&limit=100';
    const start = performance.now();
    const first = await inventoryRead(adminCookie, url);
    const firstMs = performance.now() - start;
    expect(first.statusCode).toBe(200);
    let page = listEvidenceInventoryResponseSchema.parse(first.json());
    const sourcePlan = await appHandle.pool.query(
      'explain (analyze,buffers,format json) select * from survey.read_inventory_highlight_evidence($1::uuid,$2::uuid[])',
      [WORKSPACE_ID, page.items.map((item) => item.id)],
    );
    const continuationStart = performance.now();
    const next = await inventoryRead(
      adminCookie,
      `${url}&cursor=${encodeURIComponent(page.page.cursor ?? '')}`,
    );
    const continuationMs = performance.now() - continuationStart;
    expect(next.statusCode).toBe(200);
    const replay = await inventoryRead(
      adminCookie,
      `${url}&cursor=${encodeURIComponent(page.page.cursor ?? '')}`,
    );
    expect(replay.json()).toEqual(next.json());
    const seen = new Set<string>();
    let pages = 0;
    while (true) {
      expect(page.items.length).toBeLessThanOrEqual(100);
      for (const item of page.items) {
        expect(item.content_state).toBe('available');
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      pages++;
      if (!page.page.has_more) break;
      const continued = await inventoryRead(
        adminCookie,
        `${url}&cursor=${encodeURIComponent(page.page.cursor ?? '')}`,
      );
      expect(continued.statusCode).toBe(200);
      page = listEvidenceInventoryResponseSchema.parse(continued.json());
    }
    expect(seen.size).toBe(300);
    expect(pages).toBe(3);
    console.info('W-1106 Survey pagination measurement', {
      surveys: 4,
      responses: 4,
      findings: 4,
      highlights: seen.size,
      scopes: scopeIds.length,
      sourcePlan: sourcePlan.rows,
      firstMs,
      continuationMs,
      pages,
    });
  }, 60_000);
});
