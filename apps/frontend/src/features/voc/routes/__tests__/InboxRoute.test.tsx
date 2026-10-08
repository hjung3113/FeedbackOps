// InboxRoute.test.tsx — unit tests for useInboxRoute hook (C9 of Slice 3 #20).
//
// Strategy: mount a thin wrapper that calls useInboxRoute() and renders its
// `list` slot. VocDetailPanel and VocList are stubbed to avoid full API setup.
// Asserting:
//   - 3 mocked VocList rows render
//   - clicking a row calls navigate with `selected` URL param
//   - VocDetailPanel is mounted when `selected` is set

import { ApiError } from '@/lib/api/types';
import { listVocsQuerySchema } from '@fops/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as UseVocListModule from '../../hooks/useVocList';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const navigateMock = vi.fn();
let searchState: Record<string, unknown> = {};
const apiClientMock = vi.hoisted(() => vi.fn());
const openRequestAccessMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useSearch: () => searchState,
  useNavigate: () => navigateMock,
  Link: ({
    children,
    to,
    search,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    search?: unknown;
    className?: string;
  }) => (
    <a href={to} data-search={JSON.stringify(search)} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/features/admin/permissions/request-access-button', () => ({
  RequestAccessButton: ({
    capability,
    managedSystemId,
    returnRouteIntent,
    renderTrigger,
  }: {
    capability: string;
    managedSystemId?: string;
    returnRouteIntent: string;
    renderTrigger?: (open: () => void) => React.ReactNode;
  }) => (
    <div
      data-testid="request-access-flow"
      data-capability={capability}
      data-managed-system-id={managedSystemId}
      data-return-route-intent={returnRouteIntent}
    >
      {renderTrigger !== undefined ? (
        renderTrigger(openRequestAccessMock)
      ) : (
        <button type="button" data-testid="request-access">
          {capability}
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, apiClient: apiClientMock };
});

// ── Stub useVocList ────────────────────────────────────────────────────────────

const MOCK_VOC_ITEMS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    display_id: 'VOC-001',
    title: '피드백 1',
    primary_managed_system_id: 'ms-1',
    analytics_area_id: null,
    reporter_id: 'u1',
    owner_user_id: null,
    owner_team_id: null,
    severity: 'high' as const,
    reporter_facing_status: 'received' as const,
    triage_state: 'untriaged' as const,
    source_context: 'direct_use' as const,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    similar_count: 0,
    attachment_count: 0,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    display_id: 'VOC-002',
    title: '피드백 2',
    primary_managed_system_id: 'ms-1',
    analytics_area_id: null,
    reporter_id: 'u2',
    owner_user_id: null,
    owner_team_id: null,
    severity: 'low' as const,
    reporter_facing_status: 'reviewing' as const,
    triage_state: 'untriaged' as const,
    source_context: 'proxy_report' as const,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    similar_count: 0,
    attachment_count: 0,
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    display_id: 'VOC-003',
    title: '피드백 3',
    primary_managed_system_id: 'ms-2',
    analytics_area_id: null,
    reporter_id: 'u3',
    owner_user_id: null,
    owner_team_id: null,
    severity: null,
    reporter_facing_status: 'assigned' as const,
    triage_state: 'triaged' as const,
    source_context: 'stakeholder_request' as const,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    similar_count: 0,
    attachment_count: 0,
  },
];

const useVocListMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useVocList', () => ({
  useVocList: useVocListMock,
}));

// ── Stub VocDetailPanel ───────────────────────────────────────────────────────

vi.mock('../../components/detail/VocDetailPanel', () => ({
  VocDetailPanel: ({
    vocId,
    managedSystemId,
    onClose,
  }: {
    vocId: string;
    managedSystemId?: string;
    onClose: () => void;
  }) => {
    useEffect(() => {
      if (managedSystemId !== undefined && managedSystemId !== 'ms-1') onClose();
    }, [managedSystemId, onClose]);

    return (
      <div
        data-testid="voc-detail-panel-stub"
        data-managed-system-id={managedSystemId}
        data-voc-id={vocId}
      >
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    );
  },
}));

// ── Stub VocList to use real component but mock managed-systems query ─────────

// VocList imports useQuery for managed-systems — stub @tanstack/react-query
vi.mock('@tanstack/react-query', () => ({
  // The real useVocList imports this. The mock useQuery below ignores it.
  keepPreviousData: (previous: unknown) => previous,
  useQuery: (options: {
    queryKey?: readonly unknown[];
    queryFn?: (context: { signal: AbortSignal }) => Promise<unknown>;
  }) => {
    if (options.queryKey?.[0] === 'vocs' && options.queryFn) {
      void options.queryFn({ signal: new AbortController().signal });
    }
    return { data: { items: [] }, isLoading: false, error: null, refetch: vi.fn() };
  },
}));

// ── Test harness ──────────────────────────────────────────────────────────────

import { Route as vocsRoute } from '@/routes/_authed/vocs';
import { SEARCH_DEBOUNCE_MS, SEARCH_HANGUL_DEBOUNCE_MS, useInboxRoute } from '../InboxRoute';

function InboxTestHarness({ view }: { view: 'inbox' | 'my' }) {
  const { list, detailPanel } = useInboxRoute(view);
  return (
    <div>
      {list}
      {detailPanel}
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useInboxRoute', () => {
  beforeEach(() => {
    searchState = {};
    navigateMock.mockClear();
    apiClientMock.mockReset();
    openRequestAccessMock.mockReset();
    apiClientMock.mockResolvedValue({ data: { items: [] } });
    useVocListMock.mockReturnValue({
      data: { items: MOCK_VOC_ITEMS, next_cursor: undefined },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('forwards filter.analytics_area=unset from inbox search to the fetch URL', async () => {
    const { useVocList } =
      await vi.importActual<typeof import('../../hooks/useVocList')>('../../hooks/useVocList');
    useVocListMock.mockImplementation(useVocList);
    const route = vocsRoute as unknown as {
      options: { validateSearch: (raw: unknown) => Record<string, unknown> };
    };
    searchState = route.options.validateSearch({ view: 'inbox', 'filter.analytics_area': 'unset' });

    render(<InboxTestHarness view="inbox" />);

    await waitFor(() => {
      const requestUrl = apiClientMock.mock.calls.find(([method]) => method === 'GET')?.[1];
      expect(requestUrl).toEqual(expect.any(String));
      if (typeof requestUrl !== 'string') return;

      const query = new URL(requestUrl, 'http://localhost').searchParams;
      expect(query.get('filter.analytics_area')).toBe('unset');
      expect(query.has('tab')).toBe(false);
      expect(screen.getByRole('tab', { name: '미분류' })).toHaveAttribute('aria-selected', 'false');
    });
  });

  it('renders 3 VocList rows for inbox view', async () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    await waitFor(() => {
      expect(screen.getByText('피드백 1')).toBeInTheDocument();
      expect(screen.getByText('피드백 2')).toBeInTheDocument();
      expect(screen.getByText('피드백 3')).toBeInTheDocument();
    });
  });

  it('renders prototype inbox tab icons and native tips without synthetic counts', () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    const expectedTips: Array<[string, string]> = [
      ['미분류', '아직 분류되지 않은 VOC'],
      ['높음', '높음 · 심각 심각도'],
      ['미배정', '담당자 미지정'],
      ['연결 없음', 'Finding / Task 연결 없음'],
      ['높음 · 연결 없음', '높음 이상인데 Finding / Task 연결 없음'],
    ];
    for (const [label, tip] of expectedTips) {
      const tab = screen.getByRole('tab', { name: label });
      expect(tab).toHaveAttribute('title', tip);
      expect(tab.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(tab).not.toHaveTextContent(/\d/);
    }

    const noTaskTab = screen.getByRole('tab', { name: 'Task 없음' });
    expect(noTaskTab.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(noTaskTab).not.toHaveAttribute('title');
    expect(noTaskTab).not.toHaveTextContent(/\d/);
  });

  it('keeps the selected inbox tab in URL state', () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: '높음' }));

    const navigation = navigateMock.mock.calls.at(-1)?.[0] as {
      to: string;
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(navigation.to).toBe('/vocs');
    expect(navigation.search(searchState)).toEqual({ view: 'inbox', tab: 'high' });
  });

  it('renders 3 VocList rows for my view', async () => {
    searchState = { view: 'my' };
    render(<InboxTestHarness view="my" />);

    await waitFor(() => {
      expect(screen.getByText('피드백 1')).toBeInTheDocument();
      expect(screen.getByText('피드백 2')).toBeInTheDocument();
      expect(screen.getByText('피드백 3')).toBeInTheDocument();
    });
  });

  it('opens VOC creation when the 내 VOC empty-state button is clicked', () => {
    searchState = { view: 'my' };
    useVocListMock.mockReturnValue({
      data: { items: [], next_cursor: undefined },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<InboxTestHarness view="my" />);

    fireEvent.click(screen.getByRole('button', { name: '+ 새 VOC 작성' }));

    const navigation = navigateMock.mock.calls.at(-1)?.[0] as {
      to: string;
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(navigation.to).toBe('/vocs');
    expect(navigation.search(searchState)).toEqual({ view: 'my', action: 'create' });
  });

  it('clicking a row calls navigate with selected param', async () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    await waitFor(() => {
      expect(screen.getByText('피드백 1')).toBeInTheDocument();
    });

    // VocRow emits click on the row element. Find the first row.
    const row = screen.getAllByRole('row')[0];
    if (row) {
      fireEvent.click(row);
    } else {
      // Fallback: click the title text directly (VocRow may use different role)
      fireEvent.click(screen.getByText('피드백 1'));
    }

    expect(navigateMock).toHaveBeenCalled();
    const callArg = navigateMock.mock.calls[0]?.[0] as {
      to: string;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(callArg.to).toBe('/vocs');
    // The search reducer should return an object containing `selected`
    const result = callArg.search({});
    expect(result).toHaveProperty('selected');
  });

  it('mounts VocDetailPanel when selected is set in URL', async () => {
    searchState = {
      view: 'inbox',
      selected: '00000000-0000-0000-0000-000000000001',
    };
    render(<InboxTestHarness view="inbox" />);

    await waitFor(() => {
      expect(screen.getByTestId('voc-detail-panel-stub')).toBeInTheDocument();
    });
    expect(screen.getByTestId('voc-detail-panel-stub').getAttribute('data-voc-id')).toBe(
      '00000000-0000-0000-0000-000000000001',
    );
  });

  it('clears selected after the URL Managed System changes outside the open VOC scope', async () => {
    const selected = '00000000-0000-0000-0000-000000000001';
    searchState = { view: 'inbox', managedSystem: 'ms-1', selected };
    const { rerender } = render(<InboxTestHarness view="inbox" />);

    await screen.findByTestId('voc-detail-panel-stub');

    searchState = { view: 'inbox', managedSystem: 'ms-2', selected };
    rerender(<InboxTestHarness view="inbox" />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const navigation = navigateMock.mock.calls.at(-1)?.[0] as {
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(navigation.search(searchState)).toEqual({ view: 'inbox', managedSystem: 'ms-2' });

    searchState = navigation.search(searchState);
    rerender(<InboxTestHarness view="inbox" />);
    expect(screen.queryByTestId('voc-detail-panel-stub')).not.toBeInTheDocument();
  });

  it('passes the selected Managed System to the open detail panel', async () => {
    searchState = {
      view: 'my',
      managedSystem: 'ms-1',
      selected: '00000000-0000-0000-0000-000000000001',
    };
    render(<InboxTestHarness view="my" />);

    expect(await screen.findByTestId('voc-detail-panel-stub')).toHaveAttribute(
      'data-managed-system-id',
      'ms-1',
    );
  });

  it('clears VocDetailPanel when selected is not set', async () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    await waitFor(() => {
      expect(screen.queryByTestId('voc-detail-panel-stub')).not.toBeInTheDocument();
    });
  });

  it('inbox view renders tab labels', async () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    await waitFor(() => {
      // The same-Managed-System peer tab keeps its URL value `similar`.
      expect(screen.getByText('미분류')).toBeInTheDocument();
    });
  });

  it('AC-E6a renders High · no link as the selected URL tab', async () => {
    searchState = { view: 'inbox', tab: 'high-no-link' };
    render(<InboxTestHarness view="inbox" />);

    const tab = await screen.findByRole('tab', { name: '높음 · 연결 없음' });
    expect(tab).toHaveAttribute('data-state', 'active');
  });

  it('AC-E6b renders the seven inbox tabs in canonical value order', async () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    await screen.findByRole('tab', { name: '미분류' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      '미분류',
      '높음',
      '미배정',
      '연결 없음',
      '높음 · 연결 없음',
      'Task 없음',
    ]);

    // Untriaged is already the active tab and Radix emits no onValueChange for
    // the selected value, so it is asserted through aria-selected instead of
    // through a navigation. The other five each have to route.
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    // Radix TabsTrigger activates on mousedown, not click. fireEvent.click left
    // navigateMock at 0, so the assertion below had nothing to beat.
    for (const tab of tabs.slice(1)) fireEvent.mouseDown(tab);
    expect(navigateMock).toHaveBeenCalledTimes(5);
    expect(
      navigateMock.mock.calls.map(([call]) => {
        const reducer = (
          call as { search: (previous: Record<string, unknown>) => Record<string, unknown> }
        ).search;
        return reducer({}).tab;
      }),
    ).toEqual(['high', 'unassigned', 'no-link', 'high-no-link', 'no-task']);
  });

  it('my view renders 내 VOC title instead of tabs', async () => {
    searchState = { view: 'my' };
    render(<InboxTestHarness view="my" />);

    await waitFor(() => {
      expect(screen.getByText('내 VOC')).toBeInTheDocument();
    });
  });

  it('renders permission denied instead of VocList failed-load copy for a 403', async () => {
    useVocListMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(403, {
        code: 'permission.denied',
        message: 'no voc.read scope for actor',
      }),
      refetch: vi.fn(),
    });
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    const panel = await screen.findByText('VOC 수신함');
    // #562: specs/voc.md R-VOC-INBOX — nothing requestable -> blocked_not_requestable.
    expect(panel.closest('[data-state]')).toHaveAttribute('data-state', 'blocked_not_requestable');
    expect(screen.queryByText('불러오기 실패')).not.toBeInTheDocument();
    expect(screen.queryByTestId('request-access')).not.toBeInTheDocument();
  });

  it('shows the Korean denied reason and links to 내 VOC for a 403', async () => {
    useVocListMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(403, {
        code: 'permission.denied',
        message: 'no voc.read scope for actor',
      }),
      refetch: vi.fn(),
    });
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    expect(
      await screen.findByText(
        'VOC 수신함을 볼 권한이 없습니다. 내가 접수한 VOC는 내 VOC에서 확인할 수 있습니다.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('no voc.read scope for actor')).not.toBeInTheDocument();

    const myVocsLink = screen.getByRole('link', { name: '내 VOC' });
    expect(myVocsLink).toHaveAttribute('href', '/vocs');
    expect(myVocsLink).toHaveAttribute('data-search', JSON.stringify({ view: 'my' }));
  });

  it('adds a request-access CTA only when the Inbox error provides the permission', async () => {
    useVocListMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(403, {
        code: 'permission.scope_required',
        message: 'voc.read capability required',
        requestable_permission: { permission: 'voc.read', managed_system_id: 'ms-1' },
      }),
      refetch: vi.fn(),
    });
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    const panel = await screen.findByText('VOC 수신함');
    expect(panel.closest('[data-state]')).toHaveAttribute('data-state', 'request_access');
    const requestButton = screen.getByRole('button', { name: '권한 요청하기' });
    expect(screen.getAllByRole('button', { name: '권한 요청하기' })).toHaveLength(1);
    const requestFlow = screen.getByTestId('request-access-flow');
    expect(requestFlow).toHaveAttribute('data-capability', 'voc.read');
    expect(requestFlow).toHaveAttribute('data-managed-system-id', 'ms-1');
    expect(requestFlow).toHaveAttribute('data-return-route-intent', '/vocs?view=inbox');
    fireEvent.click(requestButton);
    expect(openRequestAccessMock).toHaveBeenCalledTimes(1);
    // #562: an out-of-scope Managed System is not "no Inbox access" — no 내 VOC detour.
    expect(
      screen.getByText('선택한 Managed System의 VOC를 볼 권한이 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('voc-inbox-denied-my-vocs')).not.toBeInTheDocument();
  });

  it('keeps a non-permission error on VocList failed-load copy', async () => {
    useVocListMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(500, { code: 'internal.unexpected', message: 'server failed' }),
      refetch: vi.fn(),
    });
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    expect(await screen.findByText('불러오기 실패')).toBeInTheDocument();
    expect(document.querySelector('[data-state="denied"]')).not.toBeInTheDocument();
  });

  // ── Filter-key round-trip regression (#89) ──────────────────────────────────
  //
  // Bug: the status filter category declared key `filter.reporter_facing_status`
  // while the URL read/write used `filter.reporterStatus`, so the URL key and the
  // ListFilterButton key were two different names bridged by hand-rolled
  // translation. This test pins BOTH directions to the single unified key
  // `filter.reporterStatus`:
  //   (read)  a status value in the URL marks the matching popover option checked
  //   (write) toggling a status option writes back under `filter.reporterStatus`
  describe('status filter-key round-trip', () => {
    it('reads filter.reporterStatus from the URL into the filter popover (checked)', async () => {
      searchState = { view: 'inbox', 'filter.reporterStatus': 'reviewing' };
      render(<InboxTestHarness view="inbox" />);

      // Open the filter popover.
      fireEvent.click(await screen.findByRole('button', { name: /필터/ }));

      // The 검토중 option must be checked because the URL key matches the
      // category key. A mismatch would leave it unchecked.
      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox', { name: '검토중' });
        expect(checkbox).toHaveAttribute('data-state', 'checked');
      });
    });

    it('writes a toggled status filter back under filter.reporterStatus', async () => {
      searchState = { view: 'inbox' };
      render(<InboxTestHarness view="inbox" />);

      fireEvent.click(await screen.findByRole('button', { name: /필터/ }));
      fireEvent.click(await screen.findByRole('checkbox', { name: '접수됨' }));

      expect(navigateMock).toHaveBeenCalled();
      const call = navigateMock.mock.calls.at(-1)?.[0] as {
        to: string;
        search: (prev: Record<string, unknown>) => Record<string, unknown>;
      };
      const result = call.search({});
      // The unified key is present and carries the toggled value.
      expect(result['filter.reporterStatus']).toBe('received');
      // The legacy/long-form key must NOT leak into the URL.
      expect(result).not.toHaveProperty('filter.reporter_facing_status');
    });
  });

  it('shows the shared medium severity label in Inbox filters', async () => {
    searchState = { view: 'inbox' };
    render(<InboxTestHarness view="inbox" />);

    fireEvent.click(await screen.findByRole('button', { name: /필터/ }));

    const mediumOption = await screen.findByRole('checkbox', { name: '중간' });
    expect(mediumOption).toBeInTheDocument();
    fireEvent.click(mediumOption);

    const call = navigateMock.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.search({})['filter.severity']).toBe('medium');
  });

  // ── Server-side text search (#821) ──────────────────────────────────────────

  const SEARCH_BOX_ROLE = 'searchbox';
  const SEARCH_BOX_NAME = '필터, 키워드…';

  function searchBox() {
    return screen.getByRole(SEARCH_BOX_ROLE, { name: SEARCH_BOX_NAME });
  }

  function lastNavigateSearch(): {
    to: string;
    search: (prev: Record<string, unknown>) => Record<string, unknown>;
    replace?: boolean;
  } {
    const call = navigateMock.mock.calls.at(-1)?.[0] as {
      to: string;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
      replace?: boolean;
    };
    expect(call).toBeDefined();
    return call;
  }

  async function lastListRequestUrl(): Promise<string> {
    await waitFor(() => {
      expect(apiClientMock.mock.calls.some(([method]) => method === 'GET')).toBe(true);
    });
    const url = apiClientMock.mock.calls.filter(([method]) => method === 'GET').at(-1)?.[1];
    expect(typeof url).toBe('string');
    return url as string;
  }

  function parseVocsQuery(url: string) {
    const raw = Object.fromEntries(new URL(url, 'http://localhost').searchParams);
    const parsed = listVocsQuerySchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    return parsed;
  }

  it('writes the debounced q to the URL and sends it on GET /vocs', async () => {
    const { useVocList } = await vi.importActual<typeof UseVocListModule>('../../hooks/useVocList');
    useVocListMock.mockImplementation(useVocList);
    const route = vocsRoute as unknown as {
      options: { validateSearch: (raw: unknown) => Record<string, unknown> };
    };
    searchState = route.options.validateSearch({ view: 'inbox' });
    const { rerender } = render(<InboxTestHarness view="inbox" />);

    fireEvent.change(searchBox(), { target: { value: '로그인' } });

    // A Hangul-final draft waits the 1000 ms #875 debounce; the URL write
    // carries q with replace: true.
    await waitFor(() => expect(navigateMock).toHaveBeenCalled(), { timeout: 2000 });
    const navigation = lastNavigateSearch();
    expect(navigation.to).toBe('/vocs');
    expect(navigation.replace).toBe(true);
    const nextSearch = navigation.search(searchState);
    expect(nextSearch.q).toBe('로그인');

    // The URL q is valid route state and drives the request.
    expect(route.options.validateSearch(nextSearch)).toEqual({
      view: 'inbox',
      q: '로그인',
    });
    searchState = nextSearch;
    rerender(<InboxTestHarness view="inbox" />);

    const url = await lastListRequestUrl();
    const parsed = parseVocsQuery(url);
    expect(parsed.data?.view).toBe('inbox');
    expect(parsed.data?.q).toBe('로그인');
    // Owner decision: a search covers the whole inbox, so the default tab is not sent.
    expect(parsed.data?.tab).toBeUndefined();
  });

  it('drops the active tab while searching and restores it when the search is cleared', async () => {
    const { useVocList } = await vi.importActual<typeof UseVocListModule>('../../hooks/useVocList');
    useVocListMock.mockImplementation(useVocList);
    searchState = { view: 'inbox', tab: 'high' };
    const { rerender } = render(<InboxTestHarness view="inbox" />);

    fireEvent.change(searchBox(), { target: { value: '로그인' } });
    // Hangul-final draft: the write lands after the 1000 ms #875 debounce.
    await waitFor(() => expect(navigateMock).toHaveBeenCalled(), { timeout: 2000 });
    const searching = lastNavigateSearch().search(searchState);
    expect(searching).toEqual({ view: 'inbox', q: '로그인' });

    searchState = searching;
    rerender(<InboxTestHarness view="inbox" />);
    const parsed = parseVocsQuery(await lastListRequestUrl());
    expect(parsed.data?.tab).toBeUndefined();
    expect(parsed.data?.q).toBe('로그인');
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('aria-selected', 'false');
    }

    navigateMock.mockClear();
    fireEvent.change(searchBox(), { target: { value: '' } });
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(lastNavigateSearch().search(searchState)).toEqual({ view: 'inbox', tab: 'high' });
  });

  it('removes q from the URL and the request when the box is emptied', async () => {
    const { useVocList } = await vi.importActual<typeof UseVocListModule>('../../hooks/useVocList');
    useVocListMock.mockImplementation(useVocList);
    searchState = { view: 'inbox', q: '로그인' };
    const { rerender } = render(<InboxTestHarness view="inbox" />);

    fireEvent.change(searchBox(), { target: { value: '' } });

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const nextSearch = lastNavigateSearch().search(searchState);
    expect(nextSearch).not.toHaveProperty('q');

    searchState = nextSearch;
    rerender(<InboxTestHarness view="inbox" />);

    const parsed = parseVocsQuery(await lastListRequestUrl());
    expect(parsed.data?.q).toBeUndefined();
  });

  it('keeps q across a tab change', async () => {
    searchState = { view: 'inbox', q: '로그인' };
    render(<InboxTestHarness view="inbox" />);

    fireEvent.mouseDown(await screen.findByRole('tab', { name: '높음' }));

    const nextSearch = lastNavigateSearch().search(searchState);
    expect(nextSearch.tab).toBe('high');
    expect(nextSearch.q).toBe('로그인');
  });

  it('searches inside a tab the user picks during the search', async () => {
    const { useVocList } = await vi.importActual<typeof UseVocListModule>('../../hooks/useVocList');
    useVocListMock.mockImplementation(useVocList);
    searchState = { view: 'inbox', tab: 'high', q: '로그인' };
    render(<InboxTestHarness view="inbox" />);

    const parsed = parseVocsQuery(await lastListRequestUrl());
    expect(parsed.data?.tab).toBe('high');
    expect(parsed.data?.q).toBe('로그인');
    expect(await screen.findByRole('tab', { name: '높음' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('shows the search empty state when q is set and the list is empty', async () => {
    useVocListMock.mockReturnValue({
      data: { items: [], next_cursor: undefined },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    searchState = { view: 'inbox', q: '없는 검색어' };
    render(<InboxTestHarness view="inbox" />);

    expect(await screen.findByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  // ── Immediate search commit on Enter / blur (#864) ─────────────────────────

  it.each([
    ['Enter', (box: HTMLElement) => fireEvent.keyDown(box, { key: 'Enter' })],
    ['blur', (box: HTMLElement) => fireEvent.blur(box)],
  ])(
    'commits the draft to the URL at once on %s, before the debounce elapses',
    (_trigger, commit) => {
      vi.useFakeTimers();
      try {
        searchState = { view: 'inbox', tab: 'high' };
        render(<InboxTestHarness view="inbox" />);
        const box = searchBox();
        fireEvent.change(box, { target: { value: '로그인' } });
        expect(navigateMock).not.toHaveBeenCalled();

        commit(box);

        expect(navigateMock).toHaveBeenCalledTimes(1);
        const navigation = lastNavigateSearch();
        expect(navigation.to).toBe('/vocs');
        expect(navigation.replace).toBe(true);
        // Exact #821 tab rules: a starting search drops the active tab, exactly
        // like the debounced write does.
        expect(navigation.search(searchState)).toEqual({ view: 'inbox', q: '로그인' });
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('keeps a tab picked before a repeated commit is acknowledged', () => {
    vi.useFakeTimers();
    try {
      // 높음 is not the active tab, so picking it is a real change. The URL
      // still shows the pre-commit search when the tab and the blur run.
      searchState = { view: 'inbox', tab: 'untriaged' };
      render(<InboxTestHarness view="inbox" />);
      const box = searchBox();
      fireEvent.change(box, { target: { value: '로그인' } });
      fireEvent.keyDown(box, { key: 'Enter' });
      // Radix TabsTrigger activates on mouseDown.
      fireEvent.mouseDown(screen.getByRole('tab', { name: '높음' }));
      fireEvent.blur(box);

      expect(navigateMock).toHaveBeenCalledTimes(2);
      expect(foldNavigations({ view: 'inbox', tab: 'untriaged' })).toEqual({
        view: 'inbox',
        q: '로그인',
        tab: 'high',
      });

      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      expect(navigateMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('commits a newer draft while the first commit is pending without dropping the tab', () => {
    vi.useFakeTimers();
    try {
      searchState = { view: 'inbox', tab: 'untriaged' };
      render(<InboxTestHarness view="inbox" />);
      const box = searchBox();
      fireEvent.change(box, { target: { value: '로그인' } });
      fireEvent.keyDown(box, { key: 'Enter' });
      fireEvent.mouseDown(screen.getByRole('tab', { name: '높음' }));
      fireEvent.change(box, { target: { value: '로그인 오류' } });
      fireEvent.blur(box);

      expect(navigateMock).toHaveBeenCalledTimes(3);
      expect(foldNavigations({ view: 'inbox', tab: 'untriaged' })).toEqual({
        view: 'inbox',
        q: '로그인 오류',
        tab: 'high',
      });

      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      expect(navigateMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Hangul debounce (#875) ──────────────────────────────────────────────────
  //
  // A draft ending in a Hangul character may still be a half-typed syllable
  // (로그이, heading for 로그인), so the URL waits for the longer debounce.
  // No composition events are involved: native macOS Korean input does not
  // always send them.

  it('does not navigate mid-syllable and commits after the Hangul debounce', () => {
    vi.useFakeTimers();
    try {
      searchState = { view: 'inbox' };
      render(<InboxTestHarness view="inbox" />);
      const box = searchBox();

      fireEvent.change(box, { target: { value: '로그이' } });
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      expect(navigateMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(SEARCH_HANGUL_DEBOUNCE_MS - SEARCH_DEBOUNCE_MS - 1);
      expect(navigateMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);

      expect(navigateMock).toHaveBeenCalledTimes(1);
      const navigation = lastNavigateSearch();
      expect(navigation.to).toBe('/vocs');
      expect(navigation.replace).toBe(true);
      expect(navigation.search(searchState)).toEqual({ view: 'inbox', q: '로그이' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows skeletons instead of the previous empty page while placeholder data is in flight', () => {
    useVocListMock.mockReturnValue({
      data: { items: [], next_cursor: undefined },
      isLoading: false,
      isPlaceholderData: true,
      error: null,
      refetch: vi.fn(),
    });
    searchState = { view: 'inbox', q: '다음' };
    render(<InboxTestHarness view="inbox" />);

    expect(screen.queryByText('검색 결과가 없습니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('rowgroup', { name: 'VOC 목록 로딩 중' })).toBeInTheDocument();
  });

  it('keeps previous rows mounted while the next page is placeholder data', () => {
    useVocListMock.mockReturnValue({
      data: { items: MOCK_VOC_ITEMS, next_cursor: undefined },
      isLoading: false,
      isPlaceholderData: true,
      error: null,
      refetch: vi.fn(),
    });
    searchState = { view: 'inbox', q: '다음' };
    render(<InboxTestHarness view="inbox" />);

    expect(screen.getByText('피드백 1')).toBeInTheDocument();
    expect(screen.queryByText('검색 결과가 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('rowgroup', { name: 'VOC 목록 로딩 중' })).not.toBeInTheDocument();
  });
});

function foldNavigations(initial: Record<string, unknown>): Record<string, unknown> {
  let state = initial;
  for (const [call] of navigateMock.mock.calls) {
    const navigation = call as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    state = navigation.search(state);
  }
  return state;
}
