import { afterEach, expect, it, vi } from 'vitest';
import { fetchAnalyticsAreaReport } from '../area-report';

afterEach(() => vi.unstubAllGlobals());

it.each([
  [{ managed_system_id: 'all' as const }, '/dashboard/analytics-areas?managed_system_id=all'],
  [
    { managed_system_id: 'all' as const, limit: 1 },
    '/dashboard/analytics-areas?managed_system_id=all&limit=1',
  ],
])('forwards limit only when the caller supplies one (%o)', async (query, url) => {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          computed_at: '2026-07-20T00:00:00.000Z',
          as_of_date: '2026-07-20',
          items: [],
          page: { has_more: false },
          classification_context: [],
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  await fetchAnalyticsAreaReport(query);
  expect(String(fetch.mock.calls[0]?.[0])).toBe(url);
});
