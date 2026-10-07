import type { VocListItem } from '@fops/shared';
import { FieldLabel } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VocSourcePicker } from './VocSourcePicker';

const MANAGED_SYSTEM_ID = '30000000-0000-0000-0000-000000000003';
const OTHER_MANAGED_SYSTEM_ID = '30000000-0000-0000-0000-000000000013';
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

function installFetch(
  resolve?: (displayId: string) => Response,
  vocs: VocListItem[] = VOCS,
  resolvedVoc: unknown = VOC_12,
  hasMore = false,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/vocs?')) {
      return jsonResponse({ items: vocs, page: { has_more: hasMore } });
    }
    if (url === `/vocs/${VOC_12_ID}`) return jsonResponse(resolvedVoc);
    if (url.startsWith('/nav/resolve?display_id=')) {
      const displayId = new URL(url, 'http://localhost').searchParams.get('display_id') ?? '';
      return (
        resolve?.(displayId) ??
        jsonResponse({ code: 'not_found.record', message: 'not found' }, 404)
      );
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
      `/vocs?view=inbox&managed_system_id=${MANAGED_SYSTEM_ID}&limit=100`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it.each([
    ['loading', 'VOC 목록을 불러오는 중입니다.'],
    ['error', 'VOC 목록을 불러오지 못했습니다.'],
    ['unavailable', 'VOC를 찾을 수 없거나 권한이 없습니다.'],
  ])('shows the %s status inside the open listbox', async (state, statusText) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/vocs?')) {
          if (state === 'loading') return new Promise<Response>(() => {});
          if (state === 'error') {
            return jsonResponse({ code: 'internal.unexpected', message: 'failed' }, 500);
          }
          return jsonResponse({ items: [], page: { has_more: false } });
        }
        if (url.startsWith('/nav/resolve?display_id=')) {
          return jsonResponse({ code: 'not_found.record', message: 'not found' }, 404);
        }
        return jsonResponse({});
      }),
    );
    renderPicker();
    fireEvent.click(screen.getByRole('combobox', { name: 'VOC 선택' }));
    const listbox = screen.getByRole('listbox', { name: 'VOC 목록' });

    if (state === 'unavailable') {
      fireEvent.change(screen.getByPlaceholderText('VOC ID 또는 제목 검색'), {
        target: { value: 'VOC-99' },
      });
    }

    expect(await within(listbox).findByText(statusText)).toBeInTheDocument();
  });

  it('resolves an unlisted VOC display ID and offers it for selection', async () => {
    const fetchMock = installFetch(
      (displayId) =>
        jsonResponse({
          entity_type: 'voc',
          id: VOC_12_ID,
          display_id: displayId,
          route_intent: {
            route: '/vocs',
            search: { view: 'inbox', selected: VOC_12_ID },
          },
        }),
      [VOC_13],
    );
    const onChange = renderPicker();
    const trigger = await screen.findByRole('combobox', { name: 'VOC 선택' });
    fireEvent.click(trigger);
    const searchInput = await screen.findByPlaceholderText('VOC ID 또는 제목 검색');
    await userEvent.type(searchInput, 'VOC-12');

    const option = await screen.findByRole('option', { name: 'VOC-12 · 로그인 오류' });
    await userEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(VOC_12_ID);
    expect(fetchMock).toHaveBeenCalledWith(
      '/nav/resolve?display_id=VOC-12',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(`/vocs/${VOC_12_ID}`, expect.anything());
  });

  it.each([
    [
      'summary-envelope response',
      {
        id: VOC_12_ID,
        display_id: 'VOC-12',
        primary_managed_system_id: MANAGED_SYSTEM_ID,
        reporter_facing_status: 'reviewing',
        created_at: '2026-10-01T00:00:00.000Z',
        permission_decisions: {},
      },
      false,
    ],
    [
      'reporter-arm response',
      {
        id: VOC_12_ID,
        display_id: 'VOC-12',
        title: '로그인 오류',
        primary_managed_system_id: MANAGED_SYSTEM_ID,
      },
      true,
    ],
  ])('handles a %s from GET /vocs/:id', async (_label, resolvedVoc, selectable) => {
    installFetch(
      (displayId) =>
        jsonResponse({
          entity_type: 'voc',
          id: VOC_12_ID,
          display_id: displayId,
          route_intent: {
            route: '/vocs',
            search: { view: 'inbox', selected: VOC_12_ID },
          },
        }),
      [VOC_13],
      resolvedVoc,
    );
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(screen.getByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: 'VOC-12' },
    });
    const listbox = screen.getByRole('listbox', { name: 'VOC 목록' });

    if (selectable) {
      expect(
        await within(listbox).findByRole('option', { name: 'VOC-12 · 로그인 오류' }),
      ).toBeInTheDocument();
    } else {
      expect(
        await within(listbox).findByText('VOC를 찾을 수 없거나 권한이 없습니다.'),
      ).toBeInTheDocument();
    }
  });

  it('debounces display-ID lookup until the search has settled', async () => {
    vi.useFakeTimers();
    const fetchMock = installFetch(
      (displayId) =>
        jsonResponse({
          entity_type: 'voc',
          id: VOC_12_ID,
          display_id: displayId,
          route_intent: {
            route: '/vocs',
            search: { view: 'inbox', selected: VOC_12_ID },
          },
        }),
      [VOC_13],
    );
    renderPicker();
    fireEvent.click(screen.getByRole('combobox', { name: 'VOC 선택' }));
    const searchInput = screen.getByPlaceholderText('VOC ID 또는 제목 검색');
    fireEvent.change(searchInput, { target: { value: 'VOC-1' } });
    fireEvent.change(searchInput, { target: { value: 'VOC-12' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/nav/resolve'))).toEqual(
      [],
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(
      fetchMock.mock.calls
        .filter(([url]) => String(url).startsWith('/nav/resolve'))
        .map(([url]) => String(url)),
    ).toEqual(['/nav/resolve?display_id=VOC-12']);
  });

  it('drops resolved options that no longer match the current search', async () => {
    installFetch(
      (displayId) =>
        jsonResponse({
          entity_type: 'voc',
          id: VOC_12_ID,
          display_id: displayId,
          route_intent: {
            route: '/vocs',
            search: { view: 'inbox', selected: VOC_12_ID },
          },
        }),
      [VOC_13],
    );
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    const searchInput = screen.getByPlaceholderText('VOC ID 또는 제목 검색');
    fireEvent.change(searchInput, { target: { value: 'VOC-12' } });
    expect(await screen.findByRole('option', { name: 'VOC-12 · 로그인 오류' })).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'VOC-1' } });
    expect(screen.queryByRole('option', { name: /^VOC-12/ })).not.toBeInTheDocument();
  });

  it.each([404, 403])(
    'shows the same unavailable message when display-ID lookup returns %i',
    async (status) => {
      installFetch(() =>
        jsonResponse(
          {
            code: status === 404 ? 'not_found.record' : 'permission.denied',
            message: 'not available',
          },
          status,
        ),
      );
      renderPicker();
      fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
      const searchInput = await screen.findByPlaceholderText('VOC ID 또는 제목 검색');
      await userEvent.type(searchInput, 'VOC-99');

      expect(
        await within(screen.getByRole('listbox', { name: 'VOC 목록' })).findByText(
          'VOC를 찾을 수 없거나 권한이 없습니다.',
        ),
      ).toBeInTheDocument();
    },
  );

  it('does not offer a resolved non-VOC record', async () => {
    installFetch(
      (displayId) =>
        jsonResponse({
          entity_type: 'finding',
          id: VOC_12_ID,
          display_id: displayId,
          route_intent: { route: '/findings', search: { selected: VOC_12_ID } },
        }),
      [VOC_13],
    );
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    const searchInput = await screen.findByPlaceholderText('VOC ID 또는 제목 검색');
    await userEvent.type(searchInput, 'VOC-12');

    expect(
      await within(screen.getByRole('listbox', { name: 'VOC 목록' })).findByText(
        'VOC를 찾을 수 없거나 권한이 없습니다.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^VOC-12/ })).not.toBeInTheDocument();
  });

  it('does not offer a VOC from another Managed System', async () => {
    installFetch(
      (displayId) =>
        jsonResponse({
          entity_type: 'voc',
          id: VOC_12_ID,
          display_id: displayId,
          route_intent: {
            route: '/vocs',
            search: { view: 'inbox', selected: VOC_12_ID },
          },
        }),
      [VOC_13],
      makeVoc(VOC_12_ID, 'VOC-12', '다른 시스템 VOC', OTHER_MANAGED_SYSTEM_ID),
    );
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    const searchInput = await screen.findByPlaceholderText('VOC ID 또는 제목 검색');
    await userEvent.type(searchInput, 'VOC-12');

    expect(
      await within(screen.getByRole('listbox', { name: 'VOC 목록' })).findByText(
        'VOC를 찾을 수 없거나 권한이 없습니다.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'VOC-12 · 다른 시스템 VOC' }),
    ).not.toBeInTheDocument();
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

  it('shows the 100-VOC limit hint inside the popover while searching', async () => {
    installFetch(undefined, VOCS, VOC_12, true);
    renderPicker();
    fireEvent.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    fireEvent.change(screen.getByPlaceholderText('VOC ID 또는 제목 검색'), {
      target: { value: '로그인' },
    });

    expect(
      await within(screen.getByRole('dialog')).findByText(
        '최근 100건만 표시됩니다. 이전 VOC는 VOC ID로 검색하세요.',
      ),
    ).toBeInTheDocument();
  });
});
