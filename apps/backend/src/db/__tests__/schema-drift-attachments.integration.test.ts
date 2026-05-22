// Slice 3 #22 / Chunk C2 — schema drift tests for migration 0012.
//
// Asserts the post-0012 shape of voc.voc_attachments:
//   * column rename: storage_uri → storage_key
//   * storage_key has UNIQUE constraint (NOT NULL preserved from 0010)
//   * linked_at timestamptz NULL column added
//   * subject XOR relaxed: (voc_id IS NULL AND comment_id IS NULL) permitted
//   * subject XOR still rejects (voc_id IS NOT NULL AND comment_id IS NOT NULL)
//   * uploaded_by_actor_id remains NOT NULL (no-op assertion, regression guard)
//
// Uses DATABASE_URL_MIGRATE so the migrate role can INSERT freely. Per
// AGENTS.md backend guide: this is a real integration test against live
// Postgres; if env is missing the suite is skipped with a visible warning.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

if (!runIntegration) {
  console.warn(
    '[schema-drift-attachments] skipping — set DATABASE_URL, DATABASE_URL_MIGRATE, WORKSPACE_ID to run.',
  );
}

describe.skipIf(!runIntegration)('Slice 3 #22 migration 0012 — voc_attachments drift', () => {
  let handle: DbHandle;
  let workspaceId: string;
  let msId: string;
  let actorId: string;
  let vocId: string;
  let commentId: string;

  beforeAll(async () => {
    handle = createDb(MIGRATE_URL);

    workspaceId = WORKSPACE_ID;
    expect(workspaceId).not.toBe('');

    const ms = await handle.pool.query<{ id: string }>(
      `select id from core.managed_systems where workspace_id = $1 order by created_at limit 1`,
      [workspaceId],
    );
    msId = ms.rows[0]?.id ?? '';
    expect(msId).not.toBe('');

    const actor = await handle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 limit 1`,
      [workspaceId],
    );
    actorId = actor.rows[0]?.id ?? '';
    expect(actorId).not.toBe('');

    const voc = await handle.pool.query<{ id: string }>(
      `insert into voc.vocs (
         workspace_id, display_id, primary_managed_system_id, reporter_id,
         title, description_rich_content, source_context
       ) values (
         $1, voc.next_voc_display_id($1), $2, $3,
         'test-c2-attachments-drift',
         '{"type":"doc","content":[]}'::jsonb,
         'direct_use'
       ) returning id`,
      [workspaceId, msId, actorId],
    );
    vocId = voc.rows[0]?.id ?? '';
    expect(vocId).not.toBe('');

    const comment = await handle.pool.query<{ id: string }>(
      `insert into voc.voc_internal_comments (
         voc_id, actor_id, body_rich_content
       ) values (
         $1, $2, '{"type":"doc","content":[]}'::jsonb
       ) returning id`,
      [vocId, actorId],
    );
    commentId = comment.rows[0]?.id ?? '';
    expect(commentId).not.toBe('');
  });

  afterAll(async () => {
    await handle.pool.query(
      `delete from voc.voc_attachments where storage_key like 's3://test-c2/%'`,
    );
    await handle.pool.query(
      `delete from voc.vocs where title = 'test-c2-attachments-drift'`,
    );
    await handle.close();
  });

  // ─── Column existence + shape ──────────────────────────────────────────
  it('storage_key column exists, NOT NULL, and storage_uri is gone', async () => {
    const cols = await handle.pool.query<{
      column_name: string;
      is_nullable: string;
      data_type: string;
    }>(
      `select column_name, is_nullable, data_type
         from information_schema.columns
        where table_schema = 'voc'
          and table_name = 'voc_attachments'
          and column_name in ('storage_key', 'storage_uri')`,
    );
    const byName = new Map(cols.rows.map((r) => [r.column_name, r]));
    expect(byName.has('storage_key')).toBe(true);
    expect(byName.get('storage_key')?.is_nullable).toBe('NO');
    expect(byName.has('storage_uri')).toBe(false);
  });

  it('storage_key has a UNIQUE constraint', async () => {
    const result = await handle.pool.query<{ conname: string }>(
      `select c.conname
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'voc'
          and t.relname = 'voc_attachments'
          and c.contype = 'u'
          and pg_get_constraintdef(c.oid) ilike '%(storage_key)%'`,
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('linked_at column exists, nullable, timestamptz', async () => {
    const cols = await handle.pool.query<{
      column_name: string;
      is_nullable: string;
      data_type: string;
    }>(
      `select column_name, is_nullable, data_type
         from information_schema.columns
        where table_schema = 'voc'
          and table_name = 'voc_attachments'
          and column_name = 'linked_at'`,
    );
    expect(cols.rows.length).toBe(1);
    expect(cols.rows[0]?.is_nullable).toBe('YES');
    expect(cols.rows[0]?.data_type).toBe('timestamp with time zone');
  });

  it('uploaded_by_actor_id remains NOT NULL (regression guard)', async () => {
    const cols = await handle.pool.query<{ is_nullable: string }>(
      `select is_nullable
         from information_schema.columns
        where table_schema = 'voc'
          and table_name = 'voc_attachments'
          and column_name = 'uploaded_by_actor_id'`,
    );
    expect(cols.rows[0]?.is_nullable).toBe('NO');
  });

  // ─── XOR check relaxation ──────────────────────────────────────────────
  it('subject xor relaxed: row with voc_id NULL AND comment_id NULL is permitted', async () => {
    const result = await handle.pool.query<{ id: string }>(
      `insert into voc.voc_attachments (
         name, size_bytes, mime_type, storage_key, uploaded_by_actor_id
       ) values (
         'unlinked.pdf', 1024, 'application/pdf',
         's3://test-c2/unlinked-' || gen_random_uuid()::text || '.pdf',
         $1
       ) returning id`,
      [actorId],
    );
    expect(result.rows[0]?.id).toBeDefined();
  });

  it('subject xor still rejects voc_id IS NOT NULL AND comment_id IS NOT NULL', async () => {
    await expect(
      handle.pool.query(
        `insert into voc.voc_attachments (
           voc_id, comment_id, comment_kind,
           name, size_bytes, mime_type, storage_key, uploaded_by_actor_id
         ) values (
           $1, $2, 'internal_comment',
           'both.pdf', 1024, 'application/pdf',
           's3://test-c2/both-' || gen_random_uuid()::text || '.pdf',
           $3
         )`,
        [vocId, commentId, actorId],
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/voc_attachments_subject_(xor|not_both)/),
    });
  });

  // ─── storage_key uniqueness exercised ──────────────────────────────────
  it('duplicate storage_key insert is rejected', async () => {
    const key = 's3://test-c2/dup-' + Date.now() + '.pdf';
    await handle.pool.query(
      `insert into voc.voc_attachments (
         voc_id, name, size_bytes, mime_type, storage_key, uploaded_by_actor_id
       ) values (
         $1, 'first.pdf', 1, 'application/pdf', $2, $3
       )`,
      [vocId, key, actorId],
    );
    await expect(
      handle.pool.query(
        `insert into voc.voc_attachments (
           voc_id, name, size_bytes, mime_type, storage_key, uploaded_by_actor_id
         ) values (
           $1, 'second.pdf', 1, 'application/pdf', $2, $3
         )`,
        [vocId, key, actorId],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('voc_attachments_storage_key_unique'),
    });
  });
});
