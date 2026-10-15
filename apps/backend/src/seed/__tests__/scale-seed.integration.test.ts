// Opt-in only: run on a disposable preview DB, separately from other seed suites.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type DbHandle, createDb } from '../../db/client.js';
import { runSeed } from '../index.js';

const enabled = Boolean(
  process.env.PREVIEW_SCALE === '1' &&
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL_MIGRATE &&
    process.env.WORKSPACE_ID,
);
const tables = [
  ['voc.vocs', 'voc', 5000],
  ['task.tasks', 'task', 5000],
  ['finding.findings', 'finding', 300],
  ['task_request.task_requests', 'task_request', 250],
  ['voc_cluster.voc_clusters', 'cluster', 60],
  ['task.milestones', 'milestone', 25],
] as const;

describe.skipIf(!enabled)('preview scale seed through runSeed', () => {
  let handle: DbHandle;
  let migrate: DbHandle;
  const workspace = randomUUID();
  let baselineVoc: string;
  let cluster: string;
  const count = async (table: string) => {
    const result = await handle.pool.query(
      `select count(*)::int n from ${table} where workspace_id=$1`,
      [workspace],
    );
    return result.rows[0].n as number;
  };
  const snapshot = async () =>
    Promise.all([
      ...tables.map(([table]) => count(table)),
      count('core.actors'),
      count('core.entity_links_app'),
      handle.pool
        .query(
          `select count(*)::int n from voc_cluster.voc_cluster_members m
      join voc_cluster.voc_clusters c on c.id=m.cluster_id where c.workspace_id=$1`,
          [workspace],
        )
        .then((r) => r.rows[0].n as number),
    ]);

  beforeAll(async () => {
    handle = createDb(process.env.DATABASE_URL ?? '');
    migrate = createDb(process.env.DATABASE_URL_MIGRATE ?? '');
    vi.stubEnv('WORKSPACE_ID', workspace);
    vi.stubEnv('SEED_MODE', 'core');
    await runSeed(handle);
    const existing = await handle.pool.query(
      `select v.id, v.primary_managed_system_id ms, a.id actor
      from voc.vocs v join core.actors a on a.workspace_id=v.workspace_id and a.external_id='mock-admin-1'
      where v.workspace_id=$1 and v.display_id like 'VOC-SEED-%' order by v.display_id limit 1`,
      [workspace],
    );
    baselineVoc = existing.rows[0].id;
    cluster = randomUUID();
    await handle.pool.query(
      `insert into voc_cluster.voc_clusters
      (id,workspace_id,display_id,title,primary_managed_system_id,created_by)
      values ($1,$2,core.next_display_id($2,'cluster'),'[preview] baseline preservation',$3,$4)`,
      [cluster, workspace, existing.rows[0].ms, existing.rows[0].actor],
    );
    await handle.pool.query(
      `insert into voc_cluster.voc_cluster_members(cluster_id,voc_id,added_by)
      values($1,$2,$3)`,
      [cluster, baselineVoc, existing.rows[0].actor],
    );
    vi.stubEnv('SEED_MODE', 'scale');
    await runSeed(handle);
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    try {
      if (migrate) {
        // Dedicated workspace: remove only this suite's rows, in FK order.
        await migrate.db.execute(
          sql`delete from core.entity_links where workspace_id=${workspace}`,
        );
        await migrate.pool.query(
          `delete from voc_cluster.voc_cluster_members where cluster_id in
          (select id from voc_cluster.voc_clusters where workspace_id=$1)`,
          [workspace],
        );
        for (const table of [
          'task.tasks',
          'task_request.task_requests',
          'finding.findings',
          'task.milestones',
          'voc_cluster.voc_clusters',
          'voc.vocs',
          'permission.permission_grants',
          'core.analytics_areas',
          'core.managed_systems',
          'core.teams',
          'core.actors',
          'core.display_counters',
          'voc.workspace_display_counters',
        ]) {
          await migrate.pool.query(`delete from ${table} where workspace_id=$1`, [workspace]);
        }
        await migrate.pool.query('delete from core.workspaces where id=$1', [workspace]);
      }
    } finally {
      await handle?.close();
      await migrate?.close();
    }
  });

  it('adds the target volumes, members, evidence and reporters (a)', async () => {
    for (const [table, , expected] of tables) {
      const total = await count(table);
      expect(total).toBeGreaterThanOrEqual(expected);
      expect(total).toBeLessThanOrEqual(expected + 20);
    }
    expect(await count('core.actors')).toBe(48); // 7 personas/core + 40 reporters + marker
    const totals = await snapshot();
    expect(totals[7]).toBeGreaterThanOrEqual(3000);
    expect(totals[7]).toBeLessThanOrEqual(5500);
    expect(totals[8]).toBeGreaterThanOrEqual(180);
    expect(totals[8]).toBeLessThanOrEqual(1201);
    const invalidEvidence = await handle.pool.query(
      `select f.id from finding.findings f
      left join core.entity_links_app l on l.target_type='finding' and l.target_id=f.id
        and l.source_type='voc' and l.relation_type='evidence_of'
      where f.workspace_id=$1 group by f.id
      having count(l.id) not between 2 and 15 or count(l.id)<>f.evidence_count`,
      [workspace],
    );
    expect(invalidEvidence.rows).toEqual([]);
    const invalidMembers = await handle.pool.query(
      `select c.id from voc_cluster.voc_clusters c
      left join voc_cluster.voc_cluster_members m on m.cluster_id=c.id
      where c.workspace_id=$1 and c.id<>$2 group by c.id
      having count(m.voc_id) not between 3 and 20`,
      [workspace, cluster],
    );
    expect(invalidMembers.rows).toEqual([]);
  });

  it('inserts zero rows on a second run (b)', async () => {
    const before = await snapshot();
    const result = await runSeed(handle);
    expect(await snapshot()).toEqual(before);
    expect(result.vocsInserted).toBe(0);
    expect(result.personaActorsInserted).toBe(0);
    expect(result.personaGrantsInserted).toBe(0);
  }, 120_000);

  it('preserves baseline VOC and preview membership across both runs (c)', async () => {
    const rows = await handle.pool.query(
      `select v.id from voc_cluster.voc_cluster_members m
      join voc.vocs v on v.id=m.voc_id where m.cluster_id=$1 and v.id=$2
      and v.display_id like 'VOC-SEED-%'`,
      [cluster, baselineVoc],
    );
    expect(rows.rowCount).toBe(1);
  });

  it('completes a partial cohort after the marker and late group are removed (d)', async () => {
    const before = await snapshot();
    // Remove the late Task group and its links; migrate is used only for test cleanup.
    await migrate.pool.query('delete from core.entity_links where workspace_id=$1', [
      workspace,
    ]);
    await migrate.pool.query('delete from task.tasks where workspace_id=$1', [workspace]);
    await migrate.pool.query(
      `delete from core.actors where workspace_id=$1
      and external_id='fops-preview-scale-complete'`,
      [workspace],
    );
    await runSeed(handle);
    expect(await snapshot()).toEqual(before);
  }, 120_000);

  it('allocates unique display IDs and advances all counters beyond their suffixes (e)', async () => {
    for (const [table, entity] of tables) {
      const rows = await handle.pool.query(
        `select count(*)::int n, count(distinct display_id)::int unique_n,
        max(substring(display_id from '([0-9]+)$')::bigint) filter(where display_id not like 'VOC-SEED-%')::int maximum
        from ${table} where workspace_id=$1`,
        [workspace],
      );
      expect(rows.rows[0].n).toBe(rows.rows[0].unique_n);
      const counter =
        entity === 'voc'
          ? await handle.pool.query(
              'select next_value from voc.workspace_display_counters where workspace_id=$1',
              [workspace],
            )
          : await handle.pool.query(
              'select next_value from core.display_counters where workspace_id=$1 and entity_type=$2',
              [workspace, entity],
            );
      expect(Number(counter.rows[0].next_value)).toBeGreaterThan(rows.rows[0].maximum);
    }
  });

  it('resolves every link endpoint inside the same workspace and Managed System (f)', async () => {
    const rows = await handle.pool.query(
      `with entities as (
      ${tables.map(([table, entity]) => `select id, workspace_id, primary_managed_system_id ms, '${entity === 'cluster' ? 'voc_cluster' : entity}' type from ${table}`).join(' union all ')}
    ) select l.id from core.entity_links_app l
      left join entities s on s.id=l.source_id and s.type=l.source_type
      left join entities t on t.id=l.target_id and t.type=l.target_type
      where l.workspace_id=$1 and (s.id is null or t.id is null or s.workspace_id<>l.workspace_id
      or t.workspace_id<>l.workspace_id or s.ms<>l.managed_system_id or t.ms<>l.managed_system_id)`,
      [workspace],
    );
    expect(rows.rows).toEqual([]);
  });
});
