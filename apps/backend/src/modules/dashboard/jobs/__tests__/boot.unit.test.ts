import type { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';
import type { Db } from '../../../../db/client.js';
import { registerDashboardJobs } from '../index.js';

const deps = {
  db: {} as Db,
  workspaceId: '00000000-0000-4000-8000-000000000001',
  log: { info() {}, warn() {}, error() {} },
};

describe('Dashboard recovery job boot', () => {
  it('fails boot when the journaled queue has not been provisioned', async () => {
    const boss = { getQueues: async () => [] } as unknown as PgBoss;
    await expect(registerDashboardJobs(boss, deps)).rejects.toThrow('is not pre-created');
  });
});
