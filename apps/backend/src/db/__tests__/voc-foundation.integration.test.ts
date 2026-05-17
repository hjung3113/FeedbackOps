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
