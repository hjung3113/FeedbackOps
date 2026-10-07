import { type VocListItem, listVocsQuerySchema } from '@fops/shared';
import { FieldLabel } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VocSourcePicker } from './VocSourcePicker';

const MANAGED_SYSTEM_ID = '30000000-0000-0000-0000-000000000003';
const VOC_12_ID = '10000000-0000-0000-0000-000000000012';
const VOC_13_ID = '10000000-0000-0000-0000-000000000013';

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
 * Installs a fetch mock whose /vocs response can depend on the requested `q`
 * (server-side search #821). The resolve-path fetches are gone from the picker,
 * so unknown URLs just return an empty 200.
 */
function installFetch(
  vocsForQ: (q: string | undefined) => VocListItem[] = () => VOCS,
  hasMore = false,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/vocs?')) {
      const q = new URL(url, 'http://localhost').searchParams.get('q') ?? undefined;
      return jsonResponse({ items: vocsForQ(q), page: { has_more: hasMore } });
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

  it('shows the empty-search copy inside the listbox when the server search returns nothing', async () => {
    installFetch((q) => (q === undefined ? VOCS : []));
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(screen.getByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: 'VOC-99' },
    });

    expect(
      await within(screen.getByRole('listbox', { name: 'VOC 목록' })).findByText(
        '검색 결과가 없습니다.',
      ),
    ).toBeInTheDocument();
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

  it('debounces the q request until the search has settled', async () => {
    vi.useFakeTimers();
    const fetchMock = installFetch();
    renderPicker();
    fireEvent.click(screen.getByRole('combobox', { name: 'VOC 선택' }));
    const searchInput = screen.getByPlaceholderText('VOC ID 또는 제목 검색');
    fireEvent.change(searchInput, { target: { value: '결제' } });
    fireEvent.change(searchInput, { target: { value: '결제 화면' } });

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
    ).toEqual([vocsUrl(MANAGED_SYSTEM_ID, '결제 화면')]);
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
