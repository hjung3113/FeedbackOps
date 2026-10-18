import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsAreaDto } from '../analytics-areas';
import { fetchAllAnalyticsAreas } from '../analytics-areas-all';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

function area(n: number): AnalyticsAreaDto {
  return {
    id: `area-${n}`,
    workspace_id: 'ws',
    managed_system_id: 'ms',
    slug: `area-${n}`,
    name: `Area ${n}`,
    owner_team_id: null,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  };
}

function mockPages(pageFor: (offset: number) => { items: AnalyticsAreaDto[]; total: number }) {
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    const body = pageFor(Number(url.searchParams.get('offset')));
    return { ok: true, status: 200, json: async () => body };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function requestedUrls(fetchMock: ReturnType<typeof mockPages>): URL[] {
  return fetchMock.mock.calls.map(([input]) => new URL(input, 'http://localhost'));
}

describe('fetchAllAnalyticsAreas', () => {
  it('stops at total without another request when the last page fills it', async () => {
    const fetchMock = mockPages((offset) => ({
      items: offset === 0 ? Array.from({ length: 500 }, (_, i) => area(i)) : [area(500)],
      total: 501,
    }));

    const result = await fetchAllAnalyticsAreas({ managedSystemId: 'ms' });

    expect(result.items).toHaveLength(501);
    const urls = requestedUrls(fetchMock);
    expect(urls.map((url) => url.searchParams.get('offset'))).toEqual(['0', '500']);
    for (const url of urls) {
      expect(url.searchParams.get('limit')).toBe('500');
      expect(url.searchParams.get('include_archived')).toBe('true');
      expect(url.searchParams.get('managed_system_id')).toBe('ms');
    }
  });

  it('returns what it has when the next page is empty while total is still ahead', async () => {
    const fetchMock = mockPages((offset) => ({
      items: offset === 0 ? [area(0), area(1)] : [],
      total: 5,
    }));

    const result = await fetchAllAnalyticsAreas();

    expect(result.items.map((item) => item.id)).toEqual(['area-0', 'area-1']);
    expect(requestedUrls(fetchMock).map((url) => url.searchParams.get('offset'))).toEqual([
      '0',
      '2',
    ]);
  });
});
