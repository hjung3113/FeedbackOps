import { afterEach, describe, expect, it, vi } from 'vitest';

describe('useMe with a partial API barrel mock', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/api');
    vi.resetModules();
  });

  it('handles unknown errors when the mock omits MeRequestError', async () => {
    vi.doMock('@/lib/api', () => ({ fetchMe: vi.fn() }));

    const { meQueryOptions } = await import('./useMe');
    const options = meQueryOptions();
    const error = new Error('unexpected request failure');

    expect(options.retry(0, error)).toBe(false);
    expect(options.retryDelay(1, error)).toBe(500);
  });
});
