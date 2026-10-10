import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
let searchState: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => searchState,
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@/lib/api/nav', () => ({
  fetchNavCounts: vi.fn(),
}));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [], isSuccess: true, isLoading: false, error: null }),
}));

vi.mock('@/lib/auth/useMe', () => ({ useMe: vi.fn() }));

vi.mock('@/lib/cross-system/usePermissionCheck', () => ({
  usePermissionCheck: vi.fn(),
  permissionCheckQueryKey: () => ['permission-check', 'voc.triage', null],
  permissionRequestsMineKey: ['permission-requests-mine'],
}));

import { fetchNavCounts } from '@/lib/api/nav';
import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { TriageRoute } from '../TriageRoute';

const ADMIN_ME = {
  data: {
    actor: {
      id: 'admin-uuid-1',
      external_id: 'admin-1',
      email: 'admin@test.local',
      display_name: '관리자',
      role_level: 'admin',
    },
    workspace_id: 'ws-1',
  },
  isLoading: false,
  isError: false,
  isPending: false,
  isSuccess: true,
  error: null,
  status: 'success' as const,
  fetchStatus: 'idle' as const,
};

const QUEUED_VOC = {
  id: '00000000-0000-0000-0000-0000000000aa',
  display_id: 'VOC-101',
  title: 'Queued VOC',
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
};

describe('TriageRoute — optimistic exclusion lifetime (#937)', () => {
  beforeEach(() => {
    searchState = { view: 'triage', tab: 'untriaged' };
    navigateMock.mockReset();
    vi.mocked(fetchNavCounts).mockResolvedValue({ counts: { 'voc.triage': 1 } });
    vi.mocked(useMe).mockReturnValue(ADMIN_ME as unknown as ReturnType<typeof useMe>);
    vi.mocked(usePermissionCheck).mockReturnValue({
      isPending: false,
      isError: false,
      data: { state: 'approved', decision: { allow: true, via: 'role' } },
    } as unknown as ReturnType<typeof usePermissionCheck>);
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([false, true])(
    'shows a successfully postponed VOC in waiting (cached=%s) and retains tab focus',
    async (cached) => {
      let resolveWaiting!: (response: Response) => void;
      const waiting = new Promise<Response>((resolve) => {
        resolveWaiting = resolve;
      });
      let postponed = false;
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
        });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input), 'http://localhost');
          if (init?.method === 'PATCH') {
            expect(JSON.parse(String(init.body))).toEqual({ postpone_review: true });
            postponed = true;
            return json({ updated_at: '2026-01-02T00:00:00.000Z' });
          }
          if (url.pathname.endsWith('/vocs')) {
            if (url.searchParams.get('tab') === 'waiting') return waiting;
            return json({ items: [QUEUED_VOC] });
          }
          return json({ items: [], actors: [], available: false, reason: 'provider_disabled' });
        }),
      );
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      if (cached) {
        qc.setQueryData(
          [
            'vocs',
            'triage',
            undefined,
            'waiting',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
          ],
          { items: [QUEUED_VOC] },
        );
      }
      const node = () => (
        <QueryClientProvider client={qc}>
          <TriageRoute />
        </QueryClientProvider>
      );
      const view = render(node());
      await screen.findByRole('button', { name: /VOC-101/ });
      vi.mocked(fetchNavCounts).mockResolvedValue({
        counts: { 'voc.triage': 1, 'voc.tab.waiting': 1 },
      });
      fireEvent.click(screen.getByRole('button', { name: '보류' }));
      await waitFor(() => expect(postponed).toBe(true));
      // Nav counts are invalidated only after the forward PATCH succeeds.
      await screen.findByRole('tab', { name: /^보류\s*,\s*1$/ });
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /VOC-101/ })).not.toBeInTheDocument(),
      );

      const toolbar = screen.getByTestId('triage-toolbar');
      const waitingTab = screen.getByRole('tab', { name: /보류/ });
      waitingTab.focus();
      await waitFor(() => expect(navigateMock).toHaveBeenCalled());
      searchState = { view: 'triage', tab: 'waiting' };
      view.rerender(node());
      if (!cached) {
        expect(within(screen.getByRole('tabpanel')).getByRole('status')).toHaveTextContent(
          '불러오는 중…',
        );
      }
      expect(waitingTab).toHaveFocus();
      await act(async () => {
        resolveWaiting(json({ items: [QUEUED_VOC] }));
      });

      // #994: the first fresh response remounts the cached list boundary, so re-query.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /VOC-101/ })).toBeInTheDocument(),
      );
      expect(screen.getByRole('heading', { name: 'Queued VOC' })).toBeInTheDocument();
      expect(waitingTab).toHaveFocus();
      expect(screen.getByTestId('triage-toolbar')).toBe(toolbar);
      qc.clear();
    },
  );
});
