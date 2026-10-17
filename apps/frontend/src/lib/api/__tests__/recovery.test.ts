import { validateHomeSearch } from '@/routes/_authed/home';
import { validateIntegrationDashboardSearch } from '@/routes/_authed/integration';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchRecoveryHistory, patchRecoveryPresentation } from '../recovery';

const ID = 'r1_abcdefghijklmnopqrstuvw';
afterEach(() => vi.unstubAllGlobals());
it('uses the history filter shape without personal list selectors', async () => {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          computed_at: '2026-07-20T00:00:00.000Z',
          window_start: '2026-05-01T00:00:00.000Z',
          items: [],
          total: 0,
          page: { has_more: false },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  await fetchRecoveryHistory({
    category: 'unassigned-voc',
    managed_system_id: 'all',
    limit: 50,
    cursor: 'next',
  });
  expect(String(fetch.mock.calls[0]?.[0])).toBe(
    '/dashboard/recovery-history?category=unassigned-voc&managed_system_id=all&limit=50&cursor=next',
  );
});
it.each([validateHomeSearch, validateIntegrationDashboardSearch])(
  'preserves opaque selection and cleans unsafe return/defaults',
  (validate) => {
    expect(
      validate({
        selected: ID,
        category: 'unassigned-voc',
        presentation: 'hidden',
        history: true,
        returnTo: `/integration?selected=${ID}`,
      }),
    ).toEqual({
      selected: ID,
      category: 'unassigned-voc',
      presentation: 'hidden',
      history: true,
      returnTo: `/integration?selected=${ID}`,
    });
    expect(
      validate({
        selected: 'bad',
        presentation: 'visible',
        history: false,
        returnTo: '//evil.test',
        unknown: 'x',
      }),
    ).toEqual({
      selected: undefined,
      presentation: undefined,
      history: undefined,
      returnTo: undefined,
      unknown: undefined,
    });
  },
);
it('rejects invalid personal PATCH bodies before transport', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(
    patchRecoveryPresentation(ID, { action: 'snooze', days: 2 } as never),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([validateHomeSearch, validateIntegrationDashboardSearch])(
  'cleans foreign, protocol-relative, backslash and oversized queue returns',
  (validate) => {
    expect(
      [
        'https://foreign.test/home',
        '//foreign.test/home',
        '/\\foreign.test/home',
        '/home\\foreign',
        `/home?x=${'a'.repeat(2048)}`,
        '/home\n',
      ].map((returnTo) => validate({ returnTo }).returnTo),
    ).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  },
);
it('rejects list-only selectors in history before transport', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(
    fetchRecoveryHistory({ limit: 50, view: 'operational', presentation: 'hidden' } as never),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
