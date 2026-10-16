import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInboxRoute } from '../InboxRoute';
import { validateVocSearch } from '../voc-search';

const AREA = '11111111-1111-4111-8111-111111111111';
const MS = '22222222-2222-4222-8222-222222222222';
const VOC = '33333333-3333-4333-8333-333333333333';
vi.mock('../../hooks/useVocListPages', () => ({
  useVocListPages: () => ({
    data: { pages: [{ items: [], page: { has_more: false } }], pageParams: [undefined] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
  }),
}));
vi.mock('../../components/list/VocList', () => ({
  VocList: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button type="button" onClick={() => onSelect(VOC)}>
      VOC 선택
    </button>
  ),
}));
vi.mock('../../components/detail/VocDetailPanel', () => ({
  VocDetailPanel: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      상세 닫기
    </button>
  ),
}));
function Inbox() {
  const { list, detailPanel } = useInboxRoute('inbox');
  return (
    <>
      {list}
      {detailPanel}
    </>
  );
}
afterEach(() => vi.unstubAllGlobals());
describe('VOC Area filter history', () => {
  it.each([false, true])(
    'preserves the resolved Area across selection, panel close, reset and history (archived=%s)',
    async (archived) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                items: [{ id: AREA, name: '결제', archived_at: archived ? '2026-01-01' : null }],
                total: 1,
              }),
            ),
        ),
      );
      const root = createRootRoute({ component: Outlet });
      const route = createRoute({
        getParentRoute: () => root,
        path: '/vocs',
        validateSearch: validateVocSearch,
        component: Inbox,
      });
      const router = createRouter({
        routeTree: root.addChildren([route]),
        history: createMemoryHistory({
          initialEntries: [
            `/vocs?view=inbox&managedSystem=${MS}&tab=no-task&filter.analytics_area=${AREA}`,
          ],
        }),
      });
      render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
      const label = `Analytics Area: 결제${archived ? ' (보관됨)' : ''}`;
      expect(await screen.findByRole('button', { name: `${label} 필터 제거` })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'VOC 선택' }));
      await waitFor(() => expect(router.state.location.search.selected).toBe(VOC));
      expect(router.state.location.search['filter.analytics_area']).toBe(AREA);
      fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
      await waitFor(() => expect(router.state.location.search.selected).toBeUndefined());
      expect(router.state.location.search['filter.analytics_area']).toBe(AREA);
      fireEvent.click(screen.getByRole('button', { name: `${label} 필터 제거` }));
      await waitFor(() =>
        expect(router.state.location.search['filter.analytics_area']).toBeUndefined(),
      );
      expect(router.state.location.search).toEqual({
        view: 'inbox',
        managedSystem: MS,
        tab: 'no-task',
      });
      await act(async () => router.history.back());
      expect(await screen.findByRole('button', { name: `${label} 필터 제거` })).toBeInTheDocument();
      await act(async () => router.history.forward());
      await waitFor(() =>
        expect(router.state.location.search['filter.analytics_area']).toBeUndefined(),
      );
      await act(async () => router.history.back());
      fireEvent.click(await screen.findByRole('button', { name: '필터 초기화' }));
      await waitFor(() =>
        expect(router.state.location.search).toEqual({
          view: 'inbox',
          managedSystem: MS,
          tab: 'no-task',
        }),
      );
    },
  );
});
