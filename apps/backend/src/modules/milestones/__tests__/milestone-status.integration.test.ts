// #514 A-status — ADR-0050 status set on the migrated database.
// HTTP allow/forbid cases live in create-milestone and patch-milestone tests.
// This file checks the CHECK the migration installs.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('milestone status check (ADR-0050)', () => {
  let dbHandle: DbHandle;

  beforeAll(() => {
    dbHandle = createDb(APP_URL);
  });

  afterAll(async () => {
    await dbHandle.pool.end();
  });

  it('the live constraint names the four ADR-0050 statuses', async () => {
    const rows = await dbHandle.pool.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def
         from pg_constraint
        where conname = 'milestones_status_check'`,
    );
    expect(rows.rows).toHaveLength(1);
    const def = rows.rows[0]?.def ?? '';
    for (const status of ['planning', 'in_progress', 'blocked', 'released']) {
      expect(def).toContain(status);
    }
  });
});
