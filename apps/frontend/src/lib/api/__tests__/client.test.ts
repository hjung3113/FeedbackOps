import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiClient } from '../client';
import { ApiError } from '../types';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

type MockFetchArgs = {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
};

function mockFetch(response: MockFetchArgs): typeof fetch {
  const headers = new Headers(response.headers);
  return vi.fn(async () =>
    ({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      headers,
      text: async () =>
        response.jsonBody !== undefined ? JSON.stringify(response.jsonBody) : '',
    } as Response),
  ) as unknown as typeof fetch;
}

function getCallInit(fetchMock: typeof fetch): RequestInit {
  const calls = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
  const first = calls[0];
  if (!first) throw new Error('fetch was not called');
  return first[1];
}

describe('apiClient', () => {
  it('POST attaches auto-minted Idempotency-Key UUID', async () => {
    const fetchMock = mockFetch({ status: 201, jsonBody: { ok: true } });
    global.fetch = fetchMock;
    await apiClient('POST', '/x', { body: { a: 1 } });
    const headers = getCallInit(fetchMock).headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeTruthy();
    expect((headers['Idempotency-Key'] as string).length).toBeGreaterThanOrEqual(10);
  });

  it('GET omits Idempotency-Key', async () => {
    const fetchMock = mockFetch({ status: 200, jsonBody: { ok: true } });
    global.fetch = fetchMock;
    await apiClient('GET', '/x');
    const headers = getCallInit(fetchMock).headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeUndefined();
  });

  it('PATCH attaches If-Match when provided', async () => {
    const fetchMock = mockFetch({ status: 200, jsonBody: { ok: true } });
    global.fetch = fetchMock;
    await apiClient('PATCH', '/x', { ifMatch: 'W/"abc"', body: {} });
    const headers = getCallInit(fetchMock).headers as Record<string, string>;
    expect(headers['If-Match']).toBe('W/"abc"');
  });

  it('non-2xx throws ApiError with envelope.code', async () => {
    global.fetch = mockFetch({
      ok: false,
      status: 422,
      jsonBody: { code: 'validation.failed', message: 'bad' },
    });
    await expect(apiClient('POST', '/x', { body: {} })).rejects.toBeInstanceOf(ApiError);

    // Second call with fresh mock
    global.fetch = mockFetch({
      ok: false,
      status: 422,
      jsonBody: { code: 'validation.failed', message: 'bad' },
    });
    try {
      await apiClient('POST', '/x', { body: {} });
    } catch (e) {
      expect((e as ApiError).code).toBe('validation.failed');
      expect((e as ApiError).status).toBe(422);
    }
  });

  it('304 returns etag without throwing', async () => {
    const fetchMock = mockFetch({ ok: true, status: 304, headers: { etag: 'W/"abc"' } });
    global.fetch = fetchMock;
    const res = await apiClient('GET', '/x', { ifNoneMatch: 'W/"abc"' });
    expect(res.status).toBe(304);
    expect(res.etag).toBe('W/"abc"');
  });

  it('PUT does not auto-attach Idempotency-Key', async () => {
    const fetchMock = mockFetch({ status: 200, jsonBody: { ok: true } });
    global.fetch = fetchMock;
    await apiClient('PUT', '/x', { body: { a: 1 } });
    const headers = getCallInit(fetchMock).headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeUndefined();
  });

  it('uses credentials include', async () => {
    const fetchMock = mockFetch({ status: 200, jsonBody: {} });
    global.fetch = fetchMock;
    await apiClient('GET', '/x');
    const init = getCallInit(fetchMock);
    expect(init.credentials).toBe('include');
  });
});
