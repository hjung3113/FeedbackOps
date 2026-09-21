// pg-boss `error` / `warning` events must reach the structured logger through
// the bounded projections (errorFields / warningFields), never as raw objects:
// driver errors and warnings can embed DSNs, SQL and parameters (#406).

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { JobLog } from '../job-log.js';
import { initBoss, shutdownBoss } from '../jobs.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('initBoss event logging (#406)', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } satisfies JobLog;
  let boss: Awaited<ReturnType<typeof initBoss>>;

  beforeAll(async () => {
    boss = await initBoss({ connectionString: APP_URL, log });
  });

  afterAll(async () => {
    await shutdownBoss(boss);
  });

  it('logs pg-boss errors as err_name/err_code only', () => {
    const err = Object.assign(new Error('connect postgres://u:s3cr3t@h/x failed'), {
      code: 'ECONNREFUSED',
    });
    boss.emit('error', err);
    expect(log.error).toHaveBeenCalledWith('pg-boss error', {
      err_name: 'Error',
      err_code: 'ECONNREFUSED',
    });
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('s3cr3t');
  });

  it('logs pg-boss warnings without message or data (they can carry SQL/parameters)', () => {
    boss.emit('warning', { message: 'SELECT s3cr3t', data: { sql: 's3cr3t' } });
    expect(log.warn).toHaveBeenCalledWith('pg-boss warning', {});
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('s3cr3t');
  });
});
