// apiRequest.test.ts — #398: the runtime-parsed API seam.
// Fetch is mocked exactly like client.test.ts; every negative assertion is
// paired with a positive twin (the valid-payload test) so a broken mock or
// wiring cannot pass vacuously.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiRequest } from '../client';
import { ApiError, ApiParseError } from '../types';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

type MockFetchArgs = {
  ok?: boolean;
  status: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
  /** Raw (possibly non-JSON) body text; wins over jsonBody. */
  rawBody?: string;
};

function mockFetch(response: MockFetchArgs): typeof fetch {
  const headers = new Headers(response.headers);
  return vi.fn(
    async () =>
      ({
        ok: response.ok ?? (response.status >= 200 && response.status < 300),
        status: response.status,
        headers,
        text: async () =>
          response.rawBody !== undefined
            ? response.rawBody
            : response.jsonBody !== undefined
              ? JSON.stringify(response.jsonBody)
              : '',
      }) as Response,
  ) as unknown as typeof fetch;
}

async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected the promise to reject');
}

const thingSchema = z.object({ id: z.string(), count: z.number().int() });

describe('apiRequest', () => {
  it('parses a valid payload and preserves etag, requestId, and rateLimit', async () => {
    const resetEpoch = Math.floor(Date.now() / 1000) + 60;
    global.fetch = mockFetch({
      status: 200,
      jsonBody: { id: 'x', count: 2 },
      headers: {
        etag: 'W/"v1"',
        'x-request-id': 'req-1',
        'x-ratelimit-limit': '50',
        'x-ratelimit-remaining': '49',
        'x-ratelimit-reset': String(resetEpoch),
      },
    });
    const res = await apiRequest('GET', '/things', thingSchema);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ id: 'x', count: 2 });
    expect(res.etag).toBe('W/"v1"');
    expect(res.requestId).toBe('req-1');
    expect(res.rateLimit).toEqual({
      limit: 50,
      remaining: 49,
      resetAt: new Date(resetEpoch * 1000),
    });
  });

  it('rejects a malformed payload with ApiParseError (an ApiError) at the response status', async () => {
    global.fetch = mockFetch({
      status: 200,
      jsonBody: { id: 'x', count: 'not-a-number' },
      headers: { 'x-request-id': 'req-2' },
    });
    const err = (await catchError(
      apiRequest('GET', '/things?scope=all', thingSchema),
    )) as ApiParseError;

    expect(err).toBeInstanceOf(ApiParseError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe('ApiParseError');
    expect(err.status).toBe(200);
    expect(err.code).toBe('internal.unexpected');
    expect(err.envelope.message).toBe('invalid response payload');
    expect(err.requestId).toBe('req-2');
    expect(err.detail?.endpoint).toBe('GET /things');

    const issues = err.detail?.issues as Array<{ path: string[]; code: string }>;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({ path: ['count'], code: 'invalid_type' });

    // Privacy contract: the offending payload value never surfaces.
    const dumped = JSON.stringify({ message: err.message, detail: err.detail });
    expect(dumped).not.toContain('not-a-number');
  });

  it('bounds detail.issues to five entries', async () => {
    const wide = z.object({
      a: z.number(),
      b: z.number(),
      c: z.number(),
      d: z.number(),
      e: z.number(),
      f: z.number(),
      g: z.number(),
    });
    global.fetch = mockFetch({
      status: 200,
      jsonBody: { a: 'x', b: 'x', c: 'x', d: 'x', e: 'x', f: 'x', g: 'x' },
    });
    const err = (await catchError(apiRequest('GET', '/wide', wide))) as ApiParseError;
    expect(err.detail?.issues).toHaveLength(5);
  });

  it('error envelopes still throw plain ApiError and the parser is never invoked', async () => {
    const parser = { parse: vi.fn() };
    global.fetch = mockFetch({
      ok: false,
      status: 404,
      jsonBody: { code: 'not_found.record', message: 'nope' },
    });
    const err = (await catchError(apiRequest('GET', '/things', parser))) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(ApiParseError);
    expect(err.status).toBe(404);
    expect(err.code).toBe('not_found.record');
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('304 resolves without parsing and keeps the etag', async () => {
    const parser = { parse: vi.fn() };
    global.fetch = mockFetch({ status: 304, headers: { etag: 'W/"v2"' } });
    const res = await apiRequest('GET', '/things', parser, { ifNoneMatch: 'W/"v2"' });
    expect(res.status).toBe(304);
    expect(res.data).toBeUndefined();
    expect(res.etag).toBe('W/"v2"');
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('204 empty body hands undefined to a parser that accepts it', async () => {
    const parser = vi.fn((data: unknown) => (data === undefined ? 'empty-ok' : data));
    global.fetch = mockFetch({ status: 204 });
    const res = await apiRequest('GET', '/things', parser);
    expect(res.status).toBe(204);
    expect(res.data).toBe('empty-ok');
    expect(parser).toHaveBeenCalledWith(undefined);
  });

  it('wraps non-Zod parser failures in ApiParseError with an empty issue list', async () => {
    const parser = {
      parse: vi.fn(() => {
        throw new Error('boom');
      }),
    };
    global.fetch = mockFetch({ status: 200, jsonBody: { id: 'x', count: 1 } });
    const err = (await catchError(apiRequest('GET', '/things', parser))) as ApiParseError;
    expect(err).toBeInstanceOf(ApiParseError);
    expect(err.status).toBe(200);
    expect(err.detail?.issues).toEqual([]);
  });

  it('accepts a bare function parser (structural contract)', async () => {
    global.fetch = mockFetch({ status: 200, jsonBody: { id: 'x', count: 3 } });
    const res = await apiRequest('GET', '/things', (data: unknown) => thingSchema.parse(data));
    expect(res.data).toEqual({ id: 'x', count: 3 });
  });

  it('wraps a non-JSON 2xx body (HTML page, truncated JSON) in ApiParseError without echoing the body', async () => {
    // Valid twin first: the same route with a JSON body parses.
    global.fetch = mockFetch({ status: 200, jsonBody: { id: 'x', count: 1 } });
    await expect(apiRequest('GET', '/things/1', thingSchema)).resolves.toMatchObject({
      data: { id: 'x', count: 1 },
    });

    for (const rawBody of [
      '<html><body>Bad gateway SECRET-TOKEN-123</body></html>',
      '{"id": "x", "cou',
    ]) {
      global.fetch = mockFetch({
        status: 200,
        rawBody,
        headers: { 'x-request-id': 'req-9' },
      });
      const error = await catchError(apiRequest('GET', '/things/1', thingSchema));
      expect(error).toBeInstanceOf(ApiParseError);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiParseError).status).toBe(200);
      expect((error as ApiParseError).requestId).toBe('req-9');
      expect((error as ApiParseError).detail?.issues).toEqual([]);
      expect(JSON.stringify(error) + (error as Error).message).not.toContain('SECRET-TOKEN-123');
    }
  });
});
