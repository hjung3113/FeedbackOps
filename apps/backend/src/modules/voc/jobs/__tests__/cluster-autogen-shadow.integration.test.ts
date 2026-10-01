// #512 — shadow measurements use the real fops_app query/write role and
// deterministic pgvector rows; migrateHandle is fixture setup/teardown only.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import type { JobLog } from '../../../../lib/job-log.js';
import { insertMsDirectly } from '../../../../test-support/core-fixtures.js';
import { insertVocDirectly } from '../../../../test-support/voc-fixtures.js';
import { VOC_RECOMMENDATION_SIMILARITY_THRESHOLD } from '../../recommendations/constants.js';
import {
  VOC_CLUSTER_AUTOGEN_SHADOW_MAX_PAIRS_PER_MANAGED_SYSTEM_PER_RUN,
  type VocClusterAutogenShadowResult,
  runVocClusterAutogenShadow,
} from '../cluster-autogen-shadow.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const FIXTURE_PREFIX = `it-cluster-shadow-${randomUUID().slice(0, 8)}`;
const ACTIVE_VERSION = 2;

interface ShadowRow {
  workspace_id: string;
  primary_managed_system_id: string;
  voc_id_low: string;
  voc_id_high: string;
  embedding_version: number;
  score: number | string;
  would_form: boolean;
  last_run_id: string;
  seen_count: number;
}

interface RecordedInfo {
  msg: string;
  meta: Record<string, unknown> | undefined;
}

function recordingLog(): { log: JobLog; info: RecordedInfo[]; warnings: RecordedInfo[] } {
  const info: RecordedInfo[] = [];
  const warnings: RecordedInfo[] = [];
  return {
    info,
    warnings,
    log: {
      info(msg, meta) {
        info.push({ msg, meta });
      },
      warn(msg, meta) {
        warnings.push({ msg, meta });
      },
      error() {},
    },
  };
}

describe.skipIf(!runIntegration)('voc.cluster_autogen_shadow (#512)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let actorId: string;
  let msId: string;

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    const actor = await migrateHandle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    actorId = actor.rows[0]?.id ?? '';
    if (!actorId) throw new Error('seed admin actor not found');
  });

  beforeEach(async () => {
    await cleanup();
    msId = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      `${FIXTURE_PREFIX}-${randomUUID().slice(0, 8)}`,
      'Cluster shadow target',
    );
  });

  afterAll(async () => {
    await cleanup();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanup(): Promise<void> {
    if (!migrateHandle) return;
    const fixtureVocs = `
      select id from voc.vocs
       where primary_managed_system_id in (
         select id from core.managed_systems where slug like $1 || '%'
       )
          or workspace_id in (
         select id from core.workspaces where name like $1 || '%'
       )`;
    const fixtureClusters = `
      select id from voc_cluster.voc_clusters
       where primary_managed_system_id in (
         select id from core.managed_systems where slug like $1 || '%'
       )
          or workspace_id in (
         select id from core.workspaces where name like $1 || '%'
       )`;

    await migrateHandle.pool.query(
      `delete from voc.voc_cluster_autogen_shadow_candidates
        where primary_managed_system_id in (
                select id from core.managed_systems where slug like $1 || '%'
              )
           or workspace_id in (
                select id from core.workspaces where name like $1 || '%'
              )`,
      [FIXTURE_PREFIX],
    );
    await migrateHandle.pool.query(
      `delete from voc.voc_recommendation_decisions
        where source_voc_id in (${fixtureVocs})
           or candidate_voc_id in (${fixtureVocs})`,
      [FIXTURE_PREFIX],
    );
    await migrateHandle.pool.query(
      `delete from voc_cluster.voc_cluster_members where cluster_id in (${fixtureClusters})`,
      [FIXTURE_PREFIX],
    );
    await migrateHandle.pool.query(
      `delete from voc_cluster.voc_clusters where id in (${fixtureClusters})`,
      [FIXTURE_PREFIX],
    );
    await migrateHandle.pool.query(
      `delete from voc.voc_embeddings where voc_id in (${fixtureVocs})`,
      [FIXTURE_PREFIX],
    );
    await migrateHandle.pool.query(`delete from voc.vocs where id in (${fixtureVocs})`, [
      FIXTURE_PREFIX,
    ]);
    await migrateHandle.pool.query(`delete from core.managed_systems where slug like $1 || '%'`, [
      FIXTURE_PREFIX,
    ]);
    await migrateHandle.pool.query(
      `delete from core.actors
        where workspace_id in (
          select id from core.workspaces where name like $1 || '%'
        )`,
      [FIXTURE_PREFIX],
    );
    await migrateHandle.pool.query(`delete from core.workspaces where name like $1 || '%'`, [
      FIXTURE_PREFIX,
    ]);
  }

  async function seedVoc(
    title: string,
    opts: { workspaceId?: string; managedSystemId?: string; reporterId?: string } = {},
  ): Promise<string> {
    const voc = await insertVocDirectly(
      migrateHandle,
      opts.workspaceId ?? WORKSPACE_ID,
      opts.managedSystemId ?? msId,
      opts.reporterId ?? actorId,
      `${FIXTURE_PREFIX} ${title}`,
    );
    return voc.id;
  }

  async function seedEmbedding(
    vocId: string,
    workspaceId: string,
    vector: string,
    version = ACTIVE_VERSION,
  ): Promise<void> {
    await migrateHandle.pool.query(
      `insert into voc.voc_embeddings
         (voc_id, workspace_id, embedding_version, provider, model, dimensions,
          embedding, source_hash)
       values ($1, $2, $3, 'test', 'deterministic', 2, $4::vector, 'cluster-shadow')`,
      [vocId, workspaceId, version, vector],
    );
  }

  async function seedPair(
    vectors: [string, string] = ['[1,0]', '[0.8,0.6]'],
    managedSystemId = msId,
    workspaceId = WORKSPACE_ID,
    reporterId = actorId,
    version = ACTIVE_VERSION,
  ): Promise<[string, string]> {
    const pair = [
      await seedVoc('pair first', { workspaceId, managedSystemId, reporterId }),
      await seedVoc('pair second', { workspaceId, managedSystemId, reporterId }),
    ].sort() as [string, string];
    await seedEmbedding(pair[0], workspaceId, vectors[0], version);
    await seedEmbedding(pair[1], workspaceId, vectors[1], version);
    return pair;
  }

  async function seedPairWithEmbeddingVersions(
    lowVersion: number,
    highVersion: number,
  ): Promise<[string, string]> {
    const pair = [
      await seedVoc('versioned pair low'),
      await seedVoc('versioned pair high'),
    ].sort() as [string, string];
    await seedEmbedding(pair[0], WORKSPACE_ID, '[1,0]', lowVersion);
    await seedEmbedding(pair[1], WORKSPACE_ID, '[0.8,0.6]', highVersion);
    return pair;
  }

  async function runShadow(
    options: {
      embeddingVersion?: number;
      embeddingEnabled?: boolean;
      statementTimeoutMs?: number;
      correlationId?: string;
      log?: JobLog;
    } = {},
  ): Promise<VocClusterAutogenShadowResult> {
    return runVocClusterAutogenShadow(
      {
        db: appHandle.db,
        embeddingVersion: options.embeddingVersion ?? ACTIVE_VERSION,
        embeddingEnabled: options.embeddingEnabled ?? true,
        ...(options.statementTimeoutMs === undefined
          ? {}
          : { statementTimeoutMs: options.statementTimeoutMs }),
        ...(options.log ? { log: options.log } : {}),
      },
      { correlation_id: options.correlationId ?? randomUUID() },
    );
  }

  async function rowsForManagedSystem(managedSystemId = msId): Promise<ShadowRow[]> {
    const result = await appHandle.pool.query<ShadowRow>(
      `select workspace_id, primary_managed_system_id, voc_id_low, voc_id_high,
              embedding_version, score, would_form, last_run_id, seen_count
         from voc.voc_cluster_autogen_shadow_candidates
        where primary_managed_system_id = $1
        order by voc_id_low, voc_id_high`,
      [managedSystemId],
    );
    return result.rows;
  }

  it('records a sorted same-system pair above 0.75 with would_form=true', async () => {
    const [firstId, secondId] = await seedPair();

    const result = await runShadow();

    const rows = await rowsForManagedSystem();
    expect(result.timed_out).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.voc_id_low).toBe(firstId);
    expect(rows[0]?.voc_id_high).toBe(secondId);
    expect((rows[0]?.voc_id_low ?? '') < (rows[0]?.voc_id_high ?? '')).toBe(true);
    expect(rows[0]?.would_form).toBe(true);
    expect(Number(rows[0]?.score)).toBeCloseTo(0.8, 6);
  });

  it('records the measurement band and compares would_form to the stored score', async () => {
    const interiorBandPair = await seedPair(['[1,0]', '[0.7,0.714142842854285]']);
    const floorMs = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      `${FIXTURE_PREFIX}-${randomUUID().slice(0, 8)}`,
      'Measurement floor boundary',
    );
    await seedPair(['[1,0]', '[0.6,0.8]'], floorMs);
    const nearCutMs = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      `${FIXTURE_PREFIX}-${randomUUID().slice(0, 8)}`,
      'Near recommendation cut',
    );
    await seedPair(['[1,0]', '[0.751,0.66]'], nearCutMs);
    const exactCutMs = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      `${FIXTURE_PREFIX}-${randomUUID().slice(0, 8)}`,
      'Exact recommendation cut vector',
    );
    await seedPair(['[1,0]', '[0.75,0.6614378277661477]'], exactCutMs);
    const belowFloorMs = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      `${FIXTURE_PREFIX}-${randomUUID().slice(0, 8)}`,
      'Below measurement floor',
    );
    await seedPair(['[1,0]', '[0.5,0.8660254037844386]'], belowFloorMs);

    await runShadow();

    const interiorBandRows = await rowsForManagedSystem();
    expect(interiorBandRows).toHaveLength(1);
    expect(new Set([interiorBandRows[0]?.voc_id_low, interiorBandRows[0]?.voc_id_high])).toEqual(
      new Set(interiorBandPair),
    );
    expect(Number(interiorBandRows[0]?.score)).toBeCloseTo(0.7, 5);
    expect(interiorBandRows[0]?.would_form).toBe(false);

    const floorRows = await rowsForManagedSystem(floorMs);
    expect(floorRows).toHaveLength(1);
    expect(Number(floorRows[0]?.score)).toBeCloseTo(0.6, 5);
    expect(floorRows[0]?.would_form).toBe(false);

    const nearCutRows = await rowsForManagedSystem(nearCutMs);
    expect(nearCutRows).toHaveLength(1);
    const nearCutScore = Number(nearCutRows[0]?.score);
    expect(nearCutScore).toBeGreaterThanOrEqual(VOC_RECOMMENDATION_SIMILARITY_THRESHOLD);
    expect(nearCutRows[0]?.would_form).toBe(
      nearCutScore >= VOC_RECOMMENDATION_SIMILARITY_THRESHOLD,
    );

    const exactCutRows = await rowsForManagedSystem(exactCutMs);
    expect(exactCutRows).toHaveLength(1);
    const exactCutScore = Number(exactCutRows[0]?.score);
    expect(exactCutScore).toBeCloseTo(VOC_RECOMMENDATION_SIMILARITY_THRESHOLD, 5);
    expect(exactCutRows[0]?.would_form).toBe(
      exactCutScore >= VOC_RECOMMENDATION_SIMILARITY_THRESHOLD,
    );
    expect(await rowsForManagedSystem(belowFloorMs)).toEqual([]);
  });

  it('does not pair VOCs from different Primary Managed Systems', async () => {
    const first = await seedVoc('cross system first');
    const secondMs = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      `${FIXTURE_PREFIX}-${randomUUID().slice(0, 8)}`,
      'Other managed system',
    );
    const second = await seedVoc('cross system second', { managedSystemId: secondMs });
    await seedEmbedding(first, WORKSPACE_ID, '[1,0]');
    await seedEmbedding(second, WORKSPACE_ID, '[1,0]');

    await runShadow();

    expect(await rowsForManagedSystem()).toEqual([]);
    expect(await rowsForManagedSystem(secondMs)).toEqual([]);
  });

  it.each(['low', 'high'] as const)('does not pair when the %s VOC is archived', async (side) => {
    const pair = await seedPair();
    const archivedVocId = pair[side === 'low' ? 0 : 1];
    await migrateHandle.pool.query('update voc.vocs set archived_at = now() where id = $1', [
      archivedVocId,
    ]);

    await runShadow();

    expect(await rowsForManagedSystem()).toEqual([]);
  });

  it.each(['low', 'high'] as const)(
    'does not pair mixed embedding versions when the active embedding is on the %s VOC',
    async (activeSide) => {
      await seedPairWithEmbeddingVersions(
        activeSide === 'low' ? ACTIVE_VERSION : ACTIVE_VERSION - 1,
        activeSide === 'high' ? ACTIVE_VERSION : ACTIVE_VERSION - 1,
      );

      await runShadow();

      expect(await rowsForManagedSystem()).toEqual([]);
    },
  );

  it.each(['low', 'high'] as const)(
    'excludes a pair when the %s VOC already belongs to a cluster in that system',
    async (side) => {
      const pair = await seedPair();
      const clusteredVocId = pair[side === 'low' ? 0 : 1];
      const cluster = await migrateHandle.pool.query<{ id: string }>(
        `insert into voc_cluster.voc_clusters
           (workspace_id, display_id, title, primary_managed_system_id, created_by)
         values ($1, $2, 'Shadow exclusion fixture', $3, $4)
         returning id`,
        [WORKSPACE_ID, `${FIXTURE_PREFIX}-cluster`, msId, actorId],
      );
      await migrateHandle.pool.query(
        `insert into voc_cluster.voc_cluster_members (cluster_id, voc_id, added_by)
         values ($1, $2, $3)`,
        [cluster.rows[0]?.id, clusteredVocId, actorId],
      );

      await runShadow();

      expect(await rowsForManagedSystem()).toEqual([]);
    },
  );

  async function dismissPair(
    pair: [string, string],
    sourceVocId = pair[0],
    version = ACTIVE_VERSION,
  ): Promise<void> {
    await migrateHandle.pool.query(
      `insert into voc.voc_recommendation_decisions
         (workspace_id, source_voc_id, candidate_voc_id, embedding_version,
          state, scope_key, decided_by)
       values ($1, $2, $3, $4, 'dismissed', $5, $6)`,
      [
        WORKSPACE_ID,
        sourceVocId,
        sourceVocId === pair[0] ? pair[1] : pair[0],
        version,
        `test-scope:${randomUUID()}`,
        actorId,
      ],
    );
  }

  it.each(['low', 'high'] as const)(
    'excludes a dismissal whose source VOC is the %s pair member',
    async (sourceSide) => {
      const pair = await seedPair();
      await dismissPair(pair, pair[sourceSide === 'low' ? 0 : 1]);

      await runShadow();

      expect(await rowsForManagedSystem()).toEqual([]);
    },
  );

  it('does not let a dismissal at an old embedding version suppress the active version', async () => {
    const pair = await seedPair();
    await dismissPair(pair, pair[0], ACTIVE_VERSION - 1);

    await runShadow();

    const rows = await rowsForManagedSystem();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.would_form).toBe(true);
  });

  it('returns skipped and writes nothing when the provider is disabled', async () => {
    await seedPair();
    const { log, info } = recordingLog();

    const result = await runShadow({ embeddingEnabled: false, log });

    expect(result.skipped).toBe(true);
    expect(result.timed_out).toBe(false);
    expect(await rowsForManagedSystem()).toEqual([]);
    expect(info).toHaveLength(1);
    expect(info[0]?.meta?.skipped).toBe(true);
  });

  it('does not count a replay with the same run id twice', async () => {
    await seedPair();
    const firstRun = randomUUID();

    await runShadow({ correlationId: firstRun });
    await runShadow({ correlationId: firstRun });

    const rows = await rowsForManagedSystem();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.seen_count).toBe(1);
    expect(rows[0]?.last_run_id).toBe(firstRun);
  });

  it('advances the run id and seen count for a distinct run', async () => {
    await seedPair();
    const firstRun = randomUUID();
    const secondRun = randomUUID();

    await runShadow({ correlationId: firstRun });
    await runShadow({ correlationId: secondRun });

    const rows = await rowsForManagedSystem();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.seen_count).toBe(2);
    expect(rows[0]?.last_run_id).toBe(secondRun);
  });

  it('returns a timeout summary without persisting partial rows', async () => {
    for (let index = 0; index < 100; index += 1) {
      const id = await seedVoc(`timeout ${index}`);
      await seedEmbedding(id, WORKSPACE_ID, index % 2 === 0 ? '[1,0]' : '[0.8,0.6]');
    }
    const { log, warnings } = recordingLog();

    const result = await runShadow({ statementTimeoutMs: 1, log });

    expect(result.timed_out).toBe(true);
    expect(await rowsForManagedSystem()).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.meta).toMatchObject({ timed_out: true, statement_timeout_ms: 1 });
  });

  it('caps recorded pairs per system and reports the uncapped tail and highest scores', async () => {
    const vocIds: string[] = [];
    for (let index = 0; index < 22; index += 1) {
      const id = await seedVoc(`cap ${index}`);
      vocIds.push(id);
      await seedEmbedding(id, WORKSPACE_ID, index === 0 ? '[1,0]' : '[0.8,0.6]');
    }
    const { log, info } = recordingLog();
    const correlationId = randomUUID();

    const result = await runShadow({ correlationId, log });

    const rows = await rowsForManagedSystem();
    expect(rows).toHaveLength(VOC_CLUSTER_AUTOGEN_SHADOW_MAX_PAIRS_PER_MANAGED_SYSTEM_PER_RUN);
    expect(Math.min(...rows.map((row) => Number(row.score)))).toBeCloseTo(1, 6);
    expect(info).toHaveLength(1);
    expect(info[0]?.meta?.correlation_id).toBe(correlationId);
    const managedSystemSummary = result.managed_systems.find(
      (summary) => summary.primary_managed_system_id === msId,
    );
    expect(managedSystemSummary).toMatchObject({
      eligible_pairs: (vocIds.length * (vocIds.length - 1)) / 2,
      would_form_count: (vocIds.length * (vocIds.length - 1)) / 2,
      recorded: VOC_CLUSTER_AUTOGEN_SHADOW_MAX_PAIRS_PER_MANAGED_SYSTEM_PER_RUN,
      remaining:
        (vocIds.length * (vocIds.length - 1)) / 2 -
        VOC_CLUSTER_AUTOGEN_SHADOW_MAX_PAIRS_PER_MANAGED_SYSTEM_PER_RUN,
    });
    const loggedWorkspaces = info[0]?.meta?.workspaces as
      | Array<{ workspace_id: string; managed_systems: unknown[] }>
      | undefined;
    expect(loggedWorkspaces?.[0]?.workspace_id).toBe(WORKSPACE_ID);
    expect(loggedWorkspaces?.[0]?.managed_systems).toHaveLength(1);
  });

  it('keeps pair selection and records isolated by workspace', async () => {
    const workspaceOnePair = await seedPair();
    const secondWorkspace = await migrateHandle.pool.query<{ id: string }>(
      'insert into core.workspaces (name) values ($1) returning id',
      [`${FIXTURE_PREFIX}-workspace`],
    );
    const secondWorkspaceId = secondWorkspace.rows[0]?.id;
    if (!secondWorkspaceId) throw new Error('second workspace fixture was not created');
    const secondActor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors
         (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, 'Cluster shadow fixture', 'admin', 'internal_member')
       returning id`,
      [secondWorkspaceId, `${FIXTURE_PREFIX}-actor`, `${FIXTURE_PREFIX}@example.test`],
    );
    const secondActorId = secondActor.rows[0]?.id;
    if (!secondActorId) throw new Error('second workspace actor fixture was not created');
    const secondManagedSystemId = await insertMsDirectly(
      migrateHandle,
      secondWorkspaceId,
      `${FIXTURE_PREFIX}-workspace-two-ms`,
      'Workspace two cluster shadow target',
    );
    const workspaceTwoPair = await seedPair(
      ['[1,0]', '[0.8,0.6]'],
      secondManagedSystemId,
      secondWorkspaceId,
      secondActorId,
    );

    await runShadow();

    const result = await appHandle.pool.query<ShadowRow>(
      `select workspace_id, primary_managed_system_id, voc_id_low, voc_id_high,
              embedding_version, score, would_form, last_run_id, seen_count
         from voc.voc_cluster_autogen_shadow_candidates
        where (workspace_id = $1::uuid and primary_managed_system_id = $3::uuid)
           or (workspace_id = $2::uuid and primary_managed_system_id = $4::uuid)
        order by workspace_id`,
      [WORKSPACE_ID, secondWorkspaceId, msId, secondManagedSystemId],
    );
    expect(result.rows).toHaveLength(2);
    const workspaceOneRows = result.rows.filter((row) => row.workspace_id === WORKSPACE_ID);
    const workspaceTwoRows = result.rows.filter((row) => row.workspace_id === secondWorkspaceId);
    expect(workspaceOneRows).toHaveLength(1);
    expect(workspaceTwoRows).toHaveLength(1);
    expect(workspaceOneRows[0]).toMatchObject({
      workspace_id: WORKSPACE_ID,
      primary_managed_system_id: msId,
    });
    expect(workspaceTwoRows[0]).toMatchObject({
      workspace_id: secondWorkspaceId,
      primary_managed_system_id: secondManagedSystemId,
    });
    expect(new Set([workspaceOneRows[0]?.voc_id_low, workspaceOneRows[0]?.voc_id_high])).toEqual(
      new Set(workspaceOnePair),
    );
    expect(new Set([workspaceTwoRows[0]?.voc_id_low, workspaceTwoRows[0]?.voc_id_high])).toEqual(
      new Set(workspaceTwoPair),
    );
    expect(workspaceOnePair.some((id) => workspaceTwoPair.includes(id))).toBe(false);
  });

  it('does not alter clusters, members, decisions, or audit rows', async () => {
    const isolatedWorkspace = await migrateHandle.pool.query<{ id: string }>(
      'insert into core.workspaces (name) values ($1) returning id',
      [`${FIXTURE_PREFIX}-side-effects-workspace`],
    );
    const workspaceId = isolatedWorkspace.rows[0]?.id;
    if (!workspaceId) throw new Error('side-effect workspace fixture was not created');
    const isolatedActor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors
         (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, 'Cluster shadow side-effect fixture', 'admin', 'internal_member')
       returning id`,
      [
        workspaceId,
        `${FIXTURE_PREFIX}-side-effects-actor`,
        `${FIXTURE_PREFIX}-side-effects@example.test`,
      ],
    );
    const reporterId = isolatedActor.rows[0]?.id;
    if (!reporterId) throw new Error('side-effect actor fixture was not created');
    const managedSystemId = await insertMsDirectly(
      migrateHandle,
      workspaceId,
      `${FIXTURE_PREFIX}-side-effects-ms`,
      'Cluster shadow side-effect target',
    );
    await seedPair(['[1,0]', '[0.8,0.6]'], managedSystemId, workspaceId, reporterId);
    const counts = async () =>
      appHandle.pool.query<{
        clusters: number;
        members: number;
        decisions: number;
        audit_rows: number;
      }>(
        `select
           (select count(*)::int from voc_cluster.voc_clusters where workspace_id = $1) as clusters,
           (select count(*)::int
              from voc_cluster.voc_cluster_members member
              join voc_cluster.voc_clusters cluster on cluster.id = member.cluster_id
             where cluster.workspace_id = $1) as members,
           (select count(*)::int from voc.voc_recommendation_decisions where workspace_id = $1) as decisions,
           (select count(*)::int from core.audit_log where workspace_id = $1) as audit_rows`,
        [workspaceId],
      );
    const before = await counts();

    await runShadow();

    const after = await counts();
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(await rowsForManagedSystem(managedSystemId)).toHaveLength(1);
  });
});
