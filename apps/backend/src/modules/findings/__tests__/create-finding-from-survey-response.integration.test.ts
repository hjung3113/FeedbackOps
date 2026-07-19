// Route-level contract for the only permitted Survey Response -> Finding command.
// It deliberately uses the fops_app server path and the fops_migrate handle only
// for fixtures, observable persistence assertions, and deterministic cleanup.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';

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

  beforeEach(async () => cleanup());
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
            or actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2))`,
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
      `delete from permission.permission_grants where workspace_id=$1 and managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.idempotency_keys where actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2)',
      [WORKSPACE_ID, `${SLUG}-%`],
    );
    await migrateHandle.pool.query(
      'delete from core.sessions where actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2)',
      [WORKSPACE_ID, `${SLUG}-%`],
    );
    await migrateHandle.pool.query(
      'delete from core.actors where workspace_id=$1 and external_id like $2',
      [WORKSPACE_ID, `${SLUG}-%`],
    );
    await migrateHandle.pool.query(`delete from core.managed_systems where id in (${systems})`, [
      WORKSPACE_ID,
      `${SLUG}%`,
    ]);
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
         (select count(*) from finding.findings where source_type='survey_response' and source_id=$1::uuid)::text as findings,
         (select count(*) from core.entity_links where source_type='survey_response' and source_id=$1::uuid)::text as links,
         (select count(*) from finding.evidence_highlights where source_type='survey_response' and source_id=$1::uuid)::text as highlights,
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

  it('rejects foreign and revoked excerpt ids with 422, accepts duplicate ids, and accepts an empty excerpt array', async () => {
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
    for (const payload of [finding.body, evidence.body, links.body]) {
      expect(payload).not.toContain(source.responseId);
      expect(payload).not.toContain(RAW_ANSWER);
    }
  });

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

  it('rolls back all residue when a late approved-excerpt validation failure is forced', async () => {
    const source = await seed();
    const creator = await actor();
    await grant(creator.id, 'survey.read', source.msId);
    await grant(creator.id, 'survey.read_personal_responses', source.msId);
    await grant(creator.id, 'survey.manage', source.msId);
    await grant(creator.id, 'finding.manage', source.msId);
    const active = await approve(source, creator.cookie);
    await migrateHandle.pool.query(
      'update survey.survey_response_excerpt_approvals set revoked_at=now() where id=$1',
      [active],
    );
    expect(
      (
        await post(creator.cookie, source.responseId, {
          severity: 'medium',
          approved_excerpt_ids: [active],
        })
      ).statusCode,
    ).toBe(422);
    expect(await counts(source.responseId)).toEqual({
      findings: 0,
      links: 0,
      highlights: 0,
      audits: 0,
    });
  });
});
