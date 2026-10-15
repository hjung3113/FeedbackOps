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
    await migrate.pool.query('delete from core.entity_links where workspace_id=$1', [workspace]);
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

  it('keeps provenance, membership, links and conversion updates in temporal order (F1)', async () => {
    const invalid = await handle.pool.query(
      `with entities as (
        ${tables.map(([table, entity]) => `select id, created_at, updated_at, '${entity === 'cluster' ? 'voc_cluster' : entity}' type from ${table} where workspace_id=$1`).join(' union all ')}
      ), edges as (
        select 'finding origin' kind, f.id, f.created_at derived, v.created_at source
        from finding.findings f join voc.vocs v on v.id=f.source_id
        where f.workspace_id=$1 and f.source_type='voc'
        union all
        select 'request source', r.id, r.created_at, s.created_at
        from task_request.task_requests r join entities s on s.id=r.source_id and s.type=r.source_type
        where r.workspace_id=$1
        union all
        select 'converted task', t.id, t.created_at, r.created_at
        from task.tasks t join task_request.task_requests r on r.id=t.source_task_request_id
        where t.workspace_id=$1
        union all
        select 'cluster member', m.voc_id, m.added_at, greatest(c.created_at,v.created_at)
        from voc_cluster.voc_cluster_members m join voc_cluster.voc_clusters c on c.id=m.cluster_id
        join voc.vocs v on v.id=m.voc_id where c.workspace_id=$1 and c.id<>$2
        union all
        select 'link', l.id, l.created_at, greatest(s.created_at,t.created_at)
        from core.entity_links_app l join entities s on s.id=l.source_id and s.type=l.source_type
        join entities t on t.id=l.target_id and t.type=l.target_type where l.workspace_id=$1
        union all
        select 'request conversion update', r.id, r.updated_at, t.created_at
        from task_request.task_requests r join task.tasks t on t.source_task_request_id=r.id
        where r.workspace_id=$1 and r.status='converted'
        union all
        select 'finding conversion update', f.id, f.updated_at, t.created_at
        from finding.findings f join task.tasks t on t.id=f.linked_task_id
        where f.workspace_id=$1 and f.status='converted'
        union all
        select 'request decision', r.id, r.decided_at, r.created_at
        from task_request.task_requests r where r.workspace_id=$1 and r.decided_at is not null
      ) select kind,id from edges where derived<source`,
      [workspace, cluster],
    );
    expect(invalid.rows).toEqual([]);
  });

  it.each(['voc.vocs', 'task.tasks'])(
    'keeps plausible five-year recency in %s (C1)',
    async (table) => {
      const result = await handle.pool.query(
        `select count(*) filter(where created_at>=now()-interval '30 days')::int last_30_days,
          count(*) filter(where created_at>=now()-interval '24 hours')::int last_day,
          count(*) filter(where created_at>now())::int future,
          extract(epoch from (now()-min(created_at)))/86400 oldest_days
        from ${table} where workspace_id=$1 ${table === 'voc.vocs' ? "and display_id not like 'VOC-SEED-%'" : ''}`,
        [workspace],
      );
      expect(result.rows[0].last_30_days).toBeGreaterThanOrEqual(120);
      expect(result.rows[0].last_30_days).toBeLessThanOrEqual(250);
      expect(result.rows[0].last_day).toBeLessThanOrEqual(15);
      expect(result.rows[0].future).toBe(0);
      expect(Number(result.rows[0].oldest_days)).toBeGreaterThanOrEqual(1824);
      expect(Number(result.rows[0].oldest_days)).toBeLessThan(1827);
    },
  );

  it.each(['voc.vocs', 'task.tasks'])(
    'varies neighbouring recent titles in %s (C2)',
    async (table) => {
      const result = await handle.pool.query(
        `with newest as (select id,title,created_at from ${table} where workspace_id=$1
          ${table === 'voc.vocs' ? "and display_id not like 'VOC-SEED-%'" : ''}
          order by created_at desc,id limit 50), neighbours as (
          select title,lag(title) over(order by created_at desc,id) previous from newest
        ) select count(distinct title)::int titles,
          count(*) filter(where title=previous)::int repeated_neighbours from neighbours`,
        [workspace],
      );
      expect(result.rows[0].titles).toBeGreaterThanOrEqual(45);
      expect(result.rows[0].repeated_neighbours).toBe(0);
    },
  );

  it('keeps needs-information VOCs in nonterminal reporter states (F2)', async () => {
    const result = await handle.pool.query(
      `select count(*)::int total, count(*) filter(where reporter_facing_status in ('resolved','closed'))::int terminal
      from voc.vocs where workspace_id=$1 and triage_state='needs_more_information'`,
      [workspace],
    );
    expect(result.rows[0].total).toBeGreaterThan(0);
    expect(result.rows[0].terminal).toBe(0);
  });

  it('supplies released VOC-linked work and pending reporter updates (F3)', async () => {
    const result = await handle.pool.query(
      `select count(distinct t.id)::int released,
        count(distinct t.id) filter(where v.reporter_facing_status not in ('resolved','closed'))::int pending_update
      from task.tasks t join core.entity_links_app l on l.target_id=t.id and l.target_type='task'
        and l.source_type='voc' and l.relation_type='evidence_of' and l.status='active'
      join voc.vocs v on v.id=l.source_id
      where t.workspace_id=$1 and t.status='released' and t.source_task_request_id is not null
        and v.display_id not like 'VOC-SEED-%'`,
      [workspace],
    );
    expect(result.rows[0].released).toBeGreaterThan(0);
    expect(result.rows[0].pending_update).toBeGreaterThan(0);
    const open = await handle.pool.query(
      `select count(*)::int n from task.tasks where workspace_id=$1 and status not in ('done','released')`,
      [workspace],
    );
    expect(open.rows[0].n).toBe(300);
  });
});
