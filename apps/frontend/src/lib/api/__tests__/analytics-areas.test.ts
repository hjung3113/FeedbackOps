import { type Mock, afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAnalyticsAreas } from '../analytics-areas';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

const UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddd00a1';

const AREA = {
  id: UUID,
  workspace_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
  managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccc00c1',
  slug: 'product-usage',
  name: 'Product Usage',
  owner_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

function mockFetchJson(body: unknown): Mock {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function lastUrl(fetchMock: Mock): URL {
  const calls = fetchMock.mock.calls as unknown as [string][];
  const first = calls[0];
  if (first === undefined) throw new Error('fetch was not called');
  return new URL(first[0], 'http://localhost');
}

describe('fetchAnalyticsAreas pagination options (#514 B2c fixup F4)', () => {
  it('sends include_archived, limit, and offset query params', async () => {
    const fetchMock = mockFetchJson({ items: [AREA], total: 1 });

    await fetchAnalyticsAreas({ includeArchived: true, limit: 500, offset: 500 });

    const url = lastUrl(fetchMock);
    expect(url.pathname).toBe('/analytics-areas');
    expect(url.searchParams.get('include_archived')).toBe('true');
    expect(url.searchParams.get('limit')).toBe('500');
    expect(url.searchParams.get('offset')).toBe('500');
  });

  it('omits absent options from the query string', async () => {
    const fetchMock = mockFetchJson({ items: [AREA], total: 1 });

    await fetchAnalyticsAreas();

    const url = lastUrl(fetchMock);
    expect(url.search).toBe('');
  });

  it('returns the parsed items and total', async () => {
    mockFetchJson({ items: [AREA], total: 1 });

    const result = await fetchAnalyticsAreas({ includeArchived: true });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe('Product Usage');
  });
});
