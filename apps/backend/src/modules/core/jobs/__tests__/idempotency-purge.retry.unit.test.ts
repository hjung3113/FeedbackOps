// H6 (slice3-prologue): pin the idempotency-purge handler's error
// propagation. pg-boss retry config (retry_limit / retry_delay /
// retry_backoff in ADR-0009:35) only fires when the worker callback
// throws. A regression that wraps the body in `try { … } catch { /* log
// and continue */ }` would silently defeat the retry contract.

import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../../../../db/client.js';
import { __purgeHandler } from '../idempotency-purge.js';

describe('idempotency-purge handler retry behavior (H6)', () => {
  it('propagates handler errors so pg-boss enqueues a retry', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('db down'));
    const failingDb = { execute } as unknown as Db;

    const handler = __purgeHandler({ db: failingDb, log: { info: vi.fn() } });

    await expect(
      handler([{ id: 'job-1', data: { correlation_id: 'test-1' } }]),
    ).rejects.toThrow('db down');

    expect(execute).toHaveBeenCalled();
  });
});
