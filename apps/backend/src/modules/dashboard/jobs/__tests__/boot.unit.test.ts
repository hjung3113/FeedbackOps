import type { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';
import type { Db } from '../../../../db/client.js';
import { RECOVERY_RECONCILE_QUEUE, registerDashboardJobs } from '../index.js';

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

  it('converges on one recurring discovery schedule across registration restarts', async () => {
    const schedules = new Map<string, { cron: string; payload: unknown }>();
    const boss = {
      getQueues: async () => [{ name: RECOVERY_RECONCILE_QUEUE }],
      work: async () => 'worker',
      schedule: async (name: string, cron: string, payload: unknown) => {
        schedules.set(name, { cron, payload });
      },
    } as unknown as PgBoss;
    await registerDashboardJobs(boss, deps);
    await registerDashboardJobs(boss, deps);
    expect([...schedules.entries()]).toEqual([
      [
        RECOVERY_RECONCILE_QUEUE,
        {
          cron: '*/5 * * * *',
          payload: { workspace_id: deps.workspaceId, correlation_id: 'cron' },
        },
      ],
    ]);
  });
});
