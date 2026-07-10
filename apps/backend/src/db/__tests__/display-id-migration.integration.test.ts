import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(MIGRATE_URL);

if (!runIntegration) {
  console.warn(
    '[display-id-migration] skipping integration suite — set DATABASE_URL_MIGRATE to run.',
  );
}

describe.skipIf(!runIntegration)('0027 display-id scheme', () => {
  let handle: DbHandle;
  const transientWorkspaceIds: string[] = [];

  beforeAll(() => {
    handle = createDb(MIGRATE_URL);
  });

  afterAll(async () => {
    if (transientWorkspaceIds.length > 0) {
      await handle.pool.query('delete from task.tasks where workspace_id = any($1::uuid[])', [
        transientWorkspaceIds,
      ]);
      await handle.pool.query(
        'delete from core.managed_systems where workspace_id = any($1::uuid[])',
        [transientWorkspaceIds],
      );
      await handle.pool.query('delete from core.actors where workspace_id = any($1::uuid[])', [
        transientWorkspaceIds,
      ]);
      await handle.pool.query(
        'delete from core.display_counters where workspace_id = any($1::uuid[])',
        [transientWorkspaceIds],
      );
      await handle.pool.query('delete from core.workspaces where id = any($1::uuid[])', [
        transientWorkspaceIds,
      ]);
    }
    await handle?.close();
  });

  it('next_display_id issues sequential per-workspace ids with correct prefix', async () => {
    const workspaceId = randomUUID();
    transientWorkspaceIds.push(workspaceId);

    const a = await handle.pool.query<{ v: string }>(
      `select core.next_display_id($1::uuid, 'task') as v`,
      [workspaceId],
    );
    const b = await handle.pool.query<{ v: string }>(
      `select core.next_display_id($1::uuid, 'task') as v`,
      [workspaceId],
    );

    expect(a.rows[0]?.v).toBe('TASK-1000');
    expect(b.rows[0]?.v).toBe('TASK-1001');
  });

  it('rejects unknown entity_type', async () => {
    const workspaceId = randomUUID();
    transientWorkspaceIds.push(workspaceId);

    await expect(
      handle.pool.query(`select core.next_display_id($1::uuid, 'bogus')`, [workspaceId]),
    ).rejects.toThrow(/unknown entity_type/);
  });

  it('different workspaces get independent sequences', async () => {
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    transientWorkspaceIds.push(workspaceId, otherWorkspaceId);

    const a = await handle.pool.query<{ v: string }>(
      `select core.next_display_id($1::uuid, 'finding') as v`,
      [workspaceId],
    );
    const b = await handle.pool.query<{ v: string }>(
      `select core.next_display_id($1::uuid, 'finding') as v`,
      [otherWorkspaceId],
    );

    expect(a.rows[0]?.v).toBe('FIN-1000');
    expect(b.rows[0]?.v).toBe('FIN-1000');
  });

  it('rejects raw task inserts that omit display_id', async () => {
    const workspaceId = randomUUID();
    transientWorkspaceIds.push(workspaceId);

    await handle.pool.query(`insert into core.workspaces (id, name) values ($1, $2)`, [
      workspaceId,
      'Display ID Not Null Test Workspace',
    ]);
    const actor = await handle.pool.query<{ id: string }>(
      `insert into core.actors (
          workspace_id, external_id, email, display_name, role_level, actor_type
        )
       values ($1, $2, $3, $4, 'admin', 'internal_member')
       returning id`,
      [
        workspaceId,
        `display-id-not-null-${workspaceId}`,
        `display-id-not-null-${workspaceId}@local`,
        'Display ID Not Null Actor',
      ],
    );
    const actorId = actor.rows[0]?.id;
    if (!actorId) throw new Error('seed actor failed');

    const managedSystem = await handle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3)
       returning id`,
      [workspaceId, 'display-id-not-null-ms', 'Display ID Not Null MS'],
    );
    const managedSystemId = managedSystem.rows[0]?.id;
    if (!managedSystemId) throw new Error('seed managed system failed');

    await expect(
      handle.pool.query(
        `insert into task.tasks (
            workspace_id, primary_managed_system_id, title, status, priority,
            created_by, created_at, updated_at
          )
         values ($1, $2, $3, 'backlog', 'medium', $4, now(), now())`,
        [workspaceId, managedSystemId, 'Task missing display_id', actorId],
      ),
    ).rejects.toThrow(/display_id|not-null/i);
  });
});
