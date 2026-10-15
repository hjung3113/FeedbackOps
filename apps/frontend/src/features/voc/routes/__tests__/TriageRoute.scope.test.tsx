import { listVocsQuerySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { Toaster, toast } from 'sonner';
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
  primary_managed_system_id: '00000000-0000-4000-8000-000000000001',
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mountRoute(qc: QueryClient) {
  const node = () => (
    <QueryClientProvider client={qc}>
      <TriageRoute />
      <Toaster />
    </QueryClientProvider>
  );
  const view = render(node());
  return (next: Record<string, unknown>) => {
    searchState = { view: 'triage', ...next };
    view.rerender(node());
  };
}

const A = QUEUED_VOC.primary_managed_system_id;
const clients: QueryClient[] = [];
function client() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(qc);
  return qc;
}
function permission(state: 'approved' | 'request_access') {
  vi.mocked(usePermissionCheck).mockReturnValue({
    isPending: false,
    isError: false,
    data: { state, decision: { allow: state === 'approved' } },
  } as unknown as ReturnType<typeof usePermissionCheck>);
}
function server(scopeIds = [A]) {
  let failure: 'permission.denied' | 'permission.scope_required' | undefined;
  const listQueries: ReturnType<typeof listVocsQuerySchema.parse>[] = [];
  const scopeQueries: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/me/permissions/scope') {
        expect(url.searchParams.get('capability')).toBe('voc.triage');
        scopeQueries.push(url);
        return json({ scope: { kind: 'scoped', managed_system_ids: scopeIds } });
      }
      if (url.pathname === '/vocs') {
        listQueries.push(listVocsQuerySchema.parse(Object.fromEntries(url.searchParams)));
        if (failure) return json({ code: failure, message: 'denied' }, 403);
        return json({ items: [QUEUED_VOC] });
      }
      return json({ items: [], actors: [], available: false, reason: 'provider_disabled' });
    }),
  );
  return {
    listQueries,
    scopeQueries,
    fail: (code: typeof failure) => {
      failure = code;
    },
  };
}

beforeEach(() => {
  searchState = { view: 'triage', tab: 'untriaged' };
  navigateMock.mockReset();
  vi.mocked(fetchNavCounts)
    .mockReset()
    .mockResolvedValue({ counts: { 'voc.triage': 1 } });
  vi.mocked(useMe).mockReturnValue({
    ...ADMIN_ME,
    data: { ...ADMIN_ME.data, actor: { ...ADMIN_ME.data.actor, role_level: 'developer' } },
  } as unknown as ReturnType<typeof useMe>);
  permission('request_access');
});
afterEach(() => {
  for (const qc of clients.splice(0)) qc.clear();
  toast.dismiss();
  vi.unstubAllGlobals();
});

describe('TriageRoute effective scoped eligibility (#1170a)', () => {
  it('opens default-scope Developer queue without an MS filter and enables counts', async () => {
    const api = server();
    mountRoute(client());
    expect(await screen.findByRole('button', { name: /VOC-101/ })).toBeInTheDocument();
    expect(api.listQueries.length).toBeGreaterThan(0);
    expect(api.listQueries[0]).toMatchObject({ view: 'triage' });
    expect(api.listQueries[0]?.managed_system_id).toBeUndefined();
    await waitFor(() => expect(fetchNavCounts).toHaveBeenCalled());
  });

  it('blocks an empty effective scope without fetching the queue or counts', async () => {
    const api = server([]);
    mountRoute(client());
    await waitFor(() => expect(api.scopeQueries).toHaveLength(1));
    expect(
      await screen.findByText('이 항목에 접근하려면 권한 요청이 필요합니다.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /VOC-101/ })).toBeNull();
    expect(api.listQueries).toHaveLength(0);
    expect(fetchNavCounts).not.toHaveBeenCalled();
  });

  it('keeps the selected Managed System point-check gate', async () => {
    searchState = { ...searchState, managedSystem: A };
    const api = server();
    mountRoute(client());
    expect(
      await screen.findByText('이 항목에 접근하려면 권한 요청이 필요합니다.'),
    ).toBeInTheDocument();
    expect(api.scopeQueries).toHaveLength(0);
    expect(api.listQueries).toHaveLength(0);
    expect(fetchNavCounts).not.toHaveBeenCalled();
  });

  it.each([
    ['permission.denied', 'cold'],
    ['permission.scope_required', 'cold'],
    ['permission.denied', 'cached'],
    ['permission.scope_required', 'cached'],
  ] as const)(
    '%s on a %s queue replaces rows and detail with request-access',
    async (code, mode) => {
      permission('approved');
      const api = server();
      const qc = client();
      searchState = { ...searchState, selected: QUEUED_VOC.id };
      if (mode === 'cold') api.fail(code);
      mountRoute(qc);
      if (mode === 'cached') {
        expect(await screen.findByRole('button', { name: /VOC-101/ })).toBeInTheDocument();
        expect(await screen.findByRole('heading', { name: 'Queued VOC' })).toBeInTheDocument();
        api.fail(code);
        await act(async () => {
          await qc.invalidateQueries({ queryKey: ['vocs', 'triage'] });
        });
      }
      expect(
        await screen.findByText(
          '이 항목에 접근하려면 권한 요청이 필요합니다.',
          {},
          { timeout: 5000 },
        ),
      ).toBeInTheDocument();
      await waitFor(() => expect(qc.isFetching()).toBe(0));
      expect(screen.queryByRole('button', { name: /VOC-101/ })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Queued VOC' })).toBeNull();
      expect(screen.queryByText('불러오기 실패')).toBeNull();
      expect(screen.queryByRole('tabpanel')).toBeNull();
    },
    10_000,
  );
});
