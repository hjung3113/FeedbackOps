import { type VocListItem, listVocsQuerySchema } from '@fops/shared';
import { FieldLabel } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VocSourcePicker } from './VocSourcePicker';

const MANAGED_SYSTEM_ID = '30000000-0000-0000-0000-000000000003';
const OTHER_MANAGED_SYSTEM_ID = '30000000-0000-0000-0000-000000000009';
const VOC_12_ID = '10000000-0000-0000-0000-000000000012';
const VOC_13_ID = '10000000-0000-0000-0000-000000000013';
const EXACT_VOC_ID = '10000000-0000-0000-0000-000000000001';

function makeVoc(
  id: string,
  displayId: string,
  title: string,
  managedSystemId = MANAGED_SYSTEM_ID,
): VocListItem {
  return {
    id,
    display_id: displayId,
    title,
    primary_managed_system_id: managedSystemId,
    analytics_area_id: null,
    reporter_id: '40000000-0000-0000-0000-000000000004',
    owner_user_id: null,
    owner_team_id: null,
    severity: 'medium',
    reporter_facing_status: 'reviewing',
    triage_state: 'triaged',
    source_context: 'direct_use',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    similar_count: 0,
    review_postponed_at: null,
    attachment_count: 0,
  };
}

const VOC_12 = makeVoc(VOC_12_ID, 'VOC-12', '로그인 오류');
const VOC_13 = makeVoc(VOC_13_ID, 'VOC-13', '결제 화면이 느림');
const VOCS = [VOC_12, VOC_13];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function resolveBody(entityType: 'voc' | 'finding', id: string, displayId: string): unknown {
  return {
    entity_type: entityType,
    id,
    display_id: displayId,
    route_intent: { route: '/vocs', search: {} },
  };
}

/** GET /vocs/:id URLs (no query string), the exact-ID supplement's detail fetches. */
function detailFetchUrls(calls: unknown[][]): string[] {
  return calls.map(([url]) => String(url)).filter((url) => /^\/vocs\/[0-9a-f-]+$/.test(url));
}

function searchedFetchUrls(calls: unknown[][]): string[] {
  return calls.map(([url]) => String(url)).filter((url) => url.includes('q='));
}

function vocsUrl(managedSystemId: string, q: string | undefined): string {
  const query = new URLSearchParams({
    view: 'inbox',
    managed_system_id: managedSystemId,
    limit: '100',
  });
  if (q !== undefined && q !== '') query.set('q', q);
  return `/vocs?${query.toString()}`;
}

/**
 * Handlers for the #815 exact-ID supplement transport: GET /nav/resolve and
 * GET /vocs/:id. Without a handler the URL returns an empty 200, which fails
 * response parsing and adds no option.
 */
interface ExactLookupHandlers {
  resolve?: (displayId: string) => Response;
  vocDetail?: (vocId: string) => Response;
}

/**
 * Installs a fetch mock whose /vocs response can depend on the requested `q`
 * (server-side search #821), with optional handlers for the exact-ID lookup.
 * Unknown URLs just return an empty 200.
 */
function installFetch(
  vocsForQ: (q: string | undefined) => VocListItem[] = () => VOCS,
  hasMore = false,
  exactLookup: ExactLookupHandlers = {},
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/vocs?')) {
      const q = new URL(url, 'http://localhost').searchParams.get('q') ?? undefined;
      return jsonResponse({ items: vocsForQ(q), page: { has_more: hasMore } });
    }
    if (url.startsWith('/nav/resolve?')) {
      const displayId = new URL(url, 'http://localhost').searchParams.get('display_id') ?? '';
      return exactLookup.resolve !== undefined
        ? exactLookup.resolve(displayId)
        : jsonResponse({}, 200);
    }
    if (exactLookup.vocDetail !== undefined && /^\/vocs\/[0-9a-f-]+$/.test(url)) {
      return exactLookup.vocDetail(url.slice('/vocs/'.length));
    }
    return jsonResponse({}, 200);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPicker(onChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <FieldLabel htmlFor="voc-source-picker">VOC 선택</FieldLabel>
      <VocSourcePicker
        managedSystemId={MANAGED_SYSTEM_ID}
        value={null}
        onChange={onChange}
        id="voc-source-picker"
        invalid={false}
      />
    </QueryClientProvider>,
  );
  return onChange;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('VocSourcePicker', () => {
  it.each([
    ['VOC-12', 'VOC-12 · 로그인 오류'],
    ['결제 화면', 'VOC-13 · 결제 화면이 느림'],
  ])('lists readable VOCs and filters by %s', async (search, expectedOption) => {
    const fetchMock = installFetch();
    renderPicker();

    const trigger = await screen.findByRole('combobox', { name: 'VOC 선택' });
    fireEvent.click(trigger);
    const searchInput = await screen.findByPlaceholderText('VOC ID 또는 제목 검색');
    await userEvent.type(searchInput, search);

    expect(await screen.findByRole('option', { name: expectedOption })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'VOC 목록' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      vocsUrl(MANAGED_SYSTEM_ID, undefined),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it.each([
    ['loading', 'VOC 목록을 불러오는 중입니다.'],
    ['error', 'VOC 목록을 불러오지 못했습니다.'],
  ])('shows the %s status inside the open listbox', async (state, statusText) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (state === 'loading') return new Promise<Response>(() => {});
        return jsonResponse({ code: 'internal.unexpected', message: 'failed' }, 500);
      }),
    );
    renderPicker();
    fireEvent.click(screen.getByRole('combobox', { name: 'VOC 선택' }));
    const listbox = screen.getByRole('listbox', { name: 'VOC 목록' });

    expect(await within(listbox).findByText(statusText)).toBeInTheDocument();
  });

  it('shows the empty-search copy only after the searched response arrives', async () => {
    let releaseSearch: ((body: unknown) => void) | undefined;
    const searchedResponse = new Promise<Response>((resolve) => {
      releaseSearch = (body: unknown) => resolve(jsonResponse(body));
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('q=')) return searchedResponse;
      return jsonResponse({ items: VOCS, page: { has_more: false } });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(await screen.findByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: 'VOC-99' },
    });

    // The copy must come from the searched (empty) server response, not from
    // an earlier local state: await the parsed q request first.
    await waitFor(() => {
      const [searchedUrl] = searchedFetchUrls(fetchMock.mock.calls);
      expect(searchedUrl).toBeDefined();
      if (searchedUrl === undefined) return;
      const parsed = listVocsQuerySchema.safeParse(
        Object.fromEntries(new URL(searchedUrl, 'http://localhost').searchParams),
      );
      expect(parsed.success && parsed.data?.q).toBe('VOC-99');
    });
    expect(screen.queryByText('검색 결과가 없습니다.')).not.toBeInTheDocument();

    act(() => releaseSearch?.({ items: [], page: { has_more: false } }));
    expect(await screen.findByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('sends the padded lowercase search trimmed as q and lists the searched row', async () => {
    const fetchMock = installFetch((q) => (q === 'voc-12' ? [VOC_12] : []));
    const onChange = renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(await screen.findByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: ' voc-12 ' },
    });

    await waitFor(() => {
      expect(searchedFetchUrls(fetchMock.mock.calls)).toHaveLength(1);
    });
    const [searchedUrl] = searchedFetchUrls(fetchMock.mock.calls);
    expect(searchedUrl).toBeDefined();
    if (searchedUrl === undefined) return;
    const parsed = listVocsQuerySchema.safeParse(
      Object.fromEntries(new URL(searchedUrl, 'http://localhost').searchParams),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data?.q).toBe('voc-12');

    // The server's row must survive rendering even though the typed text is
    // neither trimmed like the request nor matched by the label substring.
    await userEvent.click(await screen.findByRole('option', { name: 'VOC-12 · 로그인 오류' }));
    expect(onChange).toHaveBeenCalledWith(VOC_12_ID);
  });

  it('offers an exact display ID the searched page lacks as the first option', async () => {
    const voc10 = makeVoc('10000000-0000-0000-0000-000000000010', 'VOC-10', '최근 VOC');
    installFetch((q) => (q === 'VOC-1' ? [voc10] : []), false, {
      resolve: () => jsonResponse(resolveBody('voc', EXACT_VOC_ID, 'VOC-1')),
      vocDetail: () => jsonResponse(makeVoc(EXACT_VOC_ID, 'VOC-1', '오래된 정확 VOC')),
    });
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(await screen.findByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: 'VOC-1' },
    });

    await screen.findByRole('option', { name: 'VOC-1 · 오래된 정확 VOC' });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'VOC-1 · 오래된 정확 VOC',
      'VOC-10 · 최근 VOC',
    ]);
  });

  it('does not offer an exact VOC from another Managed System', async () => {
    const voc10 = makeVoc('10000000-0000-0000-0000-000000000010', 'VOC-10', '최근 VOC');
    const fetchMock = installFetch((q) => (q === 'VOC-1' ? [voc10] : []), false, {
      resolve: () => jsonResponse(resolveBody('voc', EXACT_VOC_ID, 'VOC-1')),
      vocDetail: () =>
        jsonResponse(makeVoc(EXACT_VOC_ID, 'VOC-1', '다른 MS의 VOC', OTHER_MANAGED_SYSTEM_ID)),
    });
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(await screen.findByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: 'VOC-1' },
    });

    await waitFor(() => {
      expect(detailFetchUrls(fetchMock.mock.calls)).toHaveLength(1);
    });
    expect(screen.queryByRole('option', { name: 'VOC-1 · 다른 MS의 VOC' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'VOC-10 · 최근 VOC' })).toBeInTheDocument();
  });

  it('does not fetch the detail nor offer a non-VOC record for an exact display ID', async () => {
    const fetchMock = installFetch(() => [], false, {
      resolve: () => jsonResponse(resolveBody('finding', EXACT_VOC_ID, 'FIN-1')),
    });
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(await screen.findByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: 'VOC-1' },
    });

    await waitFor(() => {
      const resolveCalls = fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.startsWith('/nav/resolve?'));
      expect(resolveCalls).toHaveLength(1);
    });
    expect(detailFetchUrls(fetchMock.mock.calls)).toHaveLength(0);
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it.each([
    ['a 404 detail response', 404],
    ['a summary envelope without a title', 200],
  ])('adds nothing when the exact lookup detail returns %s', async (_label, status) => {
    const fetchMock = installFetch(() => [], false, {
      resolve: () => jsonResponse(resolveBody('voc', EXACT_VOC_ID, 'VOC-1')),
      vocDetail: (vocId) =>
        status === 404
          ? jsonResponse({ code: 'not_found.record', message: 'missing' }, 404)
          : jsonResponse({ id: vocId, display_id: 'VOC-1' }),
    });
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(await screen.findByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: 'VOC-1' },
    });

    await waitFor(() => {
      expect(detailFetchUrls(fetchMock.mock.calls)).toHaveLength(1);
    });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('still offers the exact VOC when the searched page returns 100 other VOC-1… rows', async () => {
    const many = Array.from({ length: 100 }, (_, index) =>
      makeVoc(
        `20000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
        `VOC-${100 + index}`,
        `묶음 제목 ${index}`,
      ),
    );
    installFetch((q) => (q === 'VOC-1' ? many : []), false, {
      resolve: () => jsonResponse(resolveBody('voc', EXACT_VOC_ID, 'VOC-1')),
      vocDetail: () => jsonResponse(makeVoc(EXACT_VOC_ID, 'VOC-1', '오래된 정확 VOC')),
    });
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(await screen.findByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: 'VOC-1' },
    });

    await screen.findByRole('option', { name: 'VOC-1 · 오래된 정확 VOC' });
    const allOptions = screen.getAllByRole('option');
    expect(allOptions).toHaveLength(101);
    expect(allOptions[0]?.textContent).toBe('VOC-1 · 오래된 정확 VOC');
  });

  it('keeps the selected search-only VOC label on the trigger after the search resets', async () => {
    const olderVoc = makeVoc(VOC_12_ID, 'VOC-7', '아카이브 이전 VOC');
    installFetch((q) => (q === undefined ? [] : [olderVoc]));

    function Harness(): ReactElement {
      const [value, setValue] = useState<string | null>(null);
      return (
        <VocSourcePicker
          managedSystemId={MANAGED_SYSTEM_ID}
          value={value}
          onChange={setValue}
          id="voc-source-picker"
          invalid={false}
        />
      );
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <FieldLabel htmlFor="voc-source-picker">VOC 선택</FieldLabel>
        <Harness />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(await screen.findByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: 'VOC-7' },
    });
    await userEvent.click(await screen.findByRole('option', { name: 'VOC-7 · 아카이브 이전 VOC' }));

    // Selecting clears the search; once the debounce returns to the newest-100
    // page (cached empty in this mock), the trigger must still show the
    // picked VOC.
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 700);
      });
    });
    expect(screen.getByRole('combobox', { name: 'VOC 선택' })).toHaveTextContent(
      'VOC-7 · 아카이브 이전 VOC',
    );
  });

  it('sends the debounced search text as q on GET /vocs (parsed with listVocsQuerySchema)', async () => {
    const fetchMock = installFetch();
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(screen.getByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: '결제' },
    });

    await waitFor(() => {
      const searchCalls = fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes('q='));
      expect(searchCalls.length).toBeGreaterThan(0);
    });
    const searchedUrls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('q='));
    const searchedUrl = searchedUrls.at(-1);
    expect(searchedUrl).toBeDefined();
    if (searchedUrl === undefined) return;
    const parsed = listVocsQuerySchema.safeParse(
      Object.fromEntries(new URL(searchedUrl, 'http://localhost').searchParams),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data?.view).toBe('inbox');
    expect(parsed.data?.managed_system_id).toBe(MANAGED_SYSTEM_ID);
    expect(parsed.data?.limit).toBe(100);
    expect(parsed.data?.q).toBe('결제');
  });

  it('does not request a Hangul-final search at 300 ms and requests it once at 700 ms', async () => {
    vi.useFakeTimers();
    const fetchMock = installFetch();
    renderPicker();
    fireEvent.click(screen.getByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(screen.getByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: '로그이' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(searchedFetchUrls(fetchMock.mock.calls)).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(searchedFetchUrls(fetchMock.mock.calls)).toEqual([vocsUrl(MANAGED_SYSTEM_ID, '로그이')]);
  });

  // Non-Hangul on purpose: a Hangul-final draft waits 700 ms (#894).
  it('debounces the q request until the search has settled', async () => {
    vi.useFakeTimers();
    const fetchMock = installFetch();
    renderPicker();
    fireEvent.click(screen.getByRole('combobox', { name: 'VOC 선택' }));
    const searchInput = screen.getByPlaceholderText('VOC ID 또는 제목 검색');
    fireEvent.change(searchInput, { target: { value: 'pay' } });
    fireEvent.change(searchInput, { target: { value: 'pay screen' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(
      fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('q=')),
    ).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(
      fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('q=')),
    ).toEqual([vocsUrl(MANAGED_SYSTEM_ID, 'pay screen')]);
  });

  it('selects an older VOC that only the server search returns', async () => {
    const olderVoc = makeVoc(VOC_12_ID, 'VOC-7', '아카이브 이전 VOC');
    installFetch((q) => (q === undefined ? [] : [olderVoc]));
    const onChange = renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(screen.getByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: 'VOC-7' },
    });

    const option = await screen.findByRole('option', { name: 'VOC-7 · 아카이브 이전 VOC' });
    await userEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(VOC_12_ID);
  });

  it.each([
    [
      'without a search shows the recent-100 hint',
      '',
      '최근 100건만 표시됩니다. VOC ID나 제목으로 검색하세요.',
    ],
    [
      'with a search shows the many-results hint',
      '로그인',
      '결과가 많습니다. 검색어를 더 입력하세요.',
    ],
  ])('has_more hint %s', async (_label, typed, expectedHint) => {
    installFetch(undefined, true);
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    if (typed !== '') {
      fireEvent.change(screen.getByPlaceholderText('VOC ID 또는 제목 검색'), {
        target: { value: typed },
      });
    }

    expect(await within(screen.getByRole('dialog')).findByText(expectedHint)).toBeInTheDocument();
  });

  it('shows the approved permission copy for a permission-coded list error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ code: 'permission.scope_required', message: 'forbidden' }, 403),
      ),
    );
    renderPicker();
    fireEvent.click(screen.getByRole('combobox', { name: 'VOC 선택' }));

    expect(
      await within(screen.getByRole('listbox', { name: 'VOC 목록' })).findByText(
        '선택한 Managed System의 VOC를 볼 권한이 없습니다.',
      ),
    ).toBeInTheDocument();
  });
});
