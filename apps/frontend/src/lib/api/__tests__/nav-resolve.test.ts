import { describe, expect, it, vi } from 'vitest';

import { navResolveResponseSchema } from '@fops/shared';
import { fetchNavResolve } from '../nav';
import { ApiError } from '../types';

const RESOLVE_BODY = navResolveResponseSchema.parse({
  entity_type: 'voc',
  id: '11111111-1111-4111-8111-111111111111',
  display_id: 'VOC-12',
  route_intent: {
    route: '/vocs',
    search: { view: 'inbox', selected: '11111111-1111-4111-8111-111111111111' },
  },
});

function fetchOk(): ReturnType<typeof vi.fn> {
  return vi.fn(
    async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify(RESOLVE_BODY), { status: 200 }),
  );
}

describe('fetchNavResolve', () => {
  it('GETs the display id and returns the parsed resolve payload', async () => {
    const fetchMock = fetchOk();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const resolved = await fetchNavResolve('VOC-12');

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe('/nav/resolve?display_id=VOC-12');
    expect(resolved).toEqual(RESOLVE_BODY);
  });

  it('throws the 404 not_found.record envelope as ApiError', async () => {
    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(JSON.stringify({ code: 'not_found.record', message: 'no such record' }), {
          status: 404,
        }),
    ) as unknown as typeof fetch;

    const error = await fetchNavResolve('VOC-404').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('not_found.record');
  });

  it('percent-encodes the display id in the query string', async () => {
    const fetchMock = fetchOk();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchNavResolve('VOC+12');

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/nav/resolve?display_id=VOC%2B12');
  });
});
