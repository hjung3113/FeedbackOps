import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeRequestError } from '../api/auth';
import { ME_QUERY_KEY, ensureMe, meQueryOptions } from './useMe';

const ME = {
  actor: {
    id: 'actor-1',
    external_id: 'mock-admin-1',
    email: 'admin@example.test',
    display_name: 'Mock Admin',
    role_level: 'admin',
  },
  workspace_id: 'workspace-1',
};

function jsonResponse(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('ensureMe', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses a warm identity cache without requesting /me', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ME_QUERY_KEY, ME);
    globalThis.fetch = vi.fn() as typeof globalThis.fetch;

    await expect(ensureMe(queryClient)).resolves.toEqual(ME);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('recovers from a 429 when the bounded retry receives 200', async () => {
    const queryClient = new QueryClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse(200, ME));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(ensureMe(queryClient)).resolves.toEqual(ME);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual(ME);
  });

  it('stops after bounded 429 retries and keeps typed status and retry-after', async () => {
    const queryClient = new QueryClient();
    const fetchMock = vi.fn(async () =>
      jsonResponse(429, {}, { 'retry-after': '0' }),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    let thrown: unknown;
    try {
      await ensureMe(queryClient);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MeRequestError);
    expect(thrown).toMatchObject({ status: 429, retryAfter: '0' });
    expect((thrown as Error).message).not.toContain('/me failed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps the cached identity when a stale background refresh is rate limited', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ME_QUERY_KEY, ME, { updatedAt: Date.now() - 6 * 60 * 1000 });
    const fetchMock = vi.fn(async () => jsonResponse(429, {}, { 'retry-after': '0' }));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(queryClient.fetchQuery(meQueryOptions())).rejects.toBeInstanceOf(MeRequestError);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual(ME);
  });
});
