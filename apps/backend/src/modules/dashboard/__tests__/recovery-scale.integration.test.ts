import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import {
  RECOVERY_CATEGORIES,
  dashboardAreaReportSchema,
  dashboardSummarySchema,
  recoveryDetailSchema,
  recoveryHistorySchema,
  recoveryListSchema,
} from '@fops/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import * as coreSchema from '../../../db/schema/core.js';
import * as permissionSchema from '../../../db/schema/permission.js';
import { buildServer } from '../../../server.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import {
  type ScaleFixture,
  cleanupRecoveryScale,
  scaleId,
  seedRecoveryScale,
} from '../../../test-support/recovery-scale-fixtures.js';
import { paragraphDoc } from '../../../test-support/rich-content-fixtures.js';
import { createRecordingNotificationDispatcher } from '../../notifications/index.js';
import { recoveryIdentity } from '../identity.js';

function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Missing recovery scale fixture');
  return value;
}

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const DATABASE_URL_MIGRATE = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const WARMUP = 5;
const SAMPLES = 20;
const TIMEOUT = 600_000;
type Query = { sql: string; params: unknown[] };
type Sample = { ms: number; queryCount: number };
type Scenario = {
  name: string;
  actor: number;
  scope: string;
  view: 'operational' | 'actionable';
  presentation: 'visible' | 'hidden';
};

function statistics(samples: Sample[]) {
  const ordered = samples.map((s) => s.ms).sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return {
    raw: samples,
    count: samples.length,
    median:
      ordered.length % 2
        ? ordered[middle]
        : (required(ordered[middle - 1]) + required(ordered[middle])) / 2,
    p95: ordered[Math.ceil(ordered.length * 0.95) - 1],
  };
}

// Read local metadata only: this worker/suite never invokes git or contacts a remote.
async function revision() {
  if (process.env.RECOVERY_SCALE_REVISION) return process.env.RECOVERY_SCALE_REVISION;
  try {
    const root = resolve(process.cwd(), '../..');
    let gitDir = resolve(root, '.git');
    try {
      const pointer = await readFile(gitDir, 'utf8');
      gitDir = resolve(root, pointer.trim().replace(/^gitdir: /, ''));
    } catch {
      /* ordinary directory checkout */
    }
    const head = (await readFile(resolve(gitDir, 'HEAD'), 'utf8')).trim();
    if (!head.startsWith('ref: ')) return head;
    let common = gitDir;
    try {
      common = resolve(gitDir, (await readFile(resolve(gitDir, 'commondir'), 'utf8')).trim());
    } catch {
      /* ordinary checkout */
    }
    const ref = head.slice(5);
    try {
      return (await readFile(resolve(common, ref), 'utf8')).trim();
    } catch {
      const packed = await readFile(resolve(common, 'packed-refs'), 'utf8');
      return (
        packed
          .split('\n')
          .find((line) => line.endsWith(` ${ref}`))
          ?.split(' ')[0] ?? 'local'
      );
    }
  } catch {
    return 'local';
  }
}

function summarizePlan(document: Record<string, unknown>) {
  const node = document.Plan as Record<string, unknown>;
  const sequentialScans: Record<string, unknown>[] = [];
  function visit(plan: Record<string, unknown>) {
    if (
      plan['Node Type'] === 'Seq Scan' &&
      ['vocs', 'tasks', 'findings', 'recovery_history', 'entity_links'].includes(
        String(plan['Relation Name']),
      )
    ) {
      sequentialScans.push({
        relation: plan['Relation Name'],
        rows: plan['Actual Rows'],
        removed: plan['Rows Removed by Filter'],
      });
    }
    for (const child of (plan.Plans ?? []) as Record<string, unknown>[]) visit(child);
  }
  visit(node);
  return {
    topNode: node['Node Type'],
    totalCost: node['Total Cost'],
    actualTime: node['Actual Total Time'],
    planningTime: document['Planning Time'],
    executionTime: document['Execution Time'],
    buffers: Object.fromEntries(Object.entries(node).filter(([key]) => /Blocks$/.test(key))),
    sequentialScans,
    document,
  };
}

describe.skipIf(
  !(process.env.RECOVERY_SCALE === '1' && DATABASE_URL && DATABASE_URL_MIGRATE && WORKSPACE_ID),
)('recovery ~5k paired measurement (#1094)', () => {
  let db: DbHandle | undefined;
  let migrate: DbHandle | undefined;
  let app: FastifyInstance | undefined;
  let fixture: ScaleFixture;
  let outputPath: string;
  const cookies: string[] = [];
  const queries: Query[] = [];
  const artifact: Record<string, unknown> = {
    suite: 'recovery-scale-v1',
    status: 'incomplete',
    warmup: WARMUP,
    requestedSamples: SAMPLES,
    percentileDefinition:
      'nearest rank: sorted samples[ceil(n * 0.95) - 1]; median averages middle two for even n',
    timing: 'app-role Fastify inject; setup, limiter reset, assertions and EXPLAIN excluded',
    measurements: {},
    plans: {},
    errors: [],
    recorder: {},
  };
  const measurements = artifact.measurements as Record<string, unknown>;
  const plans = artifact.plans as Record<string, unknown>;
  const recorder = artifact.recorder as Record<string, unknown>;
  const errors = artifact.errors as unknown[];

  async function persist() {
    if (!outputPath) return;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  }
  const headers = (actor: number) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookies[actor]}` });
  async function reset(actor: number) {
    await required(migrate).pool.query(
      "delete from core.rate_limits where split_part(key,':',2)=$1",
      [required(fixture.actors[actor]).id],
    );
  }
  async function request(actor: number, options: InjectOptions, expected = 200) {
    queries.length = 0;
    const start = performance.now();
    const response = await required(app).inject({
      ...options,
      headers: { ...headers(actor), ...options.headers },
    });
    const elapsed = performance.now() - start;
    const captured = queries.map((query) => ({ ...query, params: [...query.params] }));
    if (response.statusCode !== expected) {
      errors.push({ url: options.url, status: response.statusCode, body: response.body });
      await persist();
      throw new Error(`Rejected sample ${options.url}: ${response.statusCode} ${response.body}`);
    }
    return {
      body: response.json(),
      sample: { ms: elapsed, queryCount: captured.length },
      captured,
    };
  }
  async function explain(label: string, captured: Query[]) {
    const selected = captured.filter(
      (query) =>
        /^\s*(select|with)\b/i.test(query.sql) &&
        /voc|finding|task|survey|recovery|entity_links/i.test(query.sql),
    );
    expect(selected.length, `captured representative SELECTs: ${label}`).toBeGreaterThan(0);
    const results = [];
    for (const query of selected) {
      const result = await required(db).pool.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
        query.params,
      );
      results.push({ ...query, summary: summarizePlan(result.rows[0]['QUERY PLAN'][0]) });
    }
    plans[label] = results;
  }
  async function measure(
    label: string,
    actor: number,
    url: string,
    validate: (body: unknown) => void,
    withPlan = false,
  ) {
    const samples: Sample[] = [];
    measurements[label] = { raw: samples };
    let representative: Query[] = [];
    for (let run = 0; run < WARMUP + SAMPLES; run++) {
      await reset(actor);
      const result = await request(actor, { method: 'GET', url });
      validate(result.body);
      if (run >= WARMUP) samples.push(result.sample);
      representative = result.captured;
    }
    measurements[label] = statistics(samples);
    if (withPlan) await explain(label, representative);
    return representative;
  }

  beforeAll(async () => {
    const sha = await revision();
    outputPath = process.env.RECOVERY_SCALE_OUT ?? resolve(tmpdir(), `recovery-scale-${sha}.json`);
    artifact.revision = sha;
    artifact.startedAt = new Date().toISOString();
    process.env.NODE_ENV = 'test';
    db = createDb(DATABASE_URL);
    db.db = drizzle(db.pool, {
      schema: { ...coreSchema, ...permissionSchema },
      logger: {
        logQuery(sql, params) {
          queries.push({ sql, params });
        },
      },
    });
    migrate = createDb(DATABASE_URL_MIGRATE);
    fixture = await seedRecoveryScale(migrate, WORKSPACE_ID, {
      analyticsAreas: process.env.AREA_REPORT_SCALE === '1',
    });
    artifact.seed = fixture;
    artifact.runtime = {
      node: process.version,
      appRole: (await db.pool.query('select current_user')).rows[0].current_user,
      migrateRole: (await migrate.pool.query('select current_user')).rows[0].current_user,
      database: (await db.pool.query('select version()')).rows[0].version,
      workspaceSystems: (
        await migrate.pool.query<{ id: string }>(
          'select id from core.managed_systems where workspace_id=$1 and archived_at is null order by id',
          [WORKSPACE_ID],
        )
      ).rows.map((row) => row.id),
    };
    for (const table of [
      'voc.vocs',
      'task.tasks',
      'finding.findings',
      'core.entity_links',
      'permission.permission_requests',
      'survey.surveys',
      'survey.survey_responses',
      'survey.survey_response_answers',
    ]) {
      await migrate.pool.query(`ANALYZE ${table}`);
    }
    app = await buildServer({
      config: loadConfig(),
      dbHandle: db,
      notificationDispatcher: createRecordingNotificationDispatcher(),
    });
    await app.ready();
    for (const actor of fixture.actors) cookies.push(await loginAs(app, actor.externalId));
    // Personal hiding is real API state for each measuring persona, >=50 per System.
    for (let actor = 0; actor < fixture.actors.length; actor++) {
      for (let s = 0; s < required(fixture.actors[actor]).systems.length; s++) {
        for (let n = 1100; n < 1160; n++) {
          await reset(actor);
          await request(actor, {
            method: 'PATCH',
            url: `/dashboard/recovery-items/${recoveryIdentity('unassigned-voc', scaleId(`voc-${s}-${n}`))}/presentation`,
            payload: { action: 'mute' },
          });
        }
      }
    }
    // Warmups are genuine repairs too, furnishing recent command history before read sampling.
    await measureRecorder('voc');
    await measureRecorder('finding');
    for (const table of [
      'voc.vocs',
      'task.tasks',
      'finding.findings',
      'core.entity_links',
      'permission.permission_requests',
      'survey.surveys',
      'survey.survey_responses',
      'survey.survey_response_answers',
      'dashboard.recovery_identities',
      'dashboard.recovery_history',
      'dashboard.recovery_presentations',
    ]) {
      await migrate.pool.query(`ANALYZE ${table}`);
    }
    const counts = await migrate.pool.query<{ system: string; vocs: number; tasks: number }>(
      `select ms.id as system,(select count(*)::int from voc.vocs v where v.primary_managed_system_id=ms.id) as vocs,
       (select count(*)::int from task.tasks t where t.primary_managed_system_id=ms.id) as tasks
       from core.managed_systems ms where ms.id=any($1::uuid[]) order by ms.slug`,
      [fixture.systems],
    );
    artifact.actualPopulations = counts.rows;
    expect(counts.rows.map((r) => [r.vocs, r.tasks])).toEqual(
      Array.from({ length: 4 }, () => [1250, 1250]),
    );
    await persist();
  }, TIMEOUT);

  async function measureRecorder(kind: 'voc' | 'finding') {
    const samples: Sample[] = [];
    const outcomes: unknown[] = [];
    recorder[kind] = { raw: samples, outcomes, warmup: WARMUP, fanout: 10 };
    for (let run = 0; run < WARMUP + SAMPLES; run++) {
      // Different pre-state for every sample; repairs spread across all Systems.
      const s = run % 4;
      const n = Math.floor(run / 4);
      const id = scaleId(`${kind}-${s}-${n}`);
      // Reporter-facing rules allow resolved only from progress/prep; setup is excluded from samples.
      if (kind === 'voc')
        await required(migrate).pool.query(
          "update voc.vocs set reporter_facing_status='progress' where id=$1::uuid",
          [id],
        );
      const pre = await request(0, {
        method: 'GET',
        url: `/${kind === 'voc' ? 'vocs' : 'findings'}/${id}`,
      });
      expect(pre.body[kind === 'voc' ? 'reporter_facing_status' : 'status']).toBe(
        kind === 'voc' ? 'progress' : 'active',
      );
      const subjectIds =
        kind === 'voc'
          ? Array.from({ length: 10 }, (_, i) => scaleId(`task-${s}-${n * 10 + i}`))
          : [id];
      const tokens = subjectIds.map((subject) =>
        recoveryIdentity(
          kind === 'voc' ? 'released-task-unresolved-voc' : 'actionable-finding-no-execution',
          subject,
        ),
      );
      const before = await required(migrate).pool.query<{ count: number }>(
        'select count(*)::int as count from dashboard.recovery_history where workspace_id=$1 and recovery_item_id=any($2::text[])',
        [WORKSPACE_ID, tokens],
      );
      const fanout = await required(migrate).pool.query<{ count: number }>(
        kind === 'voc'
          ? `select count(*)::int as count from core.entity_links where source_type='voc' and source_id=$1 and target_type='task' and status='active'`
          : `select count(*)::int as count from core.entity_links where target_type='finding' and target_id=$1 and source_type='voc' and status='active'`,
        [id],
      );
      expect(required(fanout.rows[0]).count).toBeGreaterThanOrEqual(10);
      await reset(0);
      const result = await request(
        0,
        {
          method: kind === 'voc' ? 'POST' : 'PATCH',
          url: kind === 'voc' ? `/vocs/${id}/public-updates` : `/findings/${id}`,
          headers: { 'if-match': pre.body.updated_at, 'idempotency-key': randomUUID() },
          payload:
            kind === 'voc'
              ? {
                  skip_public_update: false,
                  body_rich_content: paragraphDoc(`Scale repair ${run}`),
                  next_reporter_facing_status: 'resolved',
                }
              : { status: 'not_actionable', reason: 'Scale recorder repair' },
        },
        kind === 'voc' ? 201 : 200,
      );
      const after = await required(migrate).pool.query<{ count: number }>(
        `select count(*)::int as count from dashboard.recovery_history where workspace_id=$1 and recovery_item_id=any($2::text[])
         and evidence='command' and outcome='resolved' and actor_id=$3
         and resolved_at >= date_trunc('month', now() at time zone 'UTC') - interval '2 months'`,
        [WORKSPACE_ID, tokens, required(fixture.actors[0]).id],
      );
      expect(required(after.rows[0]).count - required(before.rows[0]).count).toBe(tokens.length);
      const post = await request(0, {
        method: 'GET',
        url: `/${kind === 'voc' ? 'vocs' : 'findings'}/${id}`,
      });
      expect(post.body[kind === 'voc' ? 'reporter_facing_status' : 'status']).toBe(
        kind === 'voc' ? 'resolved' : 'not_actionable',
      );
      outcomes.push({
        source: id,
        system: s,
        fanout: required(fanout.rows[0]).count,
        episodes: tokens.length,
        warmup: run < WARMUP,
      });
      if (run >= WARMUP) samples.push(result.sample);
    }
    recorder[kind] = { ...statistics(samples), outcomes, warmup: WARMUP, fanout: 10 };
  }

  it(
    'records warm read samples, actual plans and bounded page query counts across scopes',
    async () => {
      const scenarios: Scenario[] = [
        { name: 'admin-all', actor: 0, scope: 'all', view: 'operational', presentation: 'visible' },
        {
          name: 'developer-one',
          actor: 1,
          scope: required(fixture.systems[0]),
          view: 'operational',
          presentation: 'visible',
        },
        {
          name: 'developer-several',
          actor: 2,
          scope: 'all',
          view: 'operational',
          presentation: 'visible',
        },
        { name: 'actionable', actor: 2, scope: 'all', view: 'actionable', presentation: 'visible' },
        { name: 'hidden', actor: 0, scope: 'all', view: 'operational', presentation: 'hidden' },
      ];
      artifact.scenarios = scenarios.map((s) => ({
        ...s,
        effectiveSystems:
          s.actor === 0
            ? (artifact.runtime as { workspaceSystems: string[] }).workspaceSystems
            : required(fixture.actors[s.actor]).systems,
      }));
      artifact.categoryCounts = {};
      const categories = artifact.categoryCounts as Record<string, unknown>;
      for (const scenario of scenarios) {
        const scope = `managed_system_id=${scenario.scope}`;
        const filter = `${scope}&view=${scenario.view}&presentation=${scenario.presentation}`;
        await measure(
          `${scenario.name}/summary`,
          scenario.actor,
          `/dashboard/summary?${scope}`,
          (body) => {
            dashboardSummarySchema.parse(body);
          },
          true,
        );
        await reset(scenario.actor);
        const first = recoveryListSchema.parse(
          (
            await request(scenario.actor, {
              method: 'GET',
              url: `/dashboard/recovery-items?${filter}&limit=50`,
            })
          ).body,
        );
        expect(first.items).toHaveLength(50);
        expect(first.page.has_more).toBe(true);
        expect(first.page.cursor).toBeTruthy();
        const validateList = (body: unknown) => {
          const page = recoveryListSchema.parse(body);
          expect(page.items.length).toBeLessThanOrEqual(50);
          expect(page.items.length).toBeGreaterThan(0);
        };
        await measure(
          `${scenario.name}/list-first`,
          scenario.actor,
          `/dashboard/recovery-items?${filter}&limit=50`,
          validateList,
          true,
        );
        await measure(
          `${scenario.name}/list-continuation`,
          scenario.actor,
          `/dashboard/recovery-items?${filter}&limit=50&cursor=${encodeURIComponent(required(first.page.cursor))}`,
          (body) => {
            validateList(body);
            const page = recoveryListSchema.parse(body);
            expect(
              page.items.some((item) =>
                first.items.some((prior) => prior.recovery_item_id === item.recovery_item_id),
              ),
            ).toBe(false);
          },
          true,
        );
        await measure(
          `${scenario.name}/detail`,
          scenario.actor,
          `/dashboard/recovery-items/${required(first.items[0]).recovery_item_id}`,
          (body) => {
            const detail = recoveryDetailSchema.parse(body);
            expect(detail.affected.length).toBeLessThanOrEqual(100);
          },
        );
        await measure(
          `${scenario.name}/history-first`,
          scenario.actor,
          `/dashboard/recovery-history?${scope}&limit=50`,
          (body) => {
            const history = recoveryHistorySchema.parse(body);
            expect(history.items.length).toBeGreaterThan(0);
            expect(history.items.length).toBeLessThanOrEqual(50);
          },
          true,
        );
        // Same System/category/hydration shape at both sizes; a scoped Developer cannot read Permission Requests.
        const boundCounts: number[] = [];
        for (const limit of [10, 50]) {
          await reset(scenario.actor);
          const result = await request(scenario.actor, {
            method: 'GET',
            url: `/dashboard/recovery-items?managed_system_id=${fixture.systems[0]}&category=unassigned-voc&view=${scenario.view}&presentation=${scenario.presentation}&limit=${limit}`,
          });
          expect(recoveryListSchema.parse(result.body).items).toHaveLength(limit);
          boundCounts.push(result.sample.queryCount);
        }
        expect(boundCounts[0]).toBe(boundCounts[1]);
        measurements[`${scenario.name}/page-size-query-bound`] = {
          limits: [10, 50],
          counts: boundCounts,
          system: fixture.systems[0],
          category: 'unassigned-voc',
        };
        const historyCounts: number[] = [];
        for (const limit of [10, 50]) {
          await reset(scenario.actor);
          const result = await request(scenario.actor, {
            method: 'GET',
            url: `/dashboard/recovery-history?managed_system_id=${fixture.systems[0]}&limit=${limit}`,
          });
          expect(recoveryHistorySchema.parse(result.body).items).toHaveLength(limit);
          historyCounts.push(result.sample.queryCount);
        }
        expect(historyCounts[0]).toBe(historyCounts[1]);
        measurements[`${scenario.name}/history-size-query-bound`] = {
          limits: [10, 50],
          counts: historyCounts,
          system: fixture.systems[0],
        };
        await persist();
      }
      // Every category has two full pages under authorized Admin operational scope.
      for (const category of RECOVERY_CATEGORIES) {
        await reset(0);
        const url = `/dashboard/recovery-items?category=${category}&limit=50`;
        const first = recoveryListSchema.parse((await request(0, { method: 'GET', url })).body);
        expect(first.items).toHaveLength(50);
        expect(first.page.has_more).toBe(true);
        const next = recoveryListSchema.parse(
          (
            await request(0, {
              method: 'GET',
              url: `${url}&cursor=${encodeURIComponent(required(first.page.cursor))}`,
            })
          ).body,
        );
        expect(next.items.length).toBeGreaterThan(0);
        categories[category] = {
          total: first.total,
          visible: first.visible_total,
          hidden: first.hidden_total,
        };
        for (let s = 0; s < fixture.systems.length; s++) {
          await reset(0);
          const body = recoveryListSchema.parse(
            (
              await request(0, {
                method: 'GET',
                url: `${url}&managed_system_id=${fixture.systems[s]}`,
              })
            ).body,
          );
          categories[`${category}/system-${s}`] = {
            total: body.total,
            visible: body.visible_total,
            hidden: body.hidden_total,
          };
        }
      }
      artifact.status = 'completed';
      await persist();
    },
    TIMEOUT,
  );

  it.skipIf(process.env.AREA_REPORT_SCALE !== '1')(
    'measures Area report p95, authorization queries, grouped plans and page-size independence',
    async () => {
      artifact.areaReportStatus = 'incomplete';
      try {
        for (const actor of [0, 1, 2]) {
          const label = `area-report/actor-${actor}`;
          const captured = await measure(
            label,
            actor,
            '/dashboard/analytics-areas?limit=50',
            (raw) => {
              const body = dashboardAreaReportSchema.parse(raw);
              expect(body.items.length).toBeGreaterThan(1);
              expect(body.items.length).toBeLessThanOrEqual(50);
              expect(body.items.some((row) => row.analytics_area_id === null)).toBe(true);
            },
            true,
          );
          measurements[`${label}/authorization`] = {
            queryCount: captured.filter((query) =>
              /permission_grants|permission_denies/.test(query.sql),
            ).length,
            systemCount: required(fixture.actors[actor]).systems.length,
          };
          const counts = [];
          for (const limit of [1, 50]) {
            await reset(actor);
            const result = await request(actor, {
              method: 'GET',
              url: `/dashboard/analytics-areas?limit=${limit}`,
            });
            dashboardAreaReportSchema.parse(result.body);
            counts.push(result.sample.queryCount);
          }
          expect(counts[0]).toBe(counts[1]);
          measurements[`${label}/page-size-query-bound`] = { limits: [1, 50], counts };
        }
        artifact.areaReportStatus = 'completed';
      } catch (error) {
        artifact.areaReportStatus = 'failed';
        errors.push({ scenario: 'area-report', error: String(error) });
        await persist();
        throw error;
      }
      await persist();
    },
    TIMEOUT,
  );

  afterAll(async () => {
    let closeFailure: unknown;
    try {
      if (migrate) await cleanupRecoveryScale(migrate, WORKSPACE_ID);
      artifact.cleanup = 'completed';
    } catch (error) {
      artifact.cleanup = String(error);
      throw error;
    } finally {
      // Each close is attempted even if cleanup or another handle close fails.
      const serverClosed = await Promise.allSettled([app?.close()]);
      const poolsClosed = await Promise.allSettled([db?.close(), migrate?.close()]);
      const closed = [...serverClosed, ...poolsClosed];
      artifact.handleClose = closed.map((result) =>
        result.status === 'fulfilled' ? 'closed' : String(result.reason),
      );
      artifact.finishedAt = new Date().toISOString();
      await persist();
      console.info(`Recovery scale artifact: ${outputPath}`);
      const failed = closed.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') closeFailure = failed.reason;
    }
    if (closeFailure) throw closeFailure;
  }, TIMEOUT);
});
