import { randomUUID } from 'node:crypto';

import {
  AUDIT_EVENT_DETAIL_SCHEMAS,
  surveyCopySourceResponseSchema,
  surveyCopySourcesResponseSchema,
  surveyDetailDtoSchema,
  surveyDtoSchema,
} from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow, insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { denyCapability, grantCapability } from '../../../test-support/permissions-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('Saved Survey definition reuse (#1074)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let systemId: string;
  let adminId: string;
  let developerId: string;
  let userId: string;
  let adminCookie: string;
  let developerCookie: string;
  let userCookie: string;

  const prefix = 'it-survey-reuse';
  const actorIds: string[] = [];
  const systemIds: string[] = [];
  const foreignWorkspaceIds: string[] = [];
  const attemptKeys: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    expect(
      (await appHandle.pool.query<{ role: string }>('select current_user as role')).rows[0]?.role,
    ).toBe('fops_app');
    expect(
      (await migrateHandle.pool.query<{ role: string }>('select current_user as role')).rows[0]
        ?.role,
    ).toBe('fops_migrate');
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const admin = await appHandle.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? '';
    if (!adminId) throw new Error('mock admin actor not found');
    const developer = await insertDevActor(appHandle, WORKSPACE_ID, uid(prefix));
    developerId = developer.id;
    actorIds.push(developerId);
    developerCookie = await loginAs(app, developer.externalId);
    const userExternalId = uid(prefix);
    const user = await insertActorRow(appHandle, {
      workspaceId: WORKSPACE_ID,
      externalId: userExternalId,
      roleLevel: 'user',
    });
    userId = user.id;
    actorIds.push(userId);
    userCookie = await loginAs(app, userExternalId);
  });

  async function cleanup() {
    if (!migrateHandle) return;
    await migrateHandle.pool.query(
      `delete from core.audit_log where workspace_id=$1 and
       (detail->>'primary_managed_system_id'=any($2::text[]) or
        detail->>'survey_id' in (select id::text from survey.surveys where primary_managed_system_id=any($2::uuid[])))`,
      [WORKSPACE_ID, systemIds],
    );
    await migrateHandle.pool.query(
      'delete from core.entity_links where managed_system_id=any($1::uuid[])',
      [systemIds],
    );
    // #739: the binding check is deferred, so a Survey Finding and its private binding
    // must leave in one transaction.
    const findingClient = await migrateHandle.pool.connect();
    try {
      await findingClient.query('begin');
      await findingClient.query(
        'delete from survey.finding_response_bindings where finding_id in (select id from finding.findings where primary_managed_system_id=any($1::uuid[]))',
        [systemIds],
      );
      await findingClient.query(
        'delete from finding.findings where primary_managed_system_id=any($1::uuid[])',
        [systemIds],
      );
      await findingClient.query('commit');
    } catch (error) {
      await findingClient.query('rollback');
      throw error;
    } finally {
      findingClient.release();
    }
    for (const table of [
      'survey_response_excerpt_approvals',
      'outcome_follow_up_decisions',
      'survey_response_answers',
      'survey_responses',
    ]) {
      await migrateHandle.pool.query(
        `delete from survey.${table} where survey_id in (select id from survey.surveys where primary_managed_system_id=any($1::uuid[]))`,
        [systemIds],
      );
    }
    await migrateHandle.pool.query(
      'delete from survey.survey_questions where survey_id in (select id from survey.surveys where primary_managed_system_id=any($1::uuid[]))',
      [systemIds],
    );
    await migrateHandle.pool.query(
      'delete from survey.surveys where primary_managed_system_id=any($1::uuid[])',
      [systemIds],
    );
    await migrateHandle.pool.query('delete from core.idempotency_keys where key=any($1::uuid[])', [
      attemptKeys,
    ]);
    await migrateHandle.pool.query(
      'delete from permission.permission_denies where managed_system_id=any($1::uuid[])',
      [systemIds],
    );
    await migrateHandle.pool.query(
      'delete from permission.permission_grants where managed_system_id=any($1::uuid[])',
      [systemIds],
    );
    await migrateHandle.pool.query(
      'delete from core.analytics_areas where managed_system_id=any($1::uuid[])',
      [systemIds],
    );
    await migrateHandle.pool.query('delete from core.managed_systems where id=any($1::uuid[])', [
      systemIds,
    ]);
    await migrateHandle.pool.query('delete from core.workspaces where id=any($1::uuid[])', [
      foreignWorkspaceIds,
    ]);
    await migrateHandle.pool.query(
      "delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'",
      [WORKSPACE_ID],
    );
    systemIds.length = 0;
    foreignWorkspaceIds.length = 0;
    attemptKeys.length = 0;
  }

  beforeEach(async () => {
    await cleanup();
    systemId = await insertMsDirectly(appHandle, WORKSPACE_ID, uid(prefix), 'Survey starter MS');
    systemIds.push(systemId);
    await grantCapability(appHandle, WORKSPACE_ID, developerId, 'survey.manage', systemId, adminId);
    await grantCapability(appHandle, WORKSPACE_ID, developerId, 'survey.read', systemId, adminId);
  });

  afterAll(async () => {
    await cleanup();
    await migrateHandle.pool.query('delete from core.sessions where actor_id=any($1::uuid[])', [
      actorIds,
    ]);
    await migrateHandle.pool.query('delete from core.actors where id=any($1::uuid[])', [actorIds]);
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  function headers(cookie: string) {
    return { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
  }
  function body(overrides: Record<string, unknown> = {}) {
    return {
      type: 'discovery',
      title: 'New operator title',
      description: 'New context',
      primary_managed_system_id: systemId,
      responses_identity_protected: false,
      starting_point: { kind: 'builtin', template_id: 'discovery-basic', version: 1 },
      ...overrides,
    };
  }
  function trackedKey() {
    const key = randomUUID();
    attemptKeys.push(key);
    return key;
  }
  function post(cookie: string, payload: Record<string, unknown>, key = randomUUID()) {
    attemptKeys.push(key);
    return app.inject({
      method: 'POST',
      url: '/surveys',
      headers: { ...headers(cookie), 'idempotency-key': key },
      payload,
    });
  }
  async function creationAuditCount() {
    const rows = await appHandle.pool.query<{ count: number }>(
      `select count(*)::int as count from core.audit_log where workspace_id=$1
       and actor_id=any($2::uuid[]) and event_type in ('survey_created','survey_question_created')`,
      [WORKSPACE_ID, [adminId, developerId, userId]],
    );
    return rows.rows[0]?.count ?? 0;
  }
  async function counter() {
    const rows = await appHandle.pool.query<{ next_value: string }>(
      "select next_value from core.display_counters where workspace_id=$1 and entity_type='survey'",
      [WORKSPACE_ID],
    );
    return Number(rows.rows[0]?.next_value ?? 1000);
  }

  async function source(status = 'draft', overrides: Record<string, unknown> = {}) {
    const created = await post(adminCookie, body(overrides));
    expect(created.statusCode).toBe(201);
    const id = surveyDtoSchema.parse(created.json()).id;
    if (status !== 'draft')
      await migrateHandle.pool.query(
        "update survey.surveys set status=$2,opened_at=now(),closed_at=case when $2='closed' then now() else null end where id=$1",
        [id, status],
      );
    return id;
  }
  function preview(id: string, cookie = developerCookie) {
    return app.inject({
      method: 'GET',
      url: `/surveys/${id}/copy-source`,
      headers: headers(cookie),
    });
  }
  function discover(query = `managed_system_id=${systemId}`, cookie = developerCookie) {
    return app.inject({
      method: 'GET',
      url: `/surveys/copy-sources?${query}`,
      headers: headers(cookie),
    });
  }
  async function reuse(
    id: string,
    token: string,
    overrides: Record<string, unknown> = {},
    key = randomUUID(),
    cookie = developerCookie,
  ) {
    return post(
      cookie,
      body({
        starting_point: { kind: 'existing_survey', survey_id: id, definition_token: token },
        ...overrides,
      }),
      key,
    );
  }
  it.each(['draft', 'open', 'closed'])(
    'discovers and copies a saved %s definition with ID-only audits',
    async (status) => {
      const id = await source(status);
      const read = await preview(id);
      expect(read.statusCode).toBe(200);
      expect(read.headers['cache-control']).toBe('private, no-cache');
      const selected = surveyCopySourceResponseSchema.parse(read.json());
      const listing = await discover();
      expect(listing.statusCode).toBe(200);
      expect(surveyCopySourcesResponseSchema.parse(listing.json())).toEqual({
        items: [
          {
            survey_id: id,
            display_id: selected.display_id,
            title: 'New operator title',
            type: 'discovery',
            status,
            question_count: 2,
          },
        ],
        page: { has_more: false },
      });
      const key = randomUUID();
      const copied = await reuse(id, selected.definition_token, {}, key);
      expect(copied.statusCode).toBe(201);
      const target = surveyDtoSchema.parse(copied.json());
      expect(target.id).not.toBe(id);
      expect(target.status).toBe('draft');
      const detail = await app.inject({
        method: 'GET',
        url: `/surveys/${target.id}`,
        headers: headers(developerCookie),
      });
      const graph = surveyDetailDtoSchema.parse(detail.json()).questions;
      expect(graph.map((q) => q.id)).not.toEqual(selected.questions.map((q) => q.id));
      expect(graph.map(({ id: _id, survey_id: _survey, ...q }) => q)).toEqual(
        selected.questions.map(({ id: _id, ...q }) => q),
      );
      const audits = await appHandle.pool.query<{
        event_type: string;
        detail: Record<string, unknown>;
      }>(
        "select event_type,detail from core.audit_log where detail->>'survey_id'=$1 and event_type in ('survey_created','survey_question_created')",
        [target.id],
      );
      expect(audits.rows).toHaveLength(3);
      const provenance = audits.rows.find((x) => x.event_type === 'survey_created')?.detail;
      expect(provenance?.starting_point).toEqual({ kind: 'existing_survey', survey_id: id });
      expect(provenance?.question_count).toBe(2);
      for (const row of audits.rows)
        expect(
          AUDIT_EVENT_DETAIL_SCHEMAS[
            row.event_type as 'survey_created' | 'survey_question_created'
          ].parse(row.detail),
        ).toEqual(row.detail);
      const committed = await effects();
      await denyCapability(appHandle, WORKSPACE_ID, developerId, 'survey.read', systemId, adminId);
      await migrateHandle.pool.query(
        "update survey.survey_questions set prompt='later edit' where survey_id=$1",
        [id],
      );
      const replay = await reuse(id, selected.definition_token, {}, key);
      expect(replay.json()).toEqual(copied.json());
      expect((await reuse(id, 'different-token', {}, key)).statusCode).toBe(409);
      expect(await effects()).toEqual(committed);
    },
  );
  async function effects() {
    const rows = await appHandle.pool.query(
      `select
       (select count(*)::int from survey.surveys where primary_managed_system_id=any($1::uuid[])) as surveys,
       (select count(*)::int from survey.survey_questions where survey_id in (select id from survey.surveys where primary_managed_system_id=any($1::uuid[]))) as questions,
       (select count(*)::int from core.idempotency_keys where key=any($2::uuid[])) as successes`,
      [systemIds, attemptKeys],
    );
    return { ...rows.rows[0], audits: await creationAuditCount(), counter: await counter() };
  }
  it.each([
    ['edited prompt', 409, 'conflict.stale_write'],
    ['read deny', 404, 'not_found.record'],
    ['manage deny', 403, 'permission.denied'],
    ['read revoked', 404, 'not_found.record'],
    ['manage revoked', 403, 'permission.denied'],
    ['User', 403, 'permission.denied'],
    ['read only', 403, 'permission.denied'],
    ['missing source', 404, 'not_found.record'],
    ['foreign source', 404, 'not_found.record'],
    ['archived target', 409, 'conflict.parent_archived'],
    ['cross system', 422, 'validation.failed'],
    ['type mismatch', 422, 'validation.failed'],
    ['empty graph', 422, 'validation.failed'],
    ['invalid graph', 422, 'validation.failed'],
    ['malformed graph', 422, 'validation.failed'],
  ] as const)(
    '%s after preview rejects without any creation effects',
    async (scenario, status, code) => {
      let id = await source();
      const selected = surveyCopySourceResponseSchema.parse((await preview(id)).json());
      let cookie = developerCookie;
      const overrides: Record<string, unknown> = {};
      if (scenario === 'edited prompt')
        await migrateHandle.pool.query(
          "update survey.survey_questions set prompt='changed' where survey_id=$1",
          [id],
        );
      if (scenario === 'read deny' || scenario === 'manage deny')
        await denyCapability(
          appHandle,
          WORKSPACE_ID,
          developerId,
          scenario === 'read deny' ? 'survey.read' : 'survey.manage',
          systemId,
          adminId,
        );
      if (scenario === 'read revoked' || scenario === 'manage revoked' || scenario === 'read only')
        await migrateHandle.pool.query(
          "update permission.permission_grants set revoked_at=now(),revoked_by_actor_id=$3,revoked_reason='test' where actor_id=$1 and managed_system_id=$2 and capability=$4",
          [
            developerId,
            systemId,
            adminId,
            scenario === 'read revoked' ? 'survey.read' : 'survey.manage',
          ],
        );
      if (scenario === 'User') cookie = userCookie;
      if (scenario === 'missing source') id = randomUUID();
      if (scenario === 'foreign source') {
        const workspace = randomUUID();
        foreignWorkspaceIds.push(workspace);
        await migrateHandle.pool.query('insert into core.workspaces(id,name) values($1,$2)', [
          workspace,
          uid(prefix),
        ]);
        const foreignSystem = await insertMsDirectly(
          migrateHandle,
          workspace,
          uid(prefix),
          'Foreign',
        );
        systemIds.push(foreignSystem);
        const foreignId = randomUUID();
        await migrateHandle.pool.query(
          "insert into survey.surveys(id,workspace_id,display_id,type,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by) values($1,$2,'SRV-999','discovery','Foreign',$3,$4,false,$4)",
          [foreignId, workspace, foreignSystem, adminId],
        );
        id = foreignId;
        for (const result of [
          await preview(id),
          await discover(`managed_system_id=${foreignSystem}`),
        ]) {
          expect(result.statusCode).toBe(404);
          expect(result.json()).toMatchObject({ code: 'not_found.record' });
        }
      }
      if (scenario === 'archived target')
        await migrateHandle.pool.query(
          'update core.managed_systems set archived_at=now() where id=$1',
          [systemId],
        );
      if (scenario === 'cross system') {
        const other = await insertMsDirectly(appHandle, WORKSPACE_ID, uid(prefix), 'Other');
        systemIds.push(other);
        await grantCapability(
          appHandle,
          WORKSPACE_ID,
          developerId,
          'survey.manage',
          other,
          adminId,
        );
        overrides.primary_managed_system_id = other;
      }
      if (scenario === 'type mismatch') overrides.type = 'outcome';
      if (scenario === 'empty graph')
        await migrateHandle.pool.query('delete from survey.survey_questions where survey_id=$1', [
          id,
        ]);
      if (scenario === 'invalid graph')
        await migrateHandle.pool.query(
          "update survey.survey_questions set options='[]'::jsonb where survey_id=$1 and kind='single_choice'",
          [id],
        );
      if (scenario === 'malformed graph')
        await migrateHandle.pool.query(
          "update survey.survey_questions set options='{}'::jsonb where survey_id=$1 and kind='single_choice'",
          [id],
        );
      const before = await effects();
      const response = await reuse(id, selected.definition_token, overrides, randomUUID(), cookie);
      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({ code });
      expect(await effects()).toEqual(before);
    },
  );
  it.each([
    '&unknown=1',
    '&limit=51',
    '&limit=0',
    '&cursor=bad',
    `&cursor=${encodeURIComponent(Buffer.from(JSON.stringify({ created_at: '2026-02-30T00:00:00Z', id: randomUUID() })).toString('base64'))}`,
    `&cursor=${encodeURIComponent(Buffer.from(JSON.stringify({ created_at: '2026-01-01T00:00:00+99:00', id: randomUUID() })).toString('base64'))}`,
    `&cursor=${encodeURIComponent(
      Buffer.from(
        JSON.stringify({ created_at: '2026-01-01T00:00:00Z', id: randomUUID(), extra: 1 }),
      ).toString('base64'),
    )}`,
  ])('rejects malformed discovery query %s without effects', async (suffix) => {
    const before = await effects();
    const result = await discover(`managed_system_id=${systemId}${suffix}`);
    expect(result.statusCode).toBe(422);
    expect(result.json()).toMatchObject({ code: 'validation.failed' });
    expect(await effects()).toEqual(before);
  });
  it('bounds stable cursor pages across equal timestamps and excludes empty/invalid definitions', async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await source());
    const empty = await source();
    await migrateHandle.pool.query('delete from survey.survey_questions where survey_id=$1', [
      empty,
    ]);
    const invalid = await source();
    await migrateHandle.pool.query(
      "update survey.survey_questions set options='[]'::jsonb where survey_id=$1 and kind='single_choice'",
      [invalid],
    );
    await migrateHandle.pool.query(
      "update survey.surveys set created_at='2026-01-01T00:00:00.123456Z' where id=any($1::uuid[])",
      [ids],
    );
    const found: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await discover(
        `managed_system_id=${systemId}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      expect(result.statusCode).toBe(200);
      const page = surveyCopySourcesResponseSchema.parse(result.json());
      expect(page.items.length).toBeLessThanOrEqual(2);
      found.push(...page.items.map((x) => x.survey_id));
      expect(page.page.has_more).toBe(Boolean(page.page.cursor));
      cursor = page.page.cursor;
    } while (cursor);
    expect(found).toEqual([...ids].sort().reverse());
    expect(new Set(found).size).toBe(5);
    const defaultPage = surveyCopySourcesResponseSchema.parse((await discover()).json());
    expect(defaultPage.items).toHaveLength(5);
    expect((await preview(empty)).statusCode).toBe(422);
    expect((await preview(invalid)).statusCode).toBe(422);
  });
  it('copies all four kinds and remaps a child before its parent in visible order', async () => {
    const id = await source();
    const original = surveyCopySourceResponseSchema.parse((await preview(id)).json());
    const parent = original.questions[0]?.id;
    if (!parent) throw new Error('missing parent');
    await migrateHandle.pool.query('update survey.survey_questions set sort_order=1 where id=$1', [
      parent,
    ]);
    await migrateHandle.pool.query(
      "update survey.survey_questions set sort_order=0,branch_depth=1,branch_parent_question_id=$2,branch_parent_depth=0,branch_trigger_option_key='daily' where survey_id=$1 and kind='text'",
      [id, parent],
    );
    await migrateHandle.pool.query(
      "insert into survey.survey_questions(workspace_id,survey_id,kind,prompt,is_required,options,sort_order) values($1,$2,'multiple_choice','Select',true,$3::jsonb,2)",
      [
        WORKSPACE_ID,
        id,
        JSON.stringify([
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ]),
      ],
    );
    await migrateHandle.pool.query(
      "insert into survey.survey_questions(workspace_id,survey_id,kind,prompt,is_required,rating_min,rating_max,rating_low_label,rating_high_label,sort_order) values($1,$2,'rating','Rate',false,1,5,null,'High',3)",
      [WORKSPACE_ID, id],
    );
    const selected = surveyCopySourceResponseSchema.parse((await preview(id)).json());
    const result = await reuse(id, selected.definition_token);
    expect(result.statusCode).toBe(201);
    const target = surveyDtoSchema.parse(result.json());
    const graph = surveyDetailDtoSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/surveys/${target.id}`,
          headers: headers(developerCookie),
        })
      ).json(),
    ).questions;
    expect(graph.map((x) => x.kind)).toEqual([
      'text',
      'single_choice',
      'multiple_choice',
      'rating',
    ]);
    expect(graph[0]?.branch_parent_question_id).toBe(graph[1]?.id);
    expect(graph[0]?.branch_trigger_option_key).toBe('daily');
    expect(graph.map((x) => x.sort_order)).toEqual([0, 1, 2, 3]);
    for (let i = 0; i < 4; i++) {
      const {
        id: _id,
        survey_id: _survey,
        branch_parent_question_id: _parent,
        ...actual
      } = graph[i] ?? {};
      const {
        id: _source,
        branch_parent_question_id: _sourceParent,
        ...expected
      } = selected.questions[i] ?? {};
      expect(actual).toEqual(expected);
      expect(selected.questions.map((x) => x.id)).not.toContain(graph[i]?.id);
    }
    const audits = await appHandle.pool.query(
      "select detail from core.audit_log where event_type='survey_question_created' and detail->>'survey_id'=$1",
      [target.id],
    );
    expect(audits.rows).toHaveLength(4);
    expect(audits.rows.map((x) => x.detail)).toContainEqual({
      survey_id: target.id,
      question_id: graph[0]?.id,
      kind: 'text',
      branch_depth: 1,
      branch_parent_question_id: graph[1]?.id,
      sort_order: 0,
    });
    await migrateHandle.pool.query(
      "update survey.survey_questions set prompt='copy-only' where id=$1",
      [graph[0]?.id],
    );
    expect(
      surveyCopySourceResponseSchema.parse((await preview(id)).json()).questions[0]?.prompt,
    ).toBe('업무에서 가장 불편한 점은 무엇인가요?');
  });

  it('copies a protected closed Outcome without runtime data or personal-response access; new responses need their own follow-up', async () => {
    const id = await source('closed', {
      type: 'outcome',
      responses_identity_protected: true,
      starting_point: { kind: 'builtin', template_id: 'outcome-basic', version: 1 },
    });
    const selected = surveyCopySourceResponseSchema.parse((await preview(id)).json());
    const rating = selected.questions.find((q) => q.kind === 'rating')?.id;
    const text = selected.questions.find((q) => q.kind === 'text')?.id;
    if (!rating || !text) throw new Error('missing Outcome questions');
    const responseId = randomUUID();
    await migrateHandle.pool.query(
      'insert into survey.survey_responses(id,workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at) values($1,$2,$3,$4,true,now())',
      [responseId, WORKSPACE_ID, id, userId],
    );
    await migrateHandle.pool.query(
      "insert into survey.survey_response_answers(workspace_id,survey_id,response_id,question_id,answer_kind,answer_value) values($1,$2,$3,$4,'rating','1'::jsonb),($1,$2,$3,$5,'text',to_jsonb('private response'::text))",
      [WORKSPACE_ID, id, responseId, rating, text],
    );
    await migrateHandle.pool.query(
      "insert into survey.survey_response_excerpt_approvals(workspace_id,survey_id,response_id,question_id,redacted_excerpt,approved_by) values($1,$2,$3,$4,'Approved private excerpt',$5)",
      [WORKSPACE_ID, id, responseId, text, adminId],
    );
    await migrateHandle.pool.query(
      "insert into survey.outcome_follow_up_decisions(workspace_id,survey_id,response_id,managed_system_id,state,reason,decided_by_actor_id) values($1,$2,$3,$4,'no_follow_up','Already handled',$5)",
      [WORKSPACE_ID, id, responseId, systemId, adminId],
    );
    // #739: a Survey-sourced Finding keeps its response binding only in the protected
    // table; the public row carries no source_id and the deferred check needs both rows.
    const bindingClient = await migrateHandle.pool.connect();
    let finding: { rows: Array<{ id: string }> };
    try {
      await bindingClient.query('begin');
      finding = await bindingClient.query<{ id: string }>(
        "insert into finding.findings(workspace_id,display_id,primary_managed_system_id,title,summary,source_type,source_id,severity,status,created_by) values($1,core.next_display_id($1::uuid,'finding'),$2,'Historic Finding','summary','survey_response',null,'medium','active',$3) returning id",
        [WORKSPACE_ID, systemId, adminId],
      );
      await bindingClient.query(
        "insert into survey.finding_response_bindings(workspace_id,finding_id,response_id,historical_generated_title,historical_generated_summary) values($1,$2,$3,'Historic Finding','summary')",
        [WORKSPACE_ID, finding.rows[0]?.id, responseId],
      );
      await bindingClient.query('commit');
    } catch (error) {
      await bindingClient.query('rollback');
      throw error;
    } finally {
      bindingClient.release();
    }
    await migrateHandle.pool.query(
      "insert into core.entity_links(workspace_id,source_type,source_id,target_type,target_id,relation_type,visibility,status,managed_system_id,created_by) values($1,'survey_response',$2,'finding',$3,'generated_finding','internal_only','active',$4,$5)",
      [WORKSPACE_ID, responseId, finding.rows[0]?.id, systemId, adminId],
    );
    await denyCapability(
      appHandle,
      WORKSPACE_ID,
      developerId,
      'survey.read_personal_responses',
      systemId,
      adminId,
    );
    async function runtime(surveyId: string) {
      const result = await migrateHandle.pool.query(
        `select
        (select count(*)::int from survey.survey_responses where survey_id=$1) as responses,
        (select count(*)::int from survey.survey_response_answers where survey_id=$1) as answers,
        (select count(*)::int from survey.survey_response_excerpt_approvals where survey_id=$1) as approvals,
        (select count(*)::int from survey.outcome_follow_up_decisions where survey_id=$1) as decisions,
        (select count(*)::int from core.entity_links where source_id=$1 or target_id=$1 or source_id in (select id from survey.survey_responses where survey_id=$1)) as links`,
        [surveyId],
      );
      return result.rows[0];
    }
    const before = await runtime(id);
    expect(before).toEqual({ responses: 1, answers: 2, approvals: 1, decisions: 1, links: 1 });
    const freshPreview = surveyCopySourceResponseSchema.parse((await preview(id)).json());
    expect(freshPreview).toEqual(selected);
    const response = await reuse(id, selected.definition_token, {
      type: 'outcome',
      responses_identity_protected: false,
    });
    expect(response.statusCode).toBe(201);
    const target = surveyDtoSchema.parse(response.json());
    expect(target.operator_actor_id).toBe(developerId);
    expect(target.created_by).toBe(developerId);
    expect(target.responses_identity_protected).toBe(false);
    expect(target.analytics_area_id).toBeNull();
    expect(target.opened_at).toBeNull();
    expect(target.closed_at).toBeNull();
    expect(await runtime(target.id)).toEqual({
      responses: 0,
      answers: 0,
      approvals: 0,
      decisions: 0,
      links: 0,
    });
    expect(await runtime(id)).toEqual(before);
    const personal = await app.inject({
      method: 'GET',
      url: `/surveys/${id}/outcome-follow-up`,
      headers: headers(developerCookie),
    });
    expect(personal.statusCode).toBe(200);
    expect(personal.json()).toMatchObject({ personal_access: false, items: null });
    const graph = surveyDetailDtoSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/surveys/${target.id}`,
          headers: headers(developerCookie),
        })
      ).json(),
    ).questions;
    const newRating = graph.find((q) => q.kind === 'rating')?.id;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/surveys/${target.id}/open`,
          headers: { ...headers(developerCookie), 'idempotency-key': trackedKey() },
        })
      ).statusCode,
    ).toBe(200);
    const respondents = [
      { id: adminId, cookie: adminCookie },
      { id: developerId, cookie: developerCookie },
      { id: userId, cookie: userCookie },
    ];
    for (let index = 0; index < 2; index++) {
      const externalId = uid(prefix);
      const actor = await insertActorRow(appHandle, {
        workspaceId: WORKSPACE_ID,
        externalId,
        roleLevel: 'user',
      });
      actorIds.push(actor.id);
      respondents.push({ id: actor.id, cookie: await loginAs(app, externalId) });
    }
    for (const [index, respondent] of respondents.entries()) {
      const submission = await app.inject({
        method: 'POST',
        url: `/surveys/${target.id}/responses`,
        headers: { ...headers(respondent.cookie), 'idempotency-key': trackedKey() },
        payload: { answers: [{ question_id: newRating, value: index === 0 ? 1 : 5 }] },
      });
      expect(submission.statusCode).toBe(201);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/surveys/${target.id}/close`,
          headers: { ...headers(developerCookie), 'idempotency-key': trackedKey() },
        })
      ).statusCode,
    ).toBe(200);
    const followup = await app.inject({
      method: 'GET',
      url: `/surveys/${target.id}/outcome-follow-up`,
      headers: headers(developerCookie),
    });
    expect(followup.statusCode).toBe(200);
    expect(followup.json()).toMatchObject({
      classifiable: true,
      follow_up_needed: true,
      personal_access: false,
      items: null,
    });
    expect((await runtime(target.id))?.decisions).toBe(0);
    expect(await runtime(id)).toEqual(before);
  });

  it.each([
    ['User', 404, 'not_found.record'],
    ['read only', 403, 'permission.denied'],
    ['read deny', 404, 'not_found.record'],
    ['manage deny', 403, 'permission.denied'],
    ['Admin read deny', 404, 'not_found.record'],
    ['Admin manage deny', 403, 'permission.denied'],
    ['archived', 409, 'conflict.parent_archived'],
  ] as const)(
    '%s cannot enumerate source metadata or preview content',
    async (scenario, status, code) => {
      const id = await source();
      let cookie = developerCookie;
      if (scenario === 'User') cookie = userCookie;
      if (scenario === 'read only')
        await migrateHandle.pool.query(
          "update permission.permission_grants set revoked_at=now(),revoked_by_actor_id=$3,revoked_reason='test' where actor_id=$1 and managed_system_id=$2 and capability='survey.manage'",
          [developerId, systemId, adminId],
        );
      if (scenario.includes('deny')) {
        const actor = scenario.startsWith('Admin') ? adminId : developerId;
        if (actor === adminId) cookie = adminCookie;
        await denyCapability(
          appHandle,
          WORKSPACE_ID,
          actor,
          scenario.includes('read') ? 'survey.read' : 'survey.manage',
          systemId,
          adminId,
        );
      }
      if (scenario === 'archived')
        await migrateHandle.pool.query(
          'update core.managed_systems set archived_at=now() where id=$1',
          [systemId],
        );
      const before = await effects();
      for (const response of [
        await discover(`managed_system_id=${systemId}`, cookie),
        await preview(id, cookie),
      ]) {
        expect(response.statusCode).toBe(status);
        expect(response.json()).toMatchObject({ code });
        expect(response.body).not.toContain('New operator title');
      }
      expect(await effects()).toEqual(before);
    },
  );
  it('requires session and matching Workspace and rejects unknown selected-source query fields', async () => {
    const id = await source();
    const before = await effects();
    const foreignWorkspace = randomUUID();
    foreignWorkspaceIds.push(foreignWorkspace);
    await migrateHandle.pool.query('insert into core.workspaces(id,name) values($1,$2)', [
      foreignWorkspace,
      'Foreign session WS',
    ]);
    for (const url of [
      `/surveys/copy-sources?managed_system_id=${systemId}`,
      `/surveys/${id}/copy-source`,
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
      await migrateHandle.pool.query('update core.sessions set workspace_id=$1 where id=$2', [
        foreignWorkspace,
        userCookie,
      ]);
      try {
        const mismatch = await app.inject({ method: 'GET', url, headers: headers(userCookie) });
        expect(mismatch.statusCode).toBe(403);
        expect(mismatch.json()).toMatchObject({ code: 'auth.workspace_mismatch' });
      } finally {
        await migrateHandle.pool.query('update core.sessions set workspace_id=$1 where id=$2', [
          WORKSPACE_ID,
          userCookie,
        ]);
      }
    }
    const unknown = await app.inject({
      method: 'GET',
      url: `/surveys/${id}/copy-source?unknown=1`,
      headers: headers(developerCookie),
    });
    expect(unknown.statusCode).toBe(422);
    expect(await effects()).toEqual(before);
  });
  it('rejects a concurrent locked multi-question edit instead of copying a mixed graph', async () => {
    const id = await source();
    const selected = surveyCopySourceResponseSchema.parse((await preview(id)).json());
    const before = await effects();
    const writer = await migrateHandle.pool.connect();
    let attempt: ReturnType<typeof reuse> | undefined;
    try {
      await writer.query('begin');
      await writer.query('select id from survey.surveys where id=$1 for update', [id]);
      await writer.query(
        "update survey.survey_questions set prompt='first committed edit' where id=$1",
        [selected.questions[0]?.id],
      );
      attempt = reuse(id, selected.definition_token);
      await writer.query(
        "update survey.survey_questions set prompt='second committed edit' where id=$1",
        [selected.questions[1]?.id],
      );
      await writer.query('commit');
      const response = await attempt;
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'conflict.stale_write' });
      expect(await effects()).toEqual(before);
    } finally {
      await writer.query('rollback');
      writer.release();
      if (attempt) await attempt;
    }
  });
  it('rolls back a real copied-question constraint failure and retries the same key', async () => {
    const id = await source();
    const selected = surveyCopySourceResponseSchema.parse((await preview(id)).json());
    const key = randomUUID();
    const before = await effects();
    const constraint = `it_reuse_${randomUUID().replaceAll('-', '')}`;
    await migrateHandle.pool.query(
      `alter table survey.survey_questions add constraint ${constraint} check (survey_id='${id}'::uuid or workspace_id<>'${WORKSPACE_ID}'::uuid or prompt<>'업무에서 가장 불편한 점은 무엇인가요?') not valid`,
    );
    try {
      const response = await reuse(id, selected.definition_token, {}, key);
      expect(response.statusCode).toBe(500);
      expect(await effects()).toEqual(before);
    } finally {
      await migrateHandle.pool.query(
        `alter table survey.survey_questions drop constraint ${constraint}`,
      );
    }
    expect((await reuse(id, selected.definition_token, {}, key)).statusCode).toBe(201);
  });

  it('uses default 20 and maximum 50 page bounds and searches metadata within the selected system', async () => {
    await migrateHandle.pool.query(
      `with sources as (
      insert into survey.surveys(workspace_id,display_id,type,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,created_at)
      select $1,'SRV-reuse-'||n,'discovery','Searchable '||n,$2,$3,false,$3,'2026-01-01T00:00:00Z'::timestamptz
      from generate_series(1,53) n returning id,workspace_id
    ) insert into survey.survey_questions(workspace_id,survey_id,kind,prompt,sort_order) select workspace_id,id,'text','Prompt',0 from sources`,
      [WORKSPACE_ID, systemId, adminId],
    );
    const defaultPage = surveyCopySourcesResponseSchema.parse((await discover()).json());
    expect(defaultPage.items).toHaveLength(20);
    expect(defaultPage.page.has_more).toBe(true);
    const maximum = surveyCopySourcesResponseSchema.parse(
      (await discover(`managed_system_id=${systemId}&limit=50`)).json(),
    );
    expect(maximum.items).toHaveLength(50);
    expect(maximum.page.has_more).toBe(true);
    const tail = surveyCopySourcesResponseSchema.parse(
      (
        await discover(
          `managed_system_id=${systemId}&limit=50&cursor=${encodeURIComponent(maximum.page.cursor ?? '')}`,
        )
      ).json(),
    );
    expect(tail.items).toHaveLength(3);
    expect(tail.page).toEqual({ has_more: false });
    expect(new Set([...maximum.items, ...tail.items].map((x) => x.survey_id)).size).toBe(53);
    const search = surveyCopySourcesResponseSchema.parse(
      (
        await discover(`managed_system_id=${systemId}&q=${encodeURIComponent('Searchable 53')}`)
      ).json(),
    );
    expect(search.items.map((x) => x.title)).toEqual(['Searchable 53']);
    const literal = surveyCopySourcesResponseSchema.parse(
      (await discover(`managed_system_id=${systemId}&q=%25`)).json(),
    );
    expect(literal.items).toEqual([]);
  });
});
