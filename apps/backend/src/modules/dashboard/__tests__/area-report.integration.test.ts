import { type DashboardAreaReport, dashboardAreaReportSchema } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow, insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { randomUUID, uid } from '../../../test-support/ids.js';
import { denyCapability, grantCapability } from '../../../test-support/permissions-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { insertSurveyFindingFixture } from '../../../test-support/survey-finding-fixtures.js';
import { insertTaskRow } from '../../../test-support/task-fixtures.js';
import { insertVocDirectly } from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE = process.env.WORKSPACE_ID ?? '';
const prefix = 'area-report-1078';
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing Area report fixture');
  return value;
}

describe.skipIf(!(APP_URL && MIGRATE_URL && WORKSPACE))('GET /dashboard/analytics-areas', () => {
  let db: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let admin: string;
  let actor: string;
  const systems: string[] = [];
  const actors: string[] = [];
  const workspaces: string[] = [];
  const headers = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  async function get(cookie = admin, query = '') {
    return app.inject({
      method: 'GET',
      url: `/dashboard/analytics-areas?${query}`,
      headers: headers(cookie),
    });
  }
  async function report(cookie = admin, query = ''): Promise<DashboardAreaReport> {
    const response = await get(cookie, query);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-cache');
    return dashboardAreaReportSchema.parse(response.json());
  }
  async function system() {
    const id = await insertMsDirectly(migrate, WORKSPACE, uid(prefix), 'Area report system');
    systems.push(id);
    return id;
  }
  async function area(ms: string, name = 'Same name') {
    const result = await migrate.pool.query<{ id: string }>(
      'insert into core.analytics_areas(workspace_id,managed_system_id,slug,name) values($1,$2,$3,$4) returning id',
      [WORKSPACE, ms, uid(prefix), name],
    );
    return required(result.rows[0]).id;
  }
  async function developer(capabilities: string[], ms: string | null) {
    const dev = await insertDevActor(migrate, WORKSPACE, uid(prefix));
    actors.push(dev.id);
    for (const capability of capabilities)
      await grantCapability(migrate, WORKSPACE, dev.id, capability, ms, actor);
    return { ...dev, cookie: await loginAs(app, dev.externalId) };
  }
  async function link(
    ms: string,
    sourceType: string,
    sourceId: string,
    targetType: string,
    targetId: string,
    relation: string,
  ) {
    await migrate.pool.query(
      `insert into core.entity_links(workspace_id,managed_system_id,source_type,source_id,target_type,target_id,relation_type,created_by)
       values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [WORKSPACE, ms, sourceType, sourceId, targetType, targetId, relation, actor],
    );
  }
  async function survey(
    ms: string,
    aa: string | null,
    ratings: number[] = [],
    status = 'closed',
    resolution?: 'active' | 'not_actionable' | 'no_follow_up',
  ) {
    const id = required(
      (
        await migrate.pool.query<{ id: string }>(
          `insert into survey.surveys(workspace_id,display_id,type,status,title,primary_managed_system_id,analytics_area_id,operator_actor_id,created_by,responses_identity_protected,opened_at,closed_at)
       values($1,core.next_display_id($1,'survey'),'outcome',$2,$3,$4,$5,$6,$6,true,now(),case when $2='closed' then now() else null end) returning id`,
          [WORKSPACE, status, prefix, ms, aa, actor],
        )
      ).rows[0],
    ).id;
    if (!ratings.length) return id;
    const question = required(
      (
        await migrate.pool.query<{ id: string }>(
          `insert into survey.survey_questions(workspace_id,survey_id,kind,prompt,rating_min,rating_max,sort_order,branch_depth)
       values($1,$2,'rating','Outcome',1,5,0,0) returning id`,
          [WORKSPACE, id],
        )
      ).rows[0],
    ).id;
    for (const rating of ratings) {
      const respondent = await insertActorRow(migrate, {
        workspaceId: WORKSPACE,
        externalId: uid(prefix),
        roleLevel: 'user',
      });
      actors.push(respondent.id);
      const response = required(
        (
          await migrate.pool.query<{ id: string }>(
            'insert into survey.survey_responses(workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at) values($1,$2,$3,true,now()) returning id',
            [WORKSPACE, id, respondent.id],
          )
        ).rows[0],
      ).id;
      await migrate.pool.query(
        `insert into survey.survey_response_answers(workspace_id,survey_id,response_id,question_id,answer_kind,answer_value) values($1,$2,$3,$4,'rating',$5::jsonb)`,
        [WORKSPACE, id, response, question, JSON.stringify(rating)],
      );
      if (rating > 2 || !resolution) continue;
      if (resolution === 'no_follow_up') {
        await migrate.pool.query(
          `insert into survey.outcome_follow_up_decisions(workspace_id,survey_id,response_id,managed_system_id,state,reason,decided_by_actor_id)
          values($1,$2,$3,$4,'no_follow_up','Handled',$5)`,
          [WORKSPACE, id, response, ms, actor],
        );
      } else {
        const finding = required(
          (
            await insertSurveyFindingFixture<{ id: string }>(
              migrate,
              response,
              `insert into finding.findings(workspace_id,display_id,primary_managed_system_id,title,summary,source_type,source_id,severity,status,created_by)
           values($1,core.next_display_id($1,'finding'),$2,'Follow-up','Safe summary','survey_response',null,'medium',$3,$4) returning id`,
              [WORKSPACE, ms, resolution, actor],
            )
          ).rows[0],
        ).id;
        await link(ms, 'survey_response', response, 'finding', finding, 'generated_finding');
      }
    }
    return id;
  }
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    admin = await loginAs(app, 'mock-admin-1');
    actor = required(
      (
        await migrate.pool.query<{ id: string }>(
          "select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'",
          [WORKSPACE],
        )
      ).rows[0],
    ).id;
  });
  beforeEach(async () => {
    await migrate.pool.query(
      "delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'",
      [WORKSPACE],
    );
  });
  afterAll(async () => {
    if (migrate) {
      await migrate.pool.query(
        'delete from core.entity_links where managed_system_id=any($1::uuid[])',
        [systems],
      );
      await migrate.pool.query(
        'delete from finding.findings where primary_managed_system_id=any($1::uuid[])',
        [systems],
      );
      for (const table of [
        'outcome_follow_up_decisions',
        'survey_response_answers',
        'survey_responses',
        'survey_questions',
      ])
        await migrate.pool.query(
          `delete from survey.${table} where survey_id in(select id from survey.surveys where primary_managed_system_id=any($1::uuid[]))`,
          [systems],
        );
      await migrate.pool.query(
        'delete from survey.surveys where primary_managed_system_id=any($1::uuid[])',
        [systems],
      );
      await migrate.pool.query(
        'delete from task.tasks where primary_managed_system_id=any($1::uuid[])',
        [systems],
      );
      await migrate.pool.query(
        'delete from finding.findings where primary_managed_system_id=any($1::uuid[])',
        [systems],
      );
      await migrate.pool.query(
        'delete from voc.vocs where primary_managed_system_id=any($1::uuid[])',
        [systems],
      );
      for (const table of ['permission_grants', 'permission_denies'])
        await migrate.pool.query(
          `delete from permission.${table} where actor_id=any($1::uuid[]) or managed_system_id=any($2::uuid[])`,
          [actors, systems],
        );
      await migrate.pool.query(
        'delete from core.analytics_areas where managed_system_id=any($1::uuid[])',
        [systems],
      );
      await deleteRecoveryFixtureParents(
        migrate,
        'delete from core.managed_systems where id=any($1::uuid[])',
        [systems],
      );
      for (const table of ['sessions', 'audit_log', 'idempotency_keys', 'notifications'])
        await migrate.pool.query(`delete from core.${table} where actor_id=any($1::uuid[])`, [
          actors,
        ]);
      await migrate.pool.query('delete from core.actors where id=any($1::uuid[])', [actors]);
      for (const workspace of workspaces)
        await deleteRecoveryFixtureParents(migrate, 'delete from core.workspaces where id=$1', [
          workspace,
        ]);
    }
    await app?.close();
    await db?.close();
    await migrate?.close();
  });

  it('distinguishes authorized empty Surveys from explicit Admin deny without audit or source writes', async () => {
    const ms = await system();
    await insertTaskRow(migrate, {
      workspaceId: WORKSPACE,
      primaryManagedSystemId: ms,
      createdBy: actor,
    });
    const before = (
      await migrate.pool.query(
        'select (select count(*) from core.audit_log) audit, (select jsonb_agg(to_jsonb(t) order by id) from task.tasks t) tasks, (select jsonb_agg(to_jsonb(v) order by id) from voc.vocs v) vocs, (select jsonb_agg(to_jsonb(f) order by id) from finding.findings f) findings, (select jsonb_agg(to_jsonb(s) order by id) from survey.surveys s) surveys, (select count(*) from core.entity_links) links',
      )
    ).rows;
    const result = await report(admin, `managed_system_id=${ms}`);
    expect(result.items[0]?.survey).toEqual({ open: { count: 0 }, follow_up_needed: { count: 0 } });
    expect(result.classification_context[0]?.survey).toEqual({ classified: 0, total: 0 });
    expect(
      (
        await migrate.pool.query(
          'select (select count(*) from core.audit_log) audit, (select jsonb_agg(to_jsonb(t) order by id) from task.tasks t) tasks, (select jsonb_agg(to_jsonb(v) order by id) from voc.vocs v) vocs, (select jsonb_agg(to_jsonb(f) order by id) from finding.findings f) findings, (select jsonb_agg(to_jsonb(s) order by id) from survey.surveys s) surveys, (select count(*) from core.entity_links) links',
        )
      ).rows,
    ).toEqual(before);
    await denyCapability(migrate, WORKSPACE, actor, 'survey.read', ms, actor);
    const denied = await report(admin, `managed_system_id=${ms}`);
    expect(denied.items[0]).not.toHaveProperty('survey');
    expect(denied.classification_context[0]).not.toHaveProperty('survey');
    expect(denied.items[0]).toHaveProperty('task');
  });

  it.each([
    ['voc.read', 'voc'],
    ['finding.read', 'finding'],
    ['finding.manage', 'task'],
    ['survey.read', 'survey'],
  ] as const)(
    'limits %s actors to their own group and exact list population',
    async (capability, domain) => {
      const ms = await system();
      const aa = await area(ms);
      const voc = await insertVocDirectly(migrate, WORKSPACE, ms, actor, prefix);
      await insertFindingRow(migrate, {
        workspaceId: WORKSPACE,
        primaryManagedSystemId: ms,
        sourceId: voc.id,
        analyticsAreaId: aa,
        createdBy: actor,
        status: 'active',
      });
      await insertTaskRow(migrate, {
        workspaceId: WORKSPACE,
        primaryManagedSystemId: ms,
        analyticsAreaId: aa,
        createdBy: actor,
      });
      await migrate.pool.query(
        "insert into survey.surveys(workspace_id,display_id,type,status,title,primary_managed_system_id,analytics_area_id,operator_actor_id,created_by,opened_at) values($1,core.next_display_id($1,'survey'),'discovery','open',$2,$3,$4,$5,$5,now())",
        [WORKSPACE, prefix, ms, aa, actor],
      );
      const dev = await developer([capability], ms);
      const body = await report(dev.cookie, `managed_system_id=${ms}`);
      expect(body.items.length).toBeGreaterThan(0);
      for (const row of body.items)
        for (const key of ['voc', 'finding', 'task', 'survey'])
          expect(Object.hasOwn(row, key), key).toBe(key === domain);
      if (domain === 'task') {
        expect(body.items[0]?.task).not.toHaveProperty('released_update');
        expect(body.items[0]?.task).not.toHaveProperty('public_update_missing');
        expect(body.items[0]?.task).not.toHaveProperty('reporter_update_needed');
      }
      const path = {
        voc: '/vocs?view=inbox&',
        finding: '/findings?',
        task: '/tasks?',
        survey: '/surveys?',
      }[domain];
      const list = await app.inject({
        method: 'GET',
        url: `${path}managed_system_id=${ms}`,
        headers: headers(dev.cookie),
      });
      expect(list.statusCode, list.body).toBe(200);
      expect(body.classification_context[0]?.[domain]?.total).toBe(
        (Array.isArray(list.json()) ? list.json() : list.json().items).length,
      );
    },
  );

  it('keeps non-VOC attribution, archive names, context and ordered keyset pages independent of Area selection', async () => {
    const ms = await system();
    const aa = await area(ms);
    for (const analyticsAreaId of [aa, null])
      await insertTaskRow(migrate, {
        workspaceId: WORKSPACE,
        primaryManagedSystemId: ms,
        createdBy: actor,
        analyticsAreaId,
      });
    await migrate.pool.query('update core.analytics_areas set archived_at=now() where id=$1', [aa]);
    await migrate.pool.query('update core.managed_systems set archived_at=now() where id=$1', [ms]);
    const full = await report(admin, `managed_system_id=${ms}`);
    expect(full.items.map((row) => row.analytics_area_id)).toEqual([aa, null]);
    expect(full.items[0]).toMatchObject({
      analytics_area_name: 'Same name',
      analytics_area_archived: true,
      managed_system_name: 'Area report system',
      managed_system_archived: true,
    });
    const first = await report(admin, `managed_system_id=${ms}&limit=1`);
    const second = await report(
      admin,
      `managed_system_id=${ms}&limit=1&cursor=${first.page.cursor}`,
    );
    expect([...first.items, ...second.items]).toEqual(full.items);
    expect(second.page.has_more).toBe(false);
    const selected = await report(admin, `managed_system_id=${ms}&analytics_area_id=unset&limit=1`);
    expect(selected.classification_context).toEqual(full.classification_context);
    expect(full.classification_context[0]?.task).toEqual({ classified: 1, total: 2 });
    for (const query of [
      `managed_system_id=${ms}&cursor=bad`,
      `managed_system_id=${ms}&analytics_area_id=unset&cursor=${first.page.cursor}`,
    ]) {
      const bad = await get(admin, query);
      expect(bad.statusCode).toBe(422);
      expect(bad.json()).toMatchObject({
        code: 'validation.failed',
        detail: { fields: [{ path: ['cursor'], code: 'invalid_cursor' }] },
      });
    }
    const date = (
      await migrate.pool.query("select (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text date")
    ).rows[0].date;
    expect(full.as_of_date).toBe(date);
    expect(full.items[0]?.task?.by_status.backlog.link).toEqual({
      pathname: '/tasks',
      search: {
        view: 'backlog',
        status: 'backlog',
        managedSystem: ms,
        'filter.analytics_area': aa,
      },
    });
  });
  it.each(['area', 'system', 'both'] as const)(
    'normalizes uppercase %s UUID filters for rows, context and cursor binding',
    async (uppercase) => {
      const ms = await system();
      const aa = await area(ms);
      for (const analyticsAreaId of [aa, null])
        await insertTaskRow(migrate, {
          workspaceId: WORKSPACE,
          primaryManagedSystemId: ms,
          createdBy: actor,
          analyticsAreaId,
        });
      const canonical = await report(admin, `managed_system_id=${ms}&analytics_area_id=${aa}`);
      const systemId = uppercase === 'area' ? ms : ms.toUpperCase();
      const areaId = uppercase === 'system' ? aa : aa.toUpperCase();
      const selected = await report(
        admin,
        `managed_system_id=${systemId}&analytics_area_id=${areaId}`,
      );
      expect(selected.items).toEqual(canonical.items);
      expect(selected.classification_context).toEqual(canonical.classification_context);
      const first = await report(admin, `managed_system_id=${ms.toUpperCase()}&limit=1`);
      const second = await report(
        admin,
        `managed_system_id=${ms}&limit=1&cursor=${first.page.cursor}`,
      );
      expect(first.items).toEqual(canonical.items);
      expect(second.items.map((row) => row.analytics_area_id)).toEqual([null]);
      expect(second.classification_context).toEqual(canonical.classification_context);
      expect(second.page.has_more).toBe(false);
    },
  );
  it('reconciles every positive metric with its actual destination, deduplicates links and moves only reclassified sources', async () => {
    const ms = await system();
    const aa = await area(ms);
    const bb = await area(ms);
    const vocs = [];
    for (let n = 0; n < 3; n++) {
      const voc = await insertVocDirectly(migrate, WORKSPACE, ms, actor, prefix, {
        severity: 'high',
      });
      vocs.push(voc.id);
      await migrate.pool.query('update voc.vocs set analytics_area_id=$1 where id=$2', [
        aa,
        voc.id,
      ]);
    }
    const finding = await insertFindingRow(migrate, {
      workspaceId: WORKSPACE,
      primaryManagedSystemId: ms,
      sourceId: required(vocs[0]),
      status: 'active',
      analyticsAreaId: aa,
      createdBy: actor,
    });
    const findingLinked = await insertFindingRow(migrate, {
      workspaceId: WORKSPACE,
      primaryManagedSystemId: ms,
      sourceId: required(vocs[0]),
      status: 'active',
      analyticsAreaId: aa,
      createdBy: actor,
    });
    const date = required(
      (
        await migrate.pool.query<{ yesterday: string; today: string }>(
          "select ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 1)::text yesterday, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text today",
        )
      ).rows[0],
    );
    const taskIds = new Map<string, string>();
    for (const status of [
      'backlog',
      'todo',
      'doing',
      'review',
      'done',
      'released',
      'reopened',
    ] as const) {
      const task = await insertTaskRow(migrate, {
        workspaceId: WORKSPACE,
        primaryManagedSystemId: ms,
        status,
        dueDate: date.yesterday,
        analyticsAreaId: aa,
        createdBy: actor,
      });
      taskIds.set(status, task.id);
    }
    await insertTaskRow(migrate, {
      workspaceId: WORKSPACE,
      primaryManagedSystemId: ms,
      status: 'todo',
      dueDate: date.today,
      analyticsAreaId: aa,
      createdBy: actor,
    });
    await insertTaskRow(migrate, {
      workspaceId: WORKSPACE,
      primaryManagedSystemId: ms,
      status: 'todo',
      analyticsAreaId: aa,
      createdBy: actor,
    });
    const released = required(taskIds.get('released'));
    await link(ms, 'voc', required(vocs[0]), 'task', released, 'evidence_of');
    await link(ms, 'voc', required(vocs[1]), 'task', released, 'evidence_of');
    await link(ms, 'finding', findingLinked.id, 'task', released, 'requested_task');
    await link(
      ms,
      'finding',
      findingLinked.id,
      'task',
      required(taskIds.get('done')),
      'requested_task',
    );
    await survey(ms, aa, [], 'open');
    await migrate.pool.query(
      `insert into voc.voc_public_updates(voc_id,actor_id,body_rich_content,reporter_facing_status_before,reporter_facing_status_after,skip_public_update,skip_reason)
      values($1,$2,null,'received','reviewing',true,'No public message required')`,
      [vocs[1], actor],
    );
    const body = await report(admin, `managed_system_id=${ms}`);
    const row = required(body.items[0]);
    expect(row.task?.overdue.count).toBe(5);
    expect(row.task?.released_update).toMatchObject({ value: 0, total: 1 });
    expect(row.task?.public_update_missing?.count).toBe(1);
    expect(row.task?.reporter_update_needed?.count).toBe(1);
    expect(row.finding?.execution).toMatchObject({ value: 1, total: 2 });
    // Every emitted positive link must explain its exact count through the real owner list.
    async function reconcile(value: unknown): Promise<void> {
      if (!value || typeof value !== 'object') return;
      const cell = value as {
        count?: number;
        value?: number;
        total?: number;
        link?: { pathname: string; search: Record<string, string> };
      };
      if (cell.link) {
        const params = new URLSearchParams();
        for (const [key, v] of Object.entries(cell.link.search)) {
          if (key === 'view' && cell.link.pathname !== '/vocs') continue;
          params.set(
            key === 'managedSystem'
              ? 'managed_system_id'
              : key === 'filter.analytics_area' && cell.link.pathname !== '/vocs'
                ? 'analytics_area_id'
                : key,
            v,
          );
        }
        const response = await app.inject({
          method: 'GET',
          url: `${cell.link.pathname}?${params}`,
          headers: headers(admin),
        });
        expect(response.statusCode, response.body).toBe(200);
        const payload = response.json();
        const items = Array.isArray(payload) ? payload : payload.items;
        expect(items.length, `${cell.link.pathname}?${params}`).toBe(
          cell.count ?? required(cell.total) - required(cell.value),
        );
      }
      for (const [key, child] of Object.entries(value)) if (key !== 'link') await reconcile(child);
    }
    await reconcile(row);
    await migrate.pool.query('update finding.findings set analytics_area_id=$1 where id=$2', [
      bb,
      finding.id,
    ]);
    const moved = await report(admin, `managed_system_id=${ms}`);
    expect(moved.items.find((r) => r.analytics_area_id === bb)?.finding?.active.count).toBe(1);
    expect(moved.items.find((r) => r.analytics_area_id === aa)?.voc).toEqual(row.voc);
    expect(moved.items.find((r) => r.analytics_area_id === aa)?.task).toEqual(row.task);
    expect(moved.classification_context).toEqual(body.classification_context);
    await migrate.pool.query(
      `insert into voc.voc_public_updates(voc_id,actor_id,body_rich_content,reporter_facing_status_before,reporter_facing_status_after,skip_public_update)
      values($1,$2,'{"type":"doc","content":[]}'::jsonb,'received','received',false)`,
      [vocs[0], actor],
    );
    const updated = await report(admin, `managed_system_id=${ms}`);
    expect(updated.items.find((r) => r.analytics_area_id === aa)?.task?.released_update).toEqual({
      value: 1,
      total: 1,
    });
    await migrate.pool.query('delete from voc.voc_public_updates where voc_id=any($1::uuid[])', [
      vocs,
    ]);
  });

  it('applies thresholded Survey follow-up state once per Survey with no personal fields', async () => {
    const ms = await system();
    const aa = await area(ms);
    const threshold = required(
      (
        await migrate.pool.query<{ threshold: number }>(
          'select coalesce((select survey_anonymity_threshold from core.workspace_settings where workspace_id=$1),5)::int threshold',
          [WORKSPACE],
        )
      ).rows[0],
    ).threshold;
    const ratings = [1, ...Array<number>(threshold - 1).fill(5)];
    await survey(ms, aa, Array<number>(threshold).fill(1));
    await survey(ms, aa, ratings.slice(0, threshold - 1));
    await survey(ms, aa, ratings, 'open');
    await survey(ms, aa, Array<number>(threshold).fill(5));
    await survey(ms, aa, ratings, 'closed', 'active');
    await survey(ms, aa, ratings, 'closed', 'not_actionable');
    await survey(ms, aa, ratings, 'closed', 'no_follow_up');
    const dev = await developer(['survey.read', 'survey.read_personal_responses'], ms);
    const auditBefore = (await migrate.pool.query('select count(*) total from core.audit_log'))
      .rows;
    for (const cookie of [admin, dev.cookie]) {
      const body = await report(cookie, `managed_system_id=${ms}`);
      const group = required(body.items.find((row) => row.analytics_area_id === aa)?.survey);
      expect(group.open.count).toBe(1);
      expect(group.follow_up_needed.count).toBe(2);
      expect(Object.keys(group).sort()).toEqual(['follow_up_needed', 'open']);
      const destination = await app.inject({
        method: 'GET',
        url: `/surveys?managed_system_id=${ms}&analytics_area_id=${aa}&follow_up=needed`,
        headers: headers(cookie),
      });
      expect(destination.statusCode, destination.body).toBe(200);
      expect(destination.json()).toHaveLength(2);
    }
    expect((await migrate.pool.query('select count(*) total from core.audit_log')).rows).toEqual(
      auditBefore,
    );
  });

  it('shares list point scope for workspace grants, scoped denies and archived systems, binding cursors to scope changes', async () => {
    const allowed = await system();
    const denied = await system();
    for (const ms of [allowed, denied]) {
      const aa = await area(ms);
      for (const analyticsAreaId of [aa, null]) {
        await insertTaskRow(migrate, {
          workspaceId: WORKSPACE,
          primaryManagedSystemId: ms,
          createdBy: actor,
          analyticsAreaId,
        });
        await insertFindingRow(migrate, {
          workspaceId: WORKSPACE,
          primaryManagedSystemId: ms,
          createdBy: actor,
          sourceId: randomUUID(),
          analyticsAreaId,
          status: 'active',
        });
      }
    }
    await migrate.pool.query('update core.managed_systems set archived_at=now() where id=$1', [
      allowed,
    ]);
    const dev = await developer(['finding.read', 'finding.manage'], null);
    for (const capability of ['finding.read', 'finding.manage'])
      await denyCapability(migrate, WORKSPACE, dev.id, capability, denied, actor);
    const first = await report(dev.cookie, `managed_system_id=${allowed}&limit=1`);
    expect(first.items[0]?.managed_system_archived).toBe(true);
    const full = await report(dev.cookie, `managed_system_id=${allowed}`);
    expect(full.items).toHaveLength(2);
    for (const [route, domain] of [
      ['/tasks', 'task'],
      ['/findings', 'finding'],
    ] as const) {
      const list = await app.inject({
        method: 'GET',
        url: `${route}?managed_system_id=${allowed}`,
        headers: headers(dev.cookie),
      });
      expect(list.statusCode, list.body).toBe(200);
      expect(full.classification_context[0]?.[domain]?.total).toBe(list.json().items.length);
    }
    expect((await report(dev.cookie, `managed_system_id=${denied}`)).items).toEqual([]);
    await denyCapability(migrate, WORKSPACE, dev.id, 'finding.read', allowed, actor);
    const stale = await get(
      dev.cookie,
      `managed_system_id=${allowed}&limit=1&cursor=${first.page.cursor}`,
    );
    expect(stale.statusCode).toBe(422);
    expect(stale.body).toContain('invalid_cursor');
  });

  it('walks mixed-domain same-name Areas and unset exactly once and reconciles full context', async () => {
    const a = await system();
    const b = await system();
    const dev = await developer(['voc.read', 'finding.read', 'finding.manage', 'survey.read'], a);
    for (const capability of ['voc.read', 'finding.read', 'finding.manage', 'survey.read'])
      await grantCapability(migrate, WORKSPACE, dev.id, capability, b, actor);
    for (const ms of [a, b]) {
      const aa = await area(ms);
      const voc = await insertVocDirectly(migrate, WORKSPACE, ms, actor, prefix);
      await migrate.pool.query('update voc.vocs set analytics_area_id=$1 where id=$2', [
        aa,
        voc.id,
      ]);
      await insertFindingRow(migrate, {
        workspaceId: WORKSPACE,
        primaryManagedSystemId: ms,
        analyticsAreaId: aa,
        sourceId: voc.id,
        createdBy: actor,
        status: 'active',
      });
      await insertTaskRow(migrate, {
        workspaceId: WORKSPACE,
        primaryManagedSystemId: ms,
        analyticsAreaId: aa,
        createdBy: actor,
      });
      await insertTaskRow(migrate, {
        workspaceId: WORKSPACE,
        primaryManagedSystemId: ms,
        createdBy: actor,
      });
      await survey(ms, aa, [], 'open');
    }
    const full = await report(dev.cookie);
    expect(full.items).toHaveLength(4);
    const walked: DashboardAreaReport['items'] = [];
    let cursor: string | undefined;
    do {
      const page = await report(dev.cookie, `limit=1${cursor ? `&cursor=${cursor}` : ''}`);
      expect(page.classification_context).toEqual(full.classification_context);
      walked.push(...page.items);
      cursor = page.page.cursor;
    } while (cursor);
    expect(walked).toEqual(full.items);
    expect(
      new Set(walked.map((row) => `${row.managed_system_id}/${row.analytics_area_id}`)).size,
    ).toBe(4);
    for (const context of full.classification_context) {
      const rows = walked.filter((row) => row.managed_system_id === context.managed_system_id);
      expect(context.voc?.total).toBe(rows.reduce((n, row) => n + (row.voc?.total.count ?? 0), 0));
      expect(context.finding?.total).toBe(
        rows.reduce((n, row) => n + (row.finding?.active.count ?? 0), 0),
      );
      expect(context.task?.total).toBe(
        rows.reduce(
          (n, row) =>
            n +
            Object.values(required(row.task).by_status).reduce((sum, cell) => sum + cell.count, 0),
          0,
        ),
      );
      expect(context.survey?.total).toBe(
        rows.reduce((n, row) => n + (row.survey?.open.count ?? 0), 0),
      );
    }
    const selected = await report(
      dev.cookie,
      `analytics_area_id=${full.items[0]?.analytics_area_id}&limit=1`,
    );
    expect(selected.classification_context).toEqual(full.classification_context);
  });

  it('does not expose a foreign workspace System, Area or source name', async () => {
    const foreign = required(
      (
        await migrate.pool.query<{ id: string }>(
          'insert into core.workspaces(name) values($1) returning id',
          [uid(prefix)],
        )
      ).rows[0],
    ).id;
    workspaces.push(foreign);
    const ms = await insertMsDirectly(migrate, foreign, uid(prefix), 'FOREIGN SECRET');
    systems.push(ms);
    const foreignActor = await insertActorRow(migrate, {
      workspaceId: foreign,
      externalId: uid(prefix),
      roleLevel: 'admin',
    });
    actors.push(foreignActor.id);
    const aa = required(
      (
        await migrate.pool.query<{ id: string }>(
          'insert into core.analytics_areas(workspace_id,managed_system_id,slug,name) values($1,$2,$3,$4) returning id',
          [foreign, ms, uid(prefix), 'FOREIGN AREA SECRET'],
        )
      ).rows[0],
    ).id;
    await insertTaskRow(migrate, {
      workspaceId: foreign,
      primaryManagedSystemId: ms,
      analyticsAreaId: aa,
      createdBy: foreignActor.id,
    });
    for (const query of [`managed_system_id=${ms}`, `analytics_area_id=${aa}`]) {
      const body = await report(admin, query);
      expect(body.items).toEqual([]);
      expect(JSON.stringify(body)).not.toContain('FOREIGN');
      expect(body.classification_context.some((context) => context.managed_system_id === ms)).toBe(
        false,
      );
    }
  });

  it('denies Users first and returns no rows for unknown or foreign classification', async () => {
    const user = await loginAs(app, 'mock-user-1');
    expect((await get(user, 'limit=invalid')).statusCode).toBe(403);
    for (const query of [`managed_system_id=${randomUUID()}`, `analytics_area_id=${randomUUID()}`])
      expect((await report(admin, query)).items).toEqual([]);
  });
});
