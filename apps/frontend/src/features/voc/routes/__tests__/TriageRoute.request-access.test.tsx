import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TriageRoute } from '../TriageRoute';

let search: Record<string, string> = {};
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search,
  useNavigate: () => vi.fn(),
}));
vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ isLoading: false }) }));
vi.mock('@/lib/cross-system/usePermissionCheck', () => ({
  usePermissionCheck: vi.fn(),
  permissionCheckQueryKey: () => ['permission-check'],
  permissionRequestsMineKey: ['permission-requests-mine'],
}));

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const clients: QueryClient[] = [];
function mount(state: string, queueDenied = false) {
  vi.mocked(usePermissionCheck).mockReturnValue({
    isPending: false,
    data: { state, decision: { allow: state === 'approved' } },
  } as unknown as ReturnType<typeof usePermissionCheck>);
  const requests: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      let body: unknown = { counts: {} };
      let status = 200;
      if (path === '/me/permissions/scope') {
        body = { scope: { kind: 'scoped', managed_system_ids: [] } };
      } else if (path === '/vocs' && queueDenied) {
        status = 403;
        body = {
          code: 'permission.denied',
          message: 'denied',
          requestable_permission: {
            permission: 'voc.read',
            managed_system_id: B,
            reason_required: true,
          },
        };
      } else if (path === '/permission-requests' && init?.method === 'POST') {
        requests.push(JSON.parse(String(init.body)));
        // The request payload is the observed seam; keep the dialog open after submission.
        status = 400;
        body = { code: 'validation.failed', message: 'test response' };
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <TriageRoute />
    </QueryClientProvider>,
  );
  return requests;
}
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
  search = {};
});

describe('Triage request access', () => {
  it.each([
    ['default', undefined, 'request_access', false, 'voc.triage', undefined],
    ['selected System', A, 'request_access', false, 'voc.triage', A],
    ['queue envelope', A, 'approved', true, 'voc.read', B],
  ] as const)(
    'submits the correct request for %s',
    async (_label, managedSystem, state, queueDenied, capability, requestedSystem) => {
      search = managedSystem ? { managedSystem } : {};
      const requests = mount(state, queueDenied);
      fireEvent.click(
        await screen.findByRole('button', { name: '권한 요청하기' }, { timeout: 5000 }),
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByTestId('permission-request-reason'), {
        target: { value: 'Triage 업무에 필요합니다.' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: '요청 제출' }));
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0]).toEqual({
        requested_capability: capability,
        ...(requestedSystem ? { requested_managed_system_id: requestedSystem } : {}),
        reason: 'Triage 업무에 필요합니다.',
        return_route_intent: '/vocs?view=triage',
      });
      if (managedSystem) {
        expect(
          screen.getByText('선택한 Managed System의 VOC Triage 권한이 없습니다.'),
        ).toBeInTheDocument();
      }
    },
  );

  it.each(['pending', 'denied', 'blocked_not_requestable'])(
    'keeps %s without a request trigger',
    async (state) => {
      search = { managedSystem: A };
      mount(state);
      expect(await screen.findByRole('heading', { name: 'Triage' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '권한 요청하기' })).not.toBeInTheDocument();
    },
  );
});
