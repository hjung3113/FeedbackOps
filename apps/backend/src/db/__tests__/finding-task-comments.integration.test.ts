import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('0048 finding/task comments role grants', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let findingId: string;
  let taskId: string;
  let actorId: string;

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);

    const actor = await migrateHandle.pool.query<{ id: string }>(
      `select id
         from core.actors
        where workspace_id = $1
        order by created_at
        limit 1`,
      [WORKSPACE_ID],
    );
    actorId = actor.rows[0]?.id ?? '';
    expect(actorId).not.toBe('');

    const managedSystem = await migrateHandle.pool.query<{ id: string }>(
      `select id
         from core.managed_systems
        where workspace_id = $1
        order by created_at
        limit 1`,
      [WORKSPACE_ID],
    );
    const managedSystemId = managedSystem.rows[0]?.id ?? '';
    expect(managedSystemId).not.toBe('');

    const finding = await migrateHandle.pool.query<{ id: string }>(
      `insert into finding.findings (
         workspace_id, display_id, primary_managed_system_id,
         title, summary, source_type, severity, created_by
       ) values (
         $1, core.next_display_id($1::uuid, 'finding'), $2,
         'Chunk 1 finding comments grant test', 'Grant test finding',
         'manual', 'medium', $3
       )
       returning id`,
      [WORKSPACE_ID, managedSystemId, actorId],
    );
    findingId = finding.rows[0]?.id ?? '';
    expect(findingId).not.toBe('');

    const task = await migrateHandle.pool.query<{ id: string }>(
      `insert into task.tasks (
         workspace_id, display_id, primary_managed_system_id,
         title, status, priority, created_by
       ) values (
         $1, core.next_display_id($1::uuid, 'task'), $2,
         'Chunk 1 task comments grant test', 'backlog', 'medium', $3
       )
       returning id`,
      [WORKSPACE_ID, managedSystemId, actorId],
    );
    taskId = task.rows[0]?.id ?? '';
    expect(taskId).not.toBe('');
  });

  afterAll(async () => {
    if (findingId) {
      await migrateHandle.pool.query('delete from finding.findings where id = $1', [findingId]);
    }
    if (taskId) {
      await migrateHandle.pool.query('delete from task.tasks where id = $1', [taskId]);
    }
    await migrateHandle?.close();
    await appHandle?.close();
  });

  it('fops_app may SELECT and INSERT but cannot UPDATE or DELETE finding comments', async () => {
    const privileges = await migrateHandle.pool.query<{
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
      can_truncate: boolean;
    }>(
      `select
         has_table_privilege('fops_app', 'finding.finding_comments', 'SELECT') as can_select,
         has_table_privilege('fops_app', 'finding.finding_comments', 'INSERT') as can_insert,
         has_table_privilege('fops_app', 'finding.finding_comments', 'UPDATE') as can_update,
         has_table_privilege('fops_app', 'finding.finding_comments', 'DELETE') as can_delete,
         has_table_privilege('fops_app', 'finding.finding_comments', 'TRUNCATE') as can_truncate`,
    );
    expect(privileges.rows[0]).toEqual({
      can_select: true,
      can_insert: true,
      can_update: false,
      can_delete: false,
      can_truncate: false,
    });

    const inserted = await appHandle.pool.query<{ id: string }>(
      `insert into finding.finding_comments (
         workspace_id, finding_id, actor_id, body_rich_content
       ) values ($1, $2, $3, '{"type":"doc","content":[]}'::jsonb)
       returning id`,
      [WORKSPACE_ID, findingId, actorId],
    );
    const commentId = inserted.rows[0]?.id ?? '';
    expect(commentId).not.toBe('');

    const selected = await appHandle.pool.query<{ id: string }>(
      'select id from finding.finding_comments where id = $1',
      [commentId],
    );
    expect(selected.rows).toEqual([{ id: commentId }]);

    await expect(
      appHandle.pool.query(
        `update finding.finding_comments
            set body_rich_content = '{"type":"doc","content":[]}'::jsonb
          where id = $1`,
        [commentId],
      ),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      appHandle.pool.query('delete from finding.finding_comments where id = $1', [commentId]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('fops_app may SELECT and INSERT but cannot UPDATE or DELETE task comments', async () => {
    const privileges = await migrateHandle.pool.query<{
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
      can_truncate: boolean;
    }>(
      `select
         has_table_privilege('fops_app', 'task.task_comments', 'SELECT') as can_select,
         has_table_privilege('fops_app', 'task.task_comments', 'INSERT') as can_insert,
         has_table_privilege('fops_app', 'task.task_comments', 'UPDATE') as can_update,
         has_table_privilege('fops_app', 'task.task_comments', 'DELETE') as can_delete,
         has_table_privilege('fops_app', 'task.task_comments', 'TRUNCATE') as can_truncate`,
    );
    expect(privileges.rows[0]).toEqual({
      can_select: true,
      can_insert: true,
      can_update: false,
      can_delete: false,
      can_truncate: false,
    });

    const inserted = await appHandle.pool.query<{ id: string }>(
      `insert into task.task_comments (
         workspace_id, task_id, actor_id, body_rich_content
       ) values ($1, $2, $3, '{"type":"doc","content":[]}'::jsonb)
       returning id`,
      [WORKSPACE_ID, taskId, actorId],
    );
    const commentId = inserted.rows[0]?.id ?? '';
    expect(commentId).not.toBe('');

    const selected = await appHandle.pool.query<{ id: string }>(
      'select id from task.task_comments where id = $1',
      [commentId],
    );
    expect(selected.rows).toEqual([{ id: commentId }]);

    await expect(
      appHandle.pool.query(
        `update task.task_comments
            set body_rich_content = '{"type":"doc","content":[]}'::jsonb
          where id = $1`,
        [commentId],
      ),
    ).rejects.toMatchObject({ code: '42501' });

    await expect(
      appHandle.pool.query('delete from task.task_comments where id = $1', [commentId]),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
