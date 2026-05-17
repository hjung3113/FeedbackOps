// Integration tests for Slice 3 #12 voc.vocs table (Task 3).
//
// Verifies: display_id auto-generation via next_voc_display_id(), sequential
// increment, AA→primary_MS integrity trigger, owner XOR CHECK, and severity
// enum CHECK. Uses DATABASE_URL_MIGRATE so the migrate role can insert into
// tables that the app role might not reach during boot.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { type DbHandle, createDb } from '../client.js';

const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('Slice 3 vocs table', () => {
  let handle: DbHandle;
  let workspaceId: string;
  let msId: string;
  let actorId: string;

  beforeAll(async () => {
    handle = createDb(MIGRATE_URL);

    // Prefer WORKSPACE_ID env; fall back to first workspace in DB.
    if (WORKSPACE_ID) {
      workspaceId = WORKSPACE_ID;
    } else {
      const ws = await handle.pool.query<{ id: string }>(
        `select id from core.workspaces limit 1`,
      );
      workspaceId = ws.rows[0]?.id ?? '';
    }
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
  });

  afterAll(async () => {
    // Clean up all test VOCs inserted by this suite.
    await handle.pool.query(
      `delete from voc.vocs where title like 'test-voc-foundation-%'`,
    );
    await handle.close();
  });

  it('inserts a VOC with auto-generated display_id matching /^VOC-\\d+$/', async () => {
    const result = await handle.pool.query<{
      display_id: string;
      reporter_facing_status: string;
      triage_state: string;
    }>(
      `insert into voc.vocs (
         workspace_id, display_id, primary_managed_system_id, reporter_id,
         title, description_rich_content, source_context
       ) values (
         $1, voc.next_voc_display_id($1), $2, $3,
         'test-voc-foundation-basic',
         '{"type":"doc","content":[]}'::jsonb,
         'direct_use'
       ) returning display_id, reporter_facing_status, triage_state`,
      [workspaceId, msId, actorId],
    );
    const row = result.rows[0];
    expect(row).toBeDefined();
    expect(row?.display_id).toMatch(/^VOC-\d+$/);
    expect(row?.reporter_facing_status).toBe('received');
    expect(row?.triage_state).toBe('untriaged');
  });

  it('display_id increments sequentially (3 consecutive inserts → numeric parts differ by 1)', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await handle.pool.query<{ display_id: string }>(
        `insert into voc.vocs (
           workspace_id, display_id, primary_managed_system_id, reporter_id,
           title, description_rich_content, source_context
         ) values (
           $1, voc.next_voc_display_id($1), $2, $3,
           $4,
           '{"type":"doc","content":[]}'::jsonb,
           'direct_use'
         ) returning display_id`,
        [workspaceId, msId, actorId, `test-voc-foundation-seq-${i}`],
      );
      ids.push(r.rows[0]?.display_id ?? '');
    }
    const nums = ids.map((s) => Number(s.replace('VOC-', '')));
    expect(nums[1]).toBe(nums[0]! + 1);
    expect(nums[2]).toBe(nums[1]! + 1);
  });

  it('rejects analytics_area_id whose managed_system_id does not match primary_managed_system_id', async () => {
    // Find an AA that belongs to a DIFFERENT managed system.
    const otherAA = await handle.pool.query<{ id: string }>(
      `select aa.id from core.analytics_areas aa
       where aa.workspace_id = $1 and aa.managed_system_id <> $2
       limit 1`,
      [workspaceId, msId],
    );
    const aaId = otherAA.rows[0]?.id;
    // If no such AA exists in the seed, skip the body gracefully.
    if (!aaId) {
      console.warn('AA-mismatch test skipped: no analytics_area with a different MS in seed');
      return;
    }

    await expect(
      handle.pool.query(
        `insert into voc.vocs (
           workspace_id, display_id, primary_managed_system_id, analytics_area_id,
           reporter_id, title, description_rich_content, source_context
         ) values (
           $1, voc.next_voc_display_id($1), $2, $3,
           $4, 'test-voc-foundation-aa-mismatch',
           '{"type":"doc","content":[]}'::jsonb,
           'direct_use'
         )`,
        [workspaceId, msId, aaId, actorId],
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('analytics_area_managed_system_mismatch') });
  });

  it('rejects both owner_user_id and owner_team_id populated (error: vocs_owner_xor)', async () => {
    // Insert a temporary team for this test.
    const team = await handle.pool.query<{ id: string }>(
      `insert into core.teams (workspace_id, name) values ($1, 'test-voc-foundation-team') returning id`,
      [workspaceId],
    );
    const teamId = team.rows[0]?.id ?? '';

    try {
      await expect(
        handle.pool.query(
          `insert into voc.vocs (
             workspace_id, display_id, primary_managed_system_id,
             reporter_id, title, description_rich_content, source_context,
             owner_user_id, owner_team_id
           ) values (
             $1, voc.next_voc_display_id($1), $2,
             $3, 'test-voc-foundation-owner-xor',
             '{"type":"doc","content":[]}'::jsonb,
             'direct_use',
             $3, $4
           )`,
          [workspaceId, msId, actorId, teamId],
        ),
      ).rejects.toMatchObject({ message: expect.stringContaining('vocs_owner_xor') });
    } finally {
      await handle.pool.query(
        `delete from core.teams where id = $1`,
        [teamId],
      );
    }
  });

  it('rejects invalid severity \'extreme\' (error: vocs_severity_enum)', async () => {
    await expect(
      handle.pool.query(
        `insert into voc.vocs (
           workspace_id, display_id, primary_managed_system_id,
           reporter_id, title, description_rich_content, source_context,
           severity
         ) values (
           $1, voc.next_voc_display_id($1), $2,
           $3, 'test-voc-foundation-bad-severity',
           '{"type":"doc","content":[]}'::jsonb,
           'direct_use',
           'extreme'
         )`,
        [workspaceId, msId, actorId],
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('vocs_severity_enum') });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3 conversation tables (Task 4): voc_public_updates, voc_reporter_replies,
// voc_internal_comments — append-only with role-separated grants.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!runIntegration)('Slice 3 conversation tables', () => {
  let migrateHandle: DbHandle;
  let appHandle: DbHandle;
  let workspaceId: string;
  let msId: string;
  let reporterId: string;
  let nonReporterId: string;
  let vocId: string;

  beforeAll(async () => {
    migrateHandle = createDb(MIGRATE_URL);
    appHandle = createDb(process.env.DATABASE_URL ?? '');

    // Resolve workspace.
    workspaceId = WORKSPACE_ID;
    expect(workspaceId).not.toBe('');

    const ms = await migrateHandle.pool.query<{ id: string }>(
      `select id from core.managed_systems where workspace_id = $1 order by created_at limit 1`,
      [workspaceId],
    );
    msId = ms.rows[0]?.id ?? '';
    expect(msId).not.toBe('');

    // Pick two distinct actors: one will be reporter, the other will be the non-reporter.
    const actors = await migrateHandle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 order by created_at limit 2`,
      [workspaceId],
    );
    reporterId = actors.rows[0]?.id ?? '';
    nonReporterId = actors.rows[1]?.id ?? actors.rows[0]?.id ?? '';
    expect(reporterId).not.toBe('');

    // Insert a shared VOC for this suite.
    const voc = await migrateHandle.pool.query<{ id: string }>(
      `insert into voc.vocs (
         workspace_id, display_id, primary_managed_system_id, reporter_id,
         title, description_rich_content, source_context
       ) values (
         $1, voc.next_voc_display_id($1), $2, $3,
         'test-voc-foundation-conversations',
         '{"type":"doc","content":[]}'::jsonb,
         'direct_use'
       ) returning id`,
      [workspaceId, msId, reporterId],
    );
    vocId = voc.rows[0]?.id ?? '';
    expect(vocId).not.toBe('');
  });

  afterAll(async () => {
    await migrateHandle.pool.query(
      `delete from voc.vocs where title = 'test-voc-foundation-conversations'`,
    );
    await migrateHandle.close();
    await appHandle.close();
  });

  it('public_update with status pair inserts OK', async () => {
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into voc.voc_public_updates (
         voc_id, actor_id, body_rich_content,
         reporter_facing_status_before, reporter_facing_status_after,
         skip_public_update
       ) values (
         $1, $2, '{"type":"doc","content":[]}'::jsonb,
         'received', 'reviewing', false
       ) returning id`,
      [vocId, reporterId],
    );
    expect(result.rows[0]?.id).toBeDefined();
  });

  it('rejects skip_public_update=true with skip_reason shorter than 8 chars (voc_public_updates_skip_reason_min_length)', async () => {
    await expect(
      migrateHandle.pool.query(
        `insert into voc.voc_public_updates (
           voc_id, actor_id, body_rich_content,
           reporter_facing_status_before, reporter_facing_status_after,
           skip_public_update, skip_reason
         ) values (
           $1, $2, '{"type":"doc","content":[]}'::jsonb,
           'received', 'reviewing', true, 'short'
         )`,
        [vocId, reporterId],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('voc_public_updates_skip_reason_min_length'),
    });
  });

  it('reporter_reply trigger rejects non-reporter actor (voc_reporter_reply_actor_must_be_reporter)', async () => {
    // Use a different actor than the reporter.
    const otherActor = await migrateHandle.pool.query<{ id: string }>(
      `select id from core.actors where id <> $1 and workspace_id = $2 limit 1`,
      [reporterId, workspaceId],
    );
    const otherId = otherActor.rows[0]?.id ?? nonReporterId;
    // If there's genuinely only one actor, skip gracefully.
    if (otherId === reporterId) {
      console.warn('reporter_reply non-reporter test skipped: only one actor in workspace');
      return;
    }

    await expect(
      migrateHandle.pool.query(
        `insert into voc.voc_reporter_replies (
           voc_id, actor_id, body_rich_content
         ) values (
           $1, $2, '{"type":"doc","content":[]}'::jsonb
         )`,
        [vocId, otherId],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('voc_reporter_reply_actor_must_be_reporter'),
    });
  });

  it('reporter_reply accepts the reporter', async () => {
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into voc.voc_reporter_replies (
         voc_id, actor_id, body_rich_content
       ) values (
         $1, $2, '{"type":"doc","content":[]}'::jsonb
       ) returning id`,
      [vocId, reporterId],
    );
    expect(result.rows[0]?.id).toBeDefined();
  });

  it('internal_comment accepts any actor', async () => {
    const result = await migrateHandle.pool.query<{ id: string }>(
      `insert into voc.voc_internal_comments (
         voc_id, actor_id, body_rich_content
       ) values (
         $1, $2, '{"type":"doc","content":[]}'::jsonb
       ) returning id`,
      [vocId, reporterId],
    );
    expect(result.rows[0]?.id).toBeDefined();
  });

  it('fops_app cannot UPDATE voc_public_updates (permission denied)', async () => {
    await expect(
      appHandle.pool.query(
        `update voc.voc_public_updates set skip_public_update = false where voc_id = $1`,
        [vocId],
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/permission denied/i) });
  });

  it('fops_app cannot DELETE voc_internal_comments (permission denied)', async () => {
    await expect(
      appHandle.pool.query(
        `delete from voc.voc_internal_comments where voc_id = $1`,
        [vocId],
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/permission denied/i) });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3 voc_attachments stub (Task 5): polymorphic FK with XOR CHECK.
// Exactly one of voc_id / comment_id must be non-null. comment_kind is
// required and restricted when comment_id is set, and must be null otherwise.
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!runIntegration)('Slice 3 voc_attachments stub', () => {
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

    // Insert a VOC for use across tests.
    const voc = await handle.pool.query<{ id: string }>(
      `insert into voc.vocs (
         workspace_id, display_id, primary_managed_system_id, reporter_id,
         title, description_rich_content, source_context
       ) values (
         $1, voc.next_voc_display_id($1), $2, $3,
         'test-voc-foundation-attachments',
         '{"type":"doc","content":[]}'::jsonb,
         'direct_use'
       ) returning id`,
      [workspaceId, msId, actorId],
    );
    vocId = voc.rows[0]?.id ?? '';
    expect(vocId).not.toBe('');

    // Insert an internal_comment for use in XOR tests.
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
      `delete from voc.voc_attachments where storage_uri like 's3://test-task5/%'`,
    );
    await handle.pool.query(
      `delete from voc.vocs where title = 'test-voc-foundation-attachments'`,
    );
    await handle.close();
  });

  it('rejects both voc_id and comment_id populated (voc_attachments_subject_xor)', async () => {
    await expect(
      handle.pool.query(
        `insert into voc.voc_attachments (
           voc_id, comment_id, comment_kind,
           name, size_bytes, mime_type, storage_uri, uploaded_by_actor_id
         ) values (
           $1, $2, 'internal_comment',
           'test.pdf', 1024, 'application/pdf',
           's3://test-task5/both-xor.pdf', $3
         )`,
        [vocId, commentId, actorId],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('voc_attachments_subject_xor'),
    });
  });

  it('rejects voc_id with comment_kind populated but no comment_id (voc_attachments_comment_kind_pair)', async () => {
    await expect(
      handle.pool.query(
        `insert into voc.voc_attachments (
           voc_id, comment_kind,
           name, size_bytes, mime_type, storage_uri, uploaded_by_actor_id
         ) values (
           $1, 'public_update',
           'test.pdf', 1024, 'application/pdf',
           's3://test-task5/kind-no-comment.pdf', $2
         )`,
        [vocId, actorId],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('voc_attachments_comment_kind_pair'),
    });
  });

  it('accepts voc-scoped attachment (voc_id only, no comment_id/kind)', async () => {
    const result = await handle.pool.query<{ id: string }>(
      `insert into voc.voc_attachments (
         voc_id, name, size_bytes, mime_type, storage_uri, uploaded_by_actor_id
       ) values (
         $1, 'attachment.pdf', 2048, 'application/pdf',
         's3://test-task5/voc-scoped.pdf', $2
       ) returning id`,
      [vocId, actorId],
    );
    expect(result.rows[0]?.id).toBeDefined();
  });
});
