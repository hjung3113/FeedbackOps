import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { insertActorRow } from '../../test-support/actor-fixtures.js';
import { insertVocClusterRow } from '../../test-support/voc-cluster-fixtures.js';
import { insertVocDirectly } from '../../test-support/voc-fixtures.js';
import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && process.env.WORKSPACE_ID);

// Inert storage has no command/route: SQL is its public seam. No provider or job runs here.
describe.skipIf(!runIntegration)('ADR-0068 inert Cluster suggestion storage', () => {
  let app: DbHandle;
  let migrate: DbHandle;
  const workspaceId = randomUUID();
  const foreignWorkspaceId = randomUUID();
  const msId = randomUUID();
  const otherMsId = randomUUID();
  const foreignMsId = randomUUID();
  let actorId: string;
  let foreignActorId: string;
  let pair: string[];
  let otherVocId: string;
  let foreignVocId: string;
  let clusterId: string;
  let otherClusterId: string;
  let foreignClusterId: string;

  beforeAll(async () => {
    app = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    expect((await app.pool.query('select current_user')).rows[0]?.current_user).toBe('fops_app');
    expect((await migrate.pool.query('select current_user')).rows[0]?.current_user).toBe(
      'fops_migrate',
    );
    for (const id of [workspaceId, foreignWorkspaceId]) {
      await migrate.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
        id,
        'Suggestion fixture',
      ]);
    }
    actorId = (
      await insertActorRow(migrate, {
        workspaceId,
        externalId: `suggestion-${randomUUID()}`,
        roleLevel: 'admin',
      })
    ).id;
    foreignActorId = (
      await insertActorRow(migrate, {
        workspaceId: foreignWorkspaceId,
        externalId: `suggestion-${randomUUID()}`,
        roleLevel: 'admin',
      })
    ).id;
    for (const [id, workspace] of [
      [msId, workspaceId],
      [otherMsId, workspaceId],
      [foreignMsId, foreignWorkspaceId],
    ]) {
      await migrate.pool.query(
        'insert into core.managed_systems (id, workspace_id, slug, name) values ($1, $2, $3, $3)',
        [id, workspace, `suggestion-${id}`],
      );
    }
    pair = (
      await Promise.all(
        [1, 2].map((n) =>
          insertVocDirectly(migrate, workspaceId, msId, actorId, `Suggestion ${n}`),
        ),
      )
    )
      .map((voc) => voc.id)
      .sort();
    otherVocId = (await insertVocDirectly(migrate, workspaceId, otherMsId, actorId, 'Other MS')).id;
    foreignVocId = (
      await insertVocDirectly(
        migrate,
        foreignWorkspaceId,
        foreignMsId,
        foreignActorId,
        'Other workspace',
      )
    ).id;
    clusterId = (
      await insertVocClusterRow(migrate, {
        workspaceId,
        primaryManagedSystemId: msId,
        createdBy: actorId,
        status: 'confirmed',
      })
    ).id;
    otherClusterId = (
      await insertVocClusterRow(migrate, {
        workspaceId,
        primaryManagedSystemId: otherMsId,
        createdBy: actorId,
      })
    ).id;
    foreignClusterId = (
      await insertVocClusterRow(migrate, {
        workspaceId: foreignWorkspaceId,
        primaryManagedSystemId: foreignMsId,
        createdBy: foreignActorId,
      })
    ).id;
  });

  async function clearStorage() {
    for (const table of [
      'voc_cluster_suggestions',
      'voc_cluster_suggestion_counters',
      'voc_cluster_suggestion_admissions',
      'voc_cluster_suggestion_cursors',
    ]) {
      await migrate.pool.query(`delete from voc.${table} where workspace_id = ANY($1::uuid[])`, [
        [workspaceId, foreignWorkspaceId],
      ]);
    }
  }
  beforeEach(async () => {
    await clearStorage();
    await migrate.pool.query('delete from core.rate_limits');
  });
  afterAll(async () => {
    if (!migrate) return;
    await clearStorage();
    for (const table of [
      'voc_cluster.voc_clusters',
      'voc.vocs',
      'core.managed_systems',
      'core.actors',
      'core.display_counters',
      'voc.workspace_display_counters',
      'core.workspaces',
    ]) {
      const column = table === 'core.workspaces' ? 'id' : 'workspace_id';
      await migrate.pool.query(`delete from ${table} where ${column} = ANY($1::uuid[])`, [
        [workspaceId, foreignWorkspaceId],
      ]);
    }
    await app?.close();
    await migrate.close();
  });

  function validRow(): Record<string, unknown> {
    return {
      workspace_id: workspaceId,
      primary_managed_system_id: msId,
      voc_a_id: pair[0],
      voc_b_id: pair[1],
      state: 'pending',
      revision: 1,
      provider: 'test',
      model: 'test-model',
      dimensions: 3,
      embedding_version: 1,
      source_hash_a: 'a'.repeat(64),
      source_hash_b: 'b'.repeat(64),
      embedding_watermark_a: '2026-10-13T00:00:00Z',
      embedding_watermark_b: '2026-10-13T00:00:00Z',
      score: 0.9,
      cut: 0.85,
      run_correlation_id: randomUUID(),
    };
  }
  async function insert(handle: DbHandle, overrides: Record<string, unknown> = {}) {
    const row = { ...validRow(), ...overrides };
    const columns = Object.keys(row);
    const result = await handle.pool.query<{ id: string }>(
      `insert into voc.voc_cluster_suggestions (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
      Object.values(row),
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('suggestion insert returned no id');
    return id;
  }

  it.each(['app', 'migrate'] as const)(
    'allows %s to persist pending, discarded and confirmed rows',
    async (role) => {
      const handle = role === 'app' ? app : migrate;
      for (const fields of [
        {},
        {
          state: 'discarded',
          discarded_by_actor_id: actorId,
          discarded_at: '2026-10-13T00:00:00Z',
        },
        {
          state: 'confirmed',
          confirmed_by_actor_id: actorId,
          confirmed_at: '2026-10-13T00:00:00Z',
          voc_cluster_id: clusterId,
        },
      ]) {
        await clearStorage();
        const id = await insert(handle, fields);
        expect(
          (
            await handle.pool.query(
              'select state, revision from voc.voc_cluster_suggestions where id = $1',
              [id],
            )
          ).rows,
        ).toEqual([{ state: fields.state ?? 'pending', revision: 1 }]);
      }
    },
  );

  it.each(['pending', 'discarded', 'confirmed'])(
    'retains permanent pair uniqueness for %s across versions',
    async (state) => {
      const fields =
        state === 'discarded'
          ? { discarded_by_actor_id: actorId, discarded_at: '2026-10-13T00:00:00Z' }
          : state === 'confirmed'
            ? {
                confirmed_by_actor_id: actorId,
                confirmed_at: '2026-10-13T00:00:00Z',
                voc_cluster_id: clusterId,
              }
            : {};
      await insert(app, { state, ...fields });
      await expect(insert(app, { embedding_version: 2 })).rejects.toMatchObject({ code: '23505' });
      await expect(insert(app, { voc_a_id: pair[1], voc_b_id: pair[0] })).rejects.toMatchObject({
        code: '23514',
      });
      await expect(insert(app, { voc_b_id: pair[0] })).rejects.toMatchObject({ code: '23514' });
    },
  );

  it.each([
    { revision: 0 },
    { state: 'expired' },
    { dimensions: 0 },
    { embedding_version: 0 },
    { provider: '' },
    { model: '' },
    { source_hash_a: '' },
    { source_hash_b: '' },
    { score: 2 },
    { cut: -1 },
    { state: 'discarded' },
    { state: 'discarded', discarded_by_actor_id: 'fixture-actor' },
    { discarded_by_actor_id: 'fixture-actor' },
    { state: 'discarded', discarded_at: '2026-10-13T00:00:00Z' },
    { state: 'confirmed' },
    { voc_cluster_id: null, confirmed_by_actor_id: null, confirmed_at: '2026-10-13T00:00:00Z' },
  ])('rejects invalid lifecycle/scoring metadata %j', async (fields) => {
    await expect(
      insert(app, {
        ...fields,
        ...(fields.discarded_by_actor_id === 'fixture-actor'
          ? { discarded_by_actor_id: actorId }
          : {}),
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it.each(['pending', 'discarded', 'confirmed'])(
    'rejects overlapping terminal fields in %s',
    async (state) => {
      await expect(
        insert(app, {
          state,
          discarded_by_actor_id: actorId,
          discarded_at: '2026-10-13T00:00:00Z',
          confirmed_by_actor_id: actorId,
          confirmed_at: '2026-10-13T00:00:00Z',
          voc_cluster_id: clusterId,
        }),
      ).rejects.toMatchObject({ code: '23514' });
    },
  );

  it.each(['actor', 'time', 'cluster', 'actor,time', 'actor,cluster', 'time,cluster'])(
    'requires all confirmation fields, not only %s',
    async (columns) => {
      const present = columns.split(',');
      await expect(
        insert(app, {
          state: 'confirmed',
          ...(present.includes('actor') ? { confirmed_by_actor_id: actorId } : {}),
          ...(present.includes('time') ? { confirmed_at: '2026-10-13T00:00:00Z' } : {}),
          ...(present.includes('cluster') ? { voc_cluster_id: clusterId } : {}),
        }),
      ).rejects.toMatchObject({ code: '23514' });
    },
  );

  it.each([
    'provider',
    'model',
    'dimensions',
    'embedding_version',
    'source_hash_a',
    'source_hash_b',
    'embedding_watermark_a',
    'embedding_watermark_b',
    'score',
    'cut',
    'run_correlation_id',
  ])('requires %s', async (column) => {
    await expect(insert(app, { [column]: null })).rejects.toMatchObject({ code: '23502' });
  });

  it('rejects foreign workspace/MS references for VOCs, actors and resulting Clusters', async () => {
    for (const vocId of [otherVocId, foreignVocId]) {
      const [a, b] = [pair[0], vocId].sort();
      await expect(insert(app, { voc_a_id: a, voc_b_id: b })).rejects.toMatchObject({
        code: '23514',
      });
    }
    await expect(insert(app, { primary_managed_system_id: foreignMsId })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(
      insert(app, {
        state: 'discarded',
        discarded_by_actor_id: foreignActorId,
        discarded_at: '2026-10-13T00:00:00Z',
      }),
    ).rejects.toMatchObject({ code: '23514' });
    for (const target of [otherClusterId, foreignClusterId]) {
      await expect(
        insert(app, {
          state: 'confirmed',
          confirmed_by_actor_id: actorId,
          confirmed_at: '2026-10-13T00:00:00Z',
          voc_cluster_id: target,
        }),
      ).rejects.toMatchObject({ code: '23514' });
    }
    await expect(
      insert(app, {
        state: 'confirmed',
        confirmed_by_actor_id: foreignActorId,
        confirmed_at: '2026-10-13T00:00:00Z',
        voc_cluster_id: clusterId,
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('keeps pending pair identity immutable while allowing rescoring', async () => {
    const id = await insert(app);
    for (const mutation of [
      'id = gen_random_uuid()',
      'workspace_id = gen_random_uuid()',
      'primary_managed_system_id = gen_random_uuid()',
      'voc_a_id = gen_random_uuid()',
      "created_at = created_at + interval '1 second'",
    ]) {
      await expect(
        app.pool.query(`update voc.voc_cluster_suggestions set ${mutation} where id = $1`, [id]),
      ).rejects.toMatchObject({ code: '23514' });
    }
    await app.pool.query(
      'update voc.voc_cluster_suggestions set score = 0.95, revision = revision + 1, refreshed_at = now() where id = $1',
      [id],
    );
    expect(
      (
        await app.pool.query(
          'select voc_a_id, voc_b_id, score, revision from voc.voc_cluster_suggestions where id = $1',
          [id],
        )
      ).rows,
    ).toEqual([{ voc_a_id: pair[0], voc_b_id: pair[1], score: 0.95, revision: 2 }]);
  });

  it('retains immutable identity, initial timestamp and confirmed reference/scoring metadata', async () => {
    const id = await insert(app, {
      state: 'confirmed',
      confirmed_by_actor_id: actorId,
      confirmed_at: '2026-10-13T00:00:00Z',
      voc_cluster_id: clusterId,
    });
    for (const mutation of [
      "state = 'pending', confirmed_by_actor_id = null, confirmed_at = null, voc_cluster_id = null",
      "created_at = created_at + interval '1 second'",
      'id = gen_random_uuid()',
      'score = 0.95',
      'voc_cluster_id = null',
    ]) {
      await expect(
        app.pool.query(`update voc.voc_cluster_suggestions set ${mutation} where id = $1`, [id]),
      ).rejects.toMatchObject({ code: '23514' });
    }
    await expect(
      migrate.pool.query('delete from voc_cluster.voc_clusters where id = $1', [clusterId]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      migrate.pool.query('delete from voc.vocs where id = $1', [pair[0]]),
    ).rejects.toMatchObject({ code: '23503' });
    expect(
      (
        await app.pool.query(
          'select state, voc_cluster_id, score from voc.voc_cluster_suggestions where id = $1',
          [id],
        )
      ).rows,
    ).toEqual([{ state: 'confirmed', voc_cluster_id: clusterId, score: 0.9 }]);
  });

  it('denies application hard delete in every state, independently of counter reclamation', async () => {
    for (const fields of [
      {},
      { state: 'discarded', discarded_by_actor_id: actorId, discarded_at: '2026-10-13T00:00:00Z' },
      {
        state: 'confirmed',
        confirmed_by_actor_id: actorId,
        confirmed_at: '2026-10-13T00:00:00Z',
        voc_cluster_id: clusterId,
      },
    ]) {
      await clearStorage();
      const id = await insert(app, fields);
      await expect(
        app.pool.query('delete from voc.voc_cluster_suggestions where id = $1', [id]),
      ).rejects.toMatchObject({ code: '42501' });
      expect(
        (await app.pool.query('select id from voc.voc_cluster_suggestions where id = $1', [id]))
          .rowCount,
      ).toBe(1);
    }
    await app.pool.query(
      "insert into voc.voc_cluster_suggestion_admissions (workspace_id, primary_managed_system_id, window_start, new_admissions) values ($1, $2, (date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - interval '2 hours', 1)",
      [workspaceId, msId],
    );
    expect(
      (
        await app.pool.query(
          'delete from voc.voc_cluster_suggestion_admissions where workspace_id = $1 and window_start < now()',
          [workspaceId],
        )
      ).rowCount,
    ).toBe(1);
    await app.pool.query(
      "insert into voc.voc_cluster_suggestion_admissions (workspace_id, primary_managed_system_id, window_start) values ($1, $2, date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
      [workspaceId, msId],
    );
    await expect(
      app.pool.query('delete from voc.voc_cluster_suggestion_admissions where workspace_id = $1', [
        workspaceId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    // A live bucket cannot be re-keyed into an ended hour and then reclaimed.
    await expect(
      app.pool.query(
        "update voc.voc_cluster_suggestion_admissions set window_start = window_start - interval '2 hours' where workspace_id = $1",
        [workspaceId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(app.pool.query('truncate voc.voc_cluster_suggestions')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('stores nonnegative workspace occupancy, UTC hour admissions and committed scan cursors without generation', async () => {
    await app.pool.query(
      'insert into voc.voc_cluster_suggestion_counters (workspace_id, eligible_pending_count) values ($1, 0)',
      [workspaceId],
    );
    await expect(
      app.pool.query(
        'update voc.voc_cluster_suggestion_counters set eligible_pending_count = -1 where workspace_id = $1',
        [workspaceId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await app.pool.query(
      'insert into voc.voc_cluster_suggestion_cursors (workspace_id, primary_managed_system_id, embedding_version, embedding_watermark, last_voc_id) values ($1, $2, 1, $3, $4)',
      [workspaceId, msId, '2026-10-13T00:00:00Z', pair[0]],
    );
    await expect(
      app.pool.query(
        'insert into voc.voc_cluster_suggestion_admissions (workspace_id, primary_managed_system_id, window_start, new_admissions) values ($1, $2, $3, -1)',
        [workspaceId, msId, '2026-10-13T00:00:00Z'],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      app.pool.query(
        'insert into voc.voc_cluster_suggestion_admissions (workspace_id, primary_managed_system_id, window_start) values ($1, $2, $3)',
        [workspaceId, msId, '2026-10-13T00:30:00Z'],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await app.pool.query('select * from voc.voc_cluster_suggestions where workspace_id = $1', [
          workspaceId,
        ])
      ).rowCount,
    ).toBe(0);
  });
});
