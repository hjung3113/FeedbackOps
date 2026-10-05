import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ApiError } from '@/lib/api/types';
import {
  listPermissionDeniesResponseSchema,
  listPermissionGrantsResponseSchema,
  permissionDenyAdminItemSchema,
  permissionGrantAdminItemSchema,
  revokePermissionBodySchema,
  revokePermissionResultSchema,
} from '@fops/shared';

const apiRequestMock = vi.hoisted(() => vi.fn());
const fetchManagedSystemsMock = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('@fops/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fops/ui')>();
  return {
    ...actual,
    ListShell: ({
      toolbar,
      tabs,
      list,
      detailPanel,
    }: {
      toolbar?: { title?: string; subtitle?: string };
      tabs?: React.ReactNode;
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div data-shell="list">
        <header>
          <h2>{toolbar?.title}</h2>
          <span>{toolbar?.subtitle}</span>
        </header>
        {tabs}
        {list}
        {detailPanel}
      </div>
    ),
  };
});
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiRequest: apiRequestMock,
}));
vi.mock('@/lib/api/managed-systems', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/managed-systems')>()),
  fetchManagedSystems: fetchManagedSystemsMock,
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({
    actors: [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_name: 'Actor One' },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', display_name: 'Actor Two' },
      { id: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_name: 'Admin One' },
    ],
  }),
}));

import { PermissionGrantsScreen } from './permission-grants-screen';
import { permissionGrantsSearchSchema } from './permission-grants-search';

const GRANT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_GRANT_ID = '22222222-2222-4222-8222-222222222222';
const DENY_ID = '33333333-3333-4333-8333-333333333333';
const MANAGED_SYSTEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const GRANTS = [
  permissionGrantAdminItemSchema.parse({
    id: GRANT_ID,
    actor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    capability: 'voc.triage',
    managed_system_id: MANAGED_SYSTEM_ID,
    granted_by_actor_id: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    granted_at: '2026-07-17T00:00:00.000Z',
    expires_at: '2026-12-31T23:59:59.000Z',
  }),
  permissionGrantAdminItemSchema.parse({
    id: SECOND_GRANT_ID,
    actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    capability: 'workspace.admin',
    managed_system_id: null,
    granted_by_actor_id: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    granted_at: '2026-07-16T00:00:00.000Z',
    expires_at: null,
  }),
];

const DENIES = [
  permissionDenyAdminItemSchema.parse({
    id: DENY_ID,
    actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    capability: 'finding.manage',
    managed_system_id: null,
    reason: '승인되지 않은 외부 공유를 차단합니다.',
    created_by_actor_id: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    created_at: '2026-07-15T00:00:00.000Z',
  }),
];

interface CapturedApiRequest {
  method: string;
  path: string;
  body: unknown;
  idempotencyKey: string | undefined;
}

function installApi(
  options: {
    deferLists?: boolean;
    listError?: 'grants' | 'denies';
    revokeStatus?: number;
  } = {},
) {
  const grants = [...GRANTS];
  const denies = [...DENIES];
  const requests: CapturedApiRequest[] = [];
  let resolveGrants: (() => void) | undefined;
  let resolveDenies: (() => void) | undefined;
  const grantWaiter = new Promise<void>((resolve) => {
    resolveGrants = resolve;
  });
  const denyWaiter = new Promise<void>((resolve) => {
    resolveDenies = resolve;
  });

  fetchManagedSystemsMock.mockResolvedValue({
    items: [{ id: MANAGED_SYSTEM_ID, name: 'Payments' }],
  });
  apiRequestMock.mockReset();
  apiRequestMock.mockImplementation(
    async (
      method: string,
      path: string,
      parser: { parse: (value: unknown) => unknown },
      requestOptions?: { body?: unknown; idempotencyKey?: string },
    ) => {
      requests.push({
        method,
        path,
        body: requestOptions?.body,
        idempotencyKey: requestOptions?.idempotencyKey,
      });

      if (method === 'GET' && path === '/permissions/grants') {
        if (options.listError === 'grants') {
          throw new Error('grant list unavailable');
        }
        if (options.deferLists) await grantWaiter;
        return {
          data: parser.parse(listPermissionGrantsResponseSchema.parse({ items: grants })),
        };
      }
      if (method === 'GET' && path === '/permissions/denies') {
        if (options.listError === 'denies') {
          throw new Error('deny list unavailable');
        }
        if (options.deferLists) await denyWaiter;
        return {
          data: parser.parse(listPermissionDeniesResponseSchema.parse({ items: denies })),
        };
      }

      const revokeMatch = path.match(/^\/permissions\/(grants|denies)\/([^/]+)\/revoke$/);
      if (method === 'POST' && revokeMatch) {
        const [, kind, id] = revokeMatch;
        const body = revokePermissionBodySchema.parse(requestOptions?.body);
        if (options.revokeStatus === 409) {
          throw new ApiError(409, {
            code: 'conflict.permission_not_active',
            message: 'permission is not active',
          });
        }
        if (kind === 'grants') {
          const index = grants.findIndex((grant) => grant.id === id);
          if (index >= 0) grants.splice(index, 1);
        } else {
          const index = denies.findIndex((deny) => deny.id === id);
          if (index >= 0) denies.splice(index, 1);
        }
        return {
          data: parser.parse(
            revokePermissionResultSchema.parse({
              id,
              revoked_at: '2026-07-18T00:00:00.000Z',
            }),
          ),
          body,
        };
      }

      throw new Error(`Unexpected API request ${method} ${path}`);
    },
  );

  return {
    requests,
    releaseLists() {
      resolveGrants?.();
      resolveDenies?.();
    },
  };
}

function renderScreen(initialPath = '/admin/permissions/grants') {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/permissions/grants',
    validateSearch: (raw) => permissionGrantsSearchSchema.parse(raw),
    component: PermissionGrantsScreen,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

describe('/admin/permissions/grants screen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  test.each([
    {
      tab: 'grants',
      path: '/admin/permissions/grants',
      row: 'Actor One · VOC Triage',
      scope: 'Payments',
      detailField: '부여자',
    },
    {
      tab: 'denies',
      path: `/admin/permissions/grants?tab=denies&selected=${DENY_ID}`,
      row: 'Actor Two · Finding 관리',
      scope: '워크스페이스 전체',
      detailField: '차단 사유',
    },
  ])(
    'renders schema-parsed $tab rows and detail fields',
    async ({ tab, path, row, scope, detailField }) => {
      installApi();
      renderScreen(path);

      const list = await screen.findByTestId('permission-grants-list');
      expect(within(list).getByRole('button', { name: new RegExp(row) })).toBeInTheDocument();
      expect(within(list).getByText(scope, { exact: true })).toBeInTheDocument();
      expect(screen.getByTestId('permission-grants-detail-panel')).toHaveTextContent(detailField);
      expect(screen.getByRole('tab', { name: tab === 'grants' ? /권한/ : /차단/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    },
  );

  test('keeps counts unknown while loading and shows them after both lists succeed', async () => {
    const api = installApi({ deferLists: true });
    renderScreen();

    const grantsTab = await screen.findByRole('tab', { name: '권한' });
    const deniesTab = screen.getByRole('tab', { name: '차단' });
    expect(grantsTab).not.toHaveTextContent('0');
    expect(deniesTab).not.toHaveTextContent('0');

    api.releaseLists();
    await screen.findByRole('tab', { name: /권한 2/ });
    expect(screen.getByRole('tab', { name: /차단 1/ })).toBeInTheDocument();
  });

  test('keeps the failed list count unknown', async () => {
    installApi({ listError: 'grants' });
    renderScreen();

    await screen.findByText('권한을 불러오지 못했습니다.');
    expect(screen.getByRole('tab', { name: '권한' })).not.toHaveTextContent('0');
    expect(screen.getByRole('tab', { name: /차단 1/ })).toBeInTheDocument();
  });

  test('selecting a row writes selected to the URL', async () => {
    installApi();
    const { router } = renderScreen();

    const list = await screen.findByTestId('permission-grants-list');
    fireEvent.click(
      within(list).getByRole('button', { name: /Actor Two · 워크스페이스 관리자 권한/ }),
    );

    await waitFor(() =>
      expect(router.state.location.search).toEqual({ selected: SECOND_GRANT_ID }),
    );
  });

  test.each([
    { kind: 'grants', id: GRANT_ID, action: '권한 취소' },
    { kind: 'denies', id: DENY_ID, action: '차단 해제' },
  ] as const)(
    '$action requires a reason and posts a validated idempotent command',
    async ({ kind, id, action }) => {
      const api = installApi();
      const path =
        kind === 'denies'
          ? `/admin/permissions/grants?tab=denies&selected=${id}`
          : `/admin/permissions/grants?selected=${id}`;
      const { router } = renderScreen(path);

      const detail = await screen.findByTestId('permission-grants-detail-panel');
      const submit = within(detail).getByRole('button', { name: action });
      expect(submit).toBeDisabled();
      fireEvent.change(within(detail).getByLabelText('사유 · 필수'), {
        target: { value: '  승인 범위가 변경되었습니다.  ' },
      });
      expect(submit).toBeEnabled();
      fireEvent.click(submit);

      await waitFor(() =>
        expect(
          api.requests.some(
            (request) =>
              request.method === 'POST' && request.path === `/permissions/${kind}/${id}/revoke`,
          ),
        ).toBe(true),
      );
      const post = api.requests.find((request) => request.method === 'POST');
      expect(revokePermissionBodySchema.parse(post?.body)).toEqual({
        reason: '승인 범위가 변경되었습니다.',
      });
      expect(post?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
      await waitFor(() => expect(router.state.location.search).not.toHaveProperty('selected'));
      await waitFor(() => {
        expect(
          api.requests.filter(
            (request) => request.method === 'GET' && request.path === '/permissions/grants',
          ).length,
        ).toBeGreaterThan(1);
        expect(
          api.requests.filter(
            (request) => request.method === 'GET' && request.path === '/permissions/denies',
          ).length,
        ).toBeGreaterThan(1);
      });
      expect(toast.success).toHaveBeenCalledWith(
        kind === 'grants' ? '권한을 취소했습니다.' : '차단을 해제했습니다.',
      );
    },
  );

  test('maps a non-active conflict to the shared error toast', async () => {
    installApi({ revokeStatus: 409 });
    renderScreen();

    const detail = await screen.findByTestId('permission-grants-detail-panel');
    fireEvent.change(within(detail).getByLabelText('사유 · 필수'), {
      target: { value: '정책 변경' },
    });
    fireEvent.click(within(detail).getByRole('button', { name: '권한 취소' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        '이미 처리되었거나 만료되어 더 이상 활성 상태가 아닙니다.',
      ),
    );
  });
});
