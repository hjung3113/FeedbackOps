import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

if (!runIntegration) {
  console.warn('[voc-embeddings] skipping — set DATABASE_URL, DATABASE_URL_MIGRATE to run.');
}

function requiredId(row: { id: string } | undefined, label: string): string {
  if (!row?.id) throw new Error(`${label} insert returned no id`);
  return row.id;
}

describe.skipIf(!runIntegration)('VOC embedding store migration 0042', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  const workspaceId = randomUUID();
  let actorId: string;
  let managedSystemId: string;
  let workspaceCreated = false;

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);

    const extension = await migrateHandle.pool.query<{ extname: string }>(
      `select extname from pg_extension where extname = 'vector'`,
    );
    expect(extension.rows).toEqual([{ extname: 'vector' }]);

    const table = await migrateHandle.pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'voc' and table_name = 'voc_embeddings'`,
    );
    expect(table.rows).toEqual([{ table_name: 'voc_embeddings' }]);

    await migrateHandle.pool.query(
      'insert into core.workspaces (id, name) values ($1, $2)',
      [workspaceId, 'VOC embedding test workspace'],
    );
    workspaceCreated = true;
    const actor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level)
       values ($1, $2, $3, $4, 'admin') returning id`,
      [
        workspaceId,
        `voc-embedding-test-${workspaceId}`,
        `voc-embedding-test-${workspaceId}@local`,
        'VOC Embedding Test Actor',
      ],
    );
    actorId = requiredId(actor.rows[0], 'actor');
    const managedSystem = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3) returning id`,
      [
        workspaceId,
        `voc-embedding-${workspaceId}`,
        'VOC Embedding Test System',
      ],
    );
    managedSystemId = requiredId(managedSystem.rows[0], 'managed system');
  });

  afterAll(async () => {
    // Children first: actors and managed_systems both FK to the workspace with
    // no ON DELETE CASCADE, so deleting the workspace first aborts teardown and
    // leaks every row this suite wrote.
    if (workspaceCreated) {
      await migrateHandle?.pool.query('delete from voc.vocs where workspace_id = $1', [
        workspaceId,
      ]);
      await migrateHandle?.pool.query(
        'delete from core.managed_systems where workspace_id = $1',
        [workspaceId],
      );
      await migrateHandle?.pool.query('delete from core.actors where workspace_id = $1', [
        workspaceId,
      ]);
      await migrateHandle?.pool.query(
        'delete from core.workspaces where id = $1',
        [workspaceId],
      );
    }
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function insertVoc(): Promise<string> {
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into voc.vocs (
         workspace_id, display_id, primary_managed_system_id, reporter_id,
         title, description_rich_content, source_context
       ) values ($1, $2, $3, $4, $5, '{}'::jsonb, 'direct_use') returning id`,
      [
        workspaceId,
        `VOC-embedding-${randomUUID()}`,
        managedSystemId,
        actorId,
        'Embedding test VOC',
      ],
    );
    return requiredId(result.rows[0], 'VOC');
  }

  async function insertEmbedding(
    vocId: string,
    version: number,
    vector = '[1,0,0]',
  ) {
    return migrateHandle.pool.query(
      `insert into voc.voc_embeddings (
         voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding, source_hash
       ) values ($1, $2, $3, 'test-provider', 'test-model', 3, $4::vector, 'source-hash')`,
      [vocId, workspaceId, version, vector],
    );
  }

  it('permits exactly one embedding per VOC and version while retaining prior versions', async () => {
    const vocId = await insertVoc();
    await insertEmbedding(vocId, 1);
    await expect(insertEmbedding(vocId, 1)).rejects.toMatchObject({
      code: '23505',
    });
    await insertEmbedding(vocId, 2);

    const rows = await migrateHandle.pool.query<{ embedding_version: number }>(
      `select embedding_version from voc.voc_embeddings where voc_id = $1 order by embedding_version`,
      [vocId],
    );
    expect(rows.rows).toEqual([
      { embedding_version: 1 },
      { embedding_version: 2 },
    ]);
  });

  it('cascades an embedding away when its VOC is deleted', async () => {
    const vocId = await insertVoc();
    await insertEmbedding(vocId, 1);
    await migrateHandle.pool.query('delete from voc.vocs where id = $1', [
      vocId,
    ]);

    const rows = await migrateHandle.pool.query(
      'select 1 from voc.voc_embeddings where voc_id = $1',
      [vocId],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('grants fops_app DML but rejects its DDL', async () => {
    const vocId = await insertVoc();
    const role = await appHandle.pool.query<{
      current_user: string;
      rolsuper: boolean;
    }>(
      `select current_user, rolsuper
       from pg_roles where rolname = current_user`,
    );
    expect(role.rows).toEqual([{ current_user: 'fops_app', rolsuper: false }]);
    await appHandle.pool.query(
      `insert into voc.voc_embeddings (
         voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding, source_hash
       ) values ($1, $2, 1, 'app-provider', 'app-model', 3, '[1,0,0]'::vector, 'app-source-hash')`,
      [vocId, workspaceId],
    );
    const selected = await appHandle.pool.query<{ provider: string }>(
      'select provider from voc.voc_embeddings where voc_id = $1 and embedding_version = 1',
      [vocId],
    );
    expect(selected.rows).toEqual([{ provider: 'app-provider' }]);
    await appHandle.pool.query(
      `update voc.voc_embeddings set provider = 'updated-provider'
       where voc_id = $1 and embedding_version = 1`,
      [vocId],
    );
    const updated = await appHandle.pool.query<{ provider: string }>(
      'select provider from voc.voc_embeddings where voc_id = $1 and embedding_version = 1',
      [vocId],
    );
    expect(updated.rows).toEqual([{ provider: 'updated-provider' }]);
    await appHandle.pool.query(
      'delete from voc.voc_embeddings where voc_id = $1 and embedding_version = 1',
      [vocId],
    );
    await expect(
      appHandle.pool.query('drop table voc.voc_embeddings'),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('round-trips vectors and supports cosine distance', async () => {
    const vocId = await insertVoc();
    await insertEmbedding(vocId, 1, '[1,0,0]');

    // Self-distance alone proves nothing — `x <=> x` is 0 for every vector.
    // Compare against a hand-computed identical, orthogonal, and opposite
    // probe so a broken operator or a mangled round-trip cannot pass.
    const result = await migrateHandle.pool.query<{
      embedding: string;
      same: number;
      orthogonal: number;
      opposite: number;
    }>(
      `select embedding::text as embedding,
              embedding <=> '[1,0,0]'::vector  as same,
              embedding <=> '[0,1,0]'::vector  as orthogonal,
              embedding <=> '[-1,0,0]'::vector as opposite
       from voc.voc_embeddings where voc_id = $1 and embedding_version = 1`,
      [vocId],
    );
    expect(result.rows).toEqual([
      { embedding: '[1,0,0]', same: 0, orthogonal: 1, opposite: 2 },
    ]);
  });
});
