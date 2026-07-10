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
      await handle.pool.query(
        'delete from core.display_counters where workspace_id = any($1::uuid[])',
        [transientWorkspaceIds],
      );
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
});
