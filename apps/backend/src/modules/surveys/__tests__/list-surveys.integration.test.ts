// HTTP list seam only; the conductor executes this with fops_app/fops_migrate.
import { randomUUID } from 'node:crypto';
import { listSurveysResponseSchema } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME } from '../../../test-support/auth.js';
import { createAa, insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import {
  denyCapability,
  grantCapability,
  revokeDeny,
} from '../../../test-support/permissions-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { insertSurveyFindingFixture } from '../../../test-support/survey-finding-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
type Actor = { id: string; cookie: string };
type Fixture = { id: string; system: string; area: string | null; status: string; needed: boolean };

function fixtureRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('missing #1077 fixture row');
  return row;
}

describe.skipIf(!runIntegration)('GET /surveys Analytics Area report destinations (#1077)', () => {
  let db: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let admin: Actor;
  let devA: Actor;
  let devB: Actor;
  let user: Actor;
  let ungrantedUser: Actor;
  let msA: string;
  let msB: string;
  let areaA: string;
  let areaB: string;
  let archivedArea: string;
  let foreignWorkspace: string;
  let foreignArea: string;
  let threshold: number;
  const actors: string[] = [];
  const systems: string[] = [];
  const surveys: Fixture[] = [];
  const findings: string[] = [];
  let unfiltered: Array<{ id: string; primary_managed_system_id: string }>;

  async function actor(roleLevel: 'admin' | 'developer' | 'user', workspaceId = WORKSPACE_ID) {
    const row = await insertActorRow(migrate, {
      workspaceId,
      externalId: uid('survey-list-1077'),
      roleLevel,
    });
    actors.push(row.id);
    const cookie = randomUUID();
    await migrate.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
       values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
      [cookie, row.id, workspaceId],
    );
    return { id: row.id, cookie };
  }
  const get = (query: Record<string, string>, who = admin) =>
    app.inject({
      method: 'GET',
      url: `/surveys?${new URLSearchParams(query)}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${who.cookie}` },
    });
  async function membership(query: Record<string, string>, expected: string[], who = admin) {
    const response = await get(query, who);
    expect(response.statusCode).toBe(200);
    const items = listSurveysResponseSchema.parse(response.json());
    // Strip-tolerant DTO validation alone would miss leaked classifier/response fields.
    expect(response.json()).toEqual(items);
    expect(items.map((row) => row.id).sort()).toEqual([...expected].sort());
    return response;
  }

  // Minimal subset of follow-up-read's migrate-only fixtures. All local Surveys
  // deliberately share systems so intersections test the real list predicates.
  async function seedSurvey(
    options: {
      system?: string;
      area?: string | null;
      status?: 'draft' | 'open' | 'closed';
      type?: 'outcome' | 'discovery';
      ratings?: number[];
      resolve?: 'finding' | 'no_follow_up';
      needed?: boolean;
      workspace?: string;
      creator?: Actor;
    } = {},
  ) {
    const workspace = options.workspace ?? WORKSPACE_ID;
    const creator = options.creator ?? admin;
    const system = options.system ?? msA;
    const status = options.status ?? 'closed';
    const area = options.area ?? null;
    const id = fixtureRow(
      (
        await migrate.pool.query<{ id: string }>(
          `insert into survey.surveys (workspace_id, display_id, type, status, title,
        primary_managed_system_id, analytics_area_id, operator_actor_id, created_by,
        responses_identity_protected, opened_at, closed_at)
       values ($1, $2, $3, $4, 'List destination', $5, $6, $7, $7, true,
        case when $4 = 'draft' then null else now() end,
        case when $4 = 'closed' then now() else null end) returning id`,
          [workspace, uid('SRV-list'), options.type ?? 'outcome', status, system, area, creator.id],
        )
      ).rows,
    ).id;
    surveys.push({ id, system, area, status, needed: options.needed ?? false });
    if (!options.ratings?.length) return id;
    const question = fixtureRow(
      (
        await migrate.pool.query<{ id: string }>(
          `insert into survey.survey_questions (workspace_id, survey_id, kind, prompt,
        rating_min, rating_max, sort_order, branch_depth)
       values ($1, $2, 'rating', 'Did this release help?', 1, 5, 0, 0) returning id`,
          [workspace, id],
        )
      ).rows,
    ).id;
    for (const rating of options.ratings) {
      const respondent = await actor('user', workspace);
      const response = fixtureRow(
        (
          await migrate.pool.query<{ id: string }>(
            `insert into survey.survey_responses (workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at)
         values ($1, $2, $3, true, now()) returning id`,
            [workspace, id, respondent.id],
          )
        ).rows,
      ).id;
      await migrate.pool.query(
        `insert into survey.survey_response_answers (workspace_id, survey_id, response_id, question_id, answer_kind, answer_value)
         values ($1, $2, $3, $4, 'rating', $5::jsonb)`,
        [workspace, id, response, question, JSON.stringify(rating)],
      );
      if (rating > 2 || !options.resolve) continue;
      if (options.resolve === 'no_follow_up') {
        await migrate.pool.query(
          `insert into survey.outcome_follow_up_decisions (workspace_id, survey_id, response_id,
            managed_system_id, state, reason, decided_by_actor_id)
           values ($1, $2, $3, $4, 'no_follow_up', 'Handled elsewhere', $5)`,
          [workspace, id, response, system, creator.id],
        );
      } else {
        const finding = fixtureRow(
          (
            await insertSurveyFindingFixture<{ id: string }>(
              migrate,
              response,
              `insert into finding.findings (workspace_id, display_id, primary_managed_system_id,
            title, summary, source_type, source_id, severity, status, created_by)
           values ($1, core.next_display_id($1::uuid, 'finding'), $2, 'Follow-up', 'summary',
            'survey_response', nullif($3::uuid,$3::uuid), 'medium', 'active', $4) returning id`,
              [workspace, system, response, creator.id],
            )
          ).rows,
        );
        findings.push(finding.id);
        await migrate.pool.query(
          `insert into core.entity_links (workspace_id, source_type, source_id, target_type,
            target_id, relation_type, visibility, status, managed_system_id, created_by)
           values ($1, 'survey_response', $2, 'finding', $3, 'generated_finding',
            'internal_only', 'active', $4, $5)`,
          [workspace, response, finding.id, system, creator.id],
        );
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
    admin = await actor('admin');
    devA = await actor('developer');
    devB = await actor('developer');
    user = await actor('user');
    ungrantedUser = await actor('user');
    msA = await insertMsDirectly(migrate, WORKSPACE_ID, uid('survey-list-1077'), 'A');
    msB = await insertMsDirectly(migrate, WORKSPACE_ID, uid('survey-list-1077'), 'B');
    systems.push(msA, msB);
    for (const [who, system] of [
      [devA, msA],
      [devB, msB],
      [user, msA],
    ] as const)
      await grantCapability(migrate, WORKSPACE_ID, who.id, 'survey.read', system, admin.id);
    await grantCapability(
      migrate,
      WORKSPACE_ID,
      user.id,
      'survey.read_personal_responses',
      msA,
      admin.id,
    );
    areaA = await createAa(app, admin.cookie, {
      managed_system_id: msA,
      slug: 'same',
      name: 'Same',
    });
    areaB = await createAa(app, admin.cookie, {
      managed_system_id: msB,
      slug: 'same',
      name: 'Same',
    });
    archivedArea = await createAa(app, admin.cookie, {
      managed_system_id: msA,
      slug: 'archived',
      name: 'Archived',
    });
    threshold = fixtureRow(
      (
        await migrate.pool.query<{ threshold: number }>(
          `select coalesce((select survey_anonymity_threshold from core.workspace_settings
        where workspace_id = $1), 5)::int as threshold`,
          [WORKSPACE_ID],
        )
      ).rows,
    ).threshold;
    const ratings = [1, ...Array<number>(threshold - 1).fill(5)];
    await seedSurvey({ area: areaA, ratings, needed: true });
    await seedSurvey({ area: areaA, ratings: Array<number>(threshold).fill(1), needed: true });
    await seedSurvey({ area: areaA, ratings: ratings.slice(0, threshold - 1) });
    await seedSurvey({ area: areaA, status: 'open', ratings });
    await seedSurvey({ area: areaA, status: 'draft', ratings });
    await seedSurvey({ area: areaA, ratings: Array<number>(threshold).fill(5) });
    await seedSurvey({ area: areaA, ratings, resolve: 'finding' });
    await seedSurvey({ area: areaA, ratings, resolve: 'no_follow_up' });
    await seedSurvey({ area: areaA, type: 'discovery', ratings });
    await seedSurvey({ area: archivedArea, ratings, needed: true });
    await seedSurvey({ status: 'open' });
    await seedSurvey({ system: msB, area: areaB, ratings, needed: true });
    await migrate.pool.query('update core.analytics_areas set archived_at = now() where id = $1', [
      archivedArea,
    ]);
    foreignWorkspace = fixtureRow(
      (
        await migrate.pool.query<{ id: string }>(
          'insert into core.workspaces (name) values ($1) returning id',
          [uid('survey-list-foreign')],
        )
      ).rows,
    ).id;
    const foreignMs = await insertMsDirectly(migrate, foreignWorkspace, 'foreign', 'Foreign');
    systems.push(foreignMs);
    foreignArea = fixtureRow(
      (
        await migrate.pool.query<{ id: string }>(
          'insert into core.analytics_areas (workspace_id, managed_system_id, slug, name) values ($1, $2, $3, $4) returning id',
          [foreignWorkspace, foreignMs, 'same', 'Same'],
        )
      ).rows,
    ).id;
    await seedSurvey({
      workspace: foreignWorkspace,
      system: foreignMs,
      area: foreignArea,
      creator: await actor('admin', foreignWorkspace),
      status: 'open',
    });
    // Pin the pre-refactor list contract: all statuses/types, original ordering,
    // then scope membership. Expected source does not call the changed repo.
    unfiltered = (
      await migrate.pool.query<{ id: string; primary_managed_system_id: string }>(
        'select id, primary_managed_system_id from survey.surveys where workspace_id = $1 order by created_at desc, id desc',
        [WORKSPACE_ID],
      )
    ).rows;
  });

  afterAll(async () => {
    if (migrate) {
      const ids = surveys.map((row) => row.id);
      await migrate.pool.query('delete from core.audit_log where actor_id = any($1::uuid[])', [
        actors,
      ]);
      await migrate.pool.query(
        'delete from core.entity_links where managed_system_id = any($1::uuid[])',
        [systems],
      );
      await migrate.pool.query('delete from finding.findings where id = any($1::uuid[])', [
        findings,
      ]);
      await migrate.pool.query(
        'delete from survey.outcome_follow_up_decisions where survey_id = any($1::uuid[])',
        [ids],
      );
      await migrate.pool.query(
        'delete from survey.survey_response_answers where survey_id = any($1::uuid[])',
        [ids],
      );
      await migrate.pool.query(
        'delete from survey.survey_responses where survey_id = any($1::uuid[])',
        [ids],
      );
      await migrate.pool.query(
        'delete from survey.survey_questions where survey_id = any($1::uuid[])',
        [ids],
      );
      await migrate.pool.query('delete from survey.surveys where id = any($1::uuid[])', [ids]);
      await migrate.pool.query(
        'delete from permission.permission_grants where actor_id = any($1::uuid[])',
        [actors],
      );
      await migrate.pool.query(
        'delete from permission.permission_denies where actor_id = any($1::uuid[])',
        [actors],
      );
      await migrate.pool.query(
        'delete from core.analytics_areas where managed_system_id = any($1::uuid[])',
        [systems],
      );
      await deleteRecoveryFixtureParents(
        migrate,
        'delete from core.managed_systems where id = any($1::uuid[])',
        [systems],
      );
      await migrate.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [
        actors,
      ]);
      await migrate.pool.query('delete from core.rate_limits where key = any($1::text[])', [
        actors.map((id) => `${WORKSPACE_ID}:${id}`),
      ]);
      await migrate.pool.query('delete from core.actors where id = any($1::uuid[])', [actors]);
      if (foreignWorkspace)
        await deleteRecoveryFixtureParents(migrate, 'delete from core.workspaces where id = $1', [
          foreignWorkspace,
        ]);
    }
    await app?.close();
    await db?.close();
    await migrate?.close();
  });

  it.each(['admin', 'developer', 'user', 'ungranted-user'] as const)(
    'preserves unfiltered ordered bare array for %s',
    async (kind) => {
      const who =
        kind === 'admin'
          ? admin
          : kind === 'developer'
            ? devA
            : kind === 'user'
              ? user
              : ungrantedUser;
      const expected =
        kind === 'admin'
          ? unfiltered
          : kind === 'ungranted-user'
            ? []
            : unfiltered.filter((row) => row.primary_managed_system_id === msA);
      for (const query of [{}, { managed_system_id: 'all' }]) {
        const response = await get(query, who);
        expect(response.statusCode).toBe(200);
        expect(listSurveysResponseSchema.parse(response.json()).map((row) => row.id)).toEqual(
          expected.map((row) => row.id),
        );
      }
    },
  );
  it.each(['uuid', 'unset', 'archived', 'same-name-other-system'] as const)(
    'filters Area %s',
    async (kind) => {
      const area =
        kind === 'unset'
          ? 'unset'
          : kind === 'archived'
            ? archivedArea
            : kind === 'uuid'
              ? areaA
              : areaB;
      await membership(
        { analytics_area_id: area, ...(kind === 'unset' ? { managed_system_id: msA } : {}) },
        surveys.filter((row) => row.area === (area === 'unset' ? null : area)).map((row) => row.id),
      );
    },
  );
  it.each(['unknown', 'foreign', 'incompatible', 'developer-b', 'ungranted-user'] as const)(
    'Area %s yields empty authorized membership',
    async (kind) => {
      await membership(
        {
          analytics_area_id:
            kind === 'unknown' ? randomUUID() : kind === 'foreign' ? foreignArea : areaA,
          ...(kind === 'incompatible' ? { managed_system_id: msB } : {}),
        },
        [],
        kind === 'developer-b' ? devB : kind === 'ungranted-user' ? ungrantedUser : admin,
      );
    },
  );
  it('lists only open Surveys including for a granted User', async () => {
    await membership(
      { status: 'open', managed_system_id: msA },
      surveys.filter((row) => row.system === msA && row.status === 'open').map((row) => row.id),
      user,
    );
  });
  it('uses the threshold-gated classifier once per Survey and honors both resolution kinds', async () => {
    await membership(
      { follow_up: 'needed', managed_system_id: msA },
      surveys.filter((row) => row.system === msA && row.needed).map((row) => row.id),
      devA,
    );
  });
  it('intersects Area, MS, open status, and follow-up without widening membership', async () => {
    await membership(
      { analytics_area_id: areaA, managed_system_id: msA, follow_up: 'needed' },
      surveys.filter((row) => row.area === areaA && row.needed).map((row) => row.id),
      user,
    );
    await membership(
      { analytics_area_id: areaA, managed_system_id: msA, status: 'open', follow_up: 'needed' },
      [],
    );
    await membership({ analytics_area_id: areaA, managed_system_id: msB, follow_up: 'needed' }, []);
  });
  it('explicit survey.read deny removes the system even for Admin', async () => {
    const deny = await denyCapability(
      migrate,
      WORKSPACE_ID,
      admin.id,
      'survey.read',
      msA,
      admin.id,
    );
    try {
      const response = await get({});
      expect(response.statusCode).toBe(200);
      expect(listSurveysResponseSchema.parse(response.json()).map((row) => row.id)).toEqual(
        unfiltered.filter((row) => row.primary_managed_system_id !== msA).map((row) => row.id),
      );
      await membership({ analytics_area_id: areaA, follow_up: 'needed' }, []);
    } finally {
      await revokeDeny(migrate, deny, admin.id);
    }
  });
  it.each([
    'unknown=true',
    'analytics_area_id=bad',
    'status=closed',
    'follow_up=false',
    'managed_system_id=bad',
  ])('rejects invalid query %s', async (query) => {
    const response = await app.inject({
      method: 'GET',
      url: `/surveys?${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${admin.cookie}` },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('validation.failed');
  });
  it.each(['non-holder', 'holder'] as const)(
    'filtered %s reads disclose only Survey DTOs and write no domain or personal-read audits',
    async (kind) => {
      const who = kind === 'holder' ? user : devA;
      const snapshot = async () =>
        (
          await migrate.pool.query(
            `select (select count(*) from survey.surveys where primary_managed_system_id = $1) surveys,
        (select count(*) from survey.survey_responses where survey_id = any($2::uuid[])) responses,
        (select count(*) from survey.outcome_follow_up_decisions where survey_id = any($2::uuid[])) decisions,
        (select count(*) from core.entity_links where managed_system_id = $1) links,
        (select count(*) from finding.findings where primary_managed_system_id = $1) findings,
        (select count(*) from core.audit_log where actor_id = $3) audits,
        (select count(*) from core.audit_log where actor_id = $3 and event_type = 'survey_response_personal_read') personal_reads`,
            [msA, surveys.map((row) => row.id), who.id],
          )
        ).rows;
      const before = await snapshot();
      await membership(
        { analytics_area_id: areaA, follow_up: 'needed' },
        surveys.filter((row) => row.area === areaA && row.needed).map((row) => row.id),
        who,
      );
      expect(await snapshot()).toEqual(before);
    },
  );
});
