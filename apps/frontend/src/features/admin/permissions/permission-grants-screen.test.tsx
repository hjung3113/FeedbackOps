import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ApiError } from '@/lib/api/types';
import {
  directPermissionGrantSchema,
  listPermissionDeniesResponseSchema,
  listPermissionGrantsResponseSchema,
  permissionDenyAdminItemSchema,
  permissionGrantAdminItemSchema,
  permissionGrantOptionsSchema,
  revokePermissionBodySchema,
  revokePermissionResultSchema,
} from '@fops/shared';

const apiRequestMock = vi.hoisted(() => vi.fn());
const fetchManagedSystemsMock = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const useMeMock = vi.hoisted(() => vi.fn());
const useWorkspaceSettingsMock = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/auth/useMe', () => ({ useMe: useMeMock }));
vi.mock('../settings/use-workspace-settings.js', () => ({
  useWorkspaceSettings: useWorkspaceSettingsMock,
}));
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
      toolbar?: { title?: string; subtitle?: string; actions?: React.ReactNode };
      tabs?: React.ReactNode;
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div data-shell="list">
        <header>
          <h2>{toolbar?.title}</h2>
          <span>{toolbar?.subtitle}</span>
          {toolbar?.actions}
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
    isPending: false,
    isError: false,
    actors: [
      { id: RECIPIENT_ID, display_name: 'Actor One' },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', display_name: 'Actor Two' },
      { id: SELF_ACTOR_ID, display_name: 'Admin One' },
    ],
  }),
}));

import { PermissionGrantsScreen } from './permission-grants-screen';
import { permissionGrantsSearchSchema } from './permission-grants-search';

const GRANT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_GRANT_ID = '22222222-2222-4222-8222-222222222222';
const DENY_ID = '33333333-3333-4333-8333-333333333333';
const MANAGED_SYSTEM_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RECIPIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SELF_ACTOR_ID = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CREATED_GRANT_ID = '44444444-4444-4444-8444-444444444444';
const SECOND_CREATED_GRANT_ID = '55555555-5555-4555-8555-555555555555';
const THIRD_CREATED_GRANT_ID = '88888888-8888-4888-8888-888888888888';
const FOURTH_CREATED_GRANT_ID = '99999999-9999-4999-8999-999999999999';
const REVIEW_REQUEST_ID = '66666666-6666-4666-8666-666666666666';
const SECOND_DENY_ID = '77777777-7777-4777-8777-777777777777';

const DEFAULT_GRANT_CANDIDATE = {
  capability: 'finding.manage',
  managed_system_id: MANAGED_SYSTEM_ID,
  governance_required: false,
  preflight: { state: 'available' },
} as const;

function grantOptionsFor(
  actorId: string,
  overrides: {
    selfPolicy?: 'allowed' | 'forbidden';
    selfApprovalRequired?: boolean;
    candidates?: unknown[];
  } = {},
) {
  const actorName =
    actorId === RECIPIENT_ID ? 'Actor One' : actorId === SELF_ACTOR_ID ? 'Admin One' : 'Actor Two';
  return permissionGrantOptionsSchema.parse({
    recipient: {
      id: actorId,
      display_name: actorName,
      role_level: actorId === SELF_ACTOR_ID ? 'admin' : 'user',
    },
    self_policy: overrides.selfPolicy ?? 'allowed',
    self_approval_required: overrides.selfApprovalRequired ?? actorId === SELF_ACTOR_ID,
    candidates: overrides.candidates ?? [
      DEFAULT_GRANT_CANDIDATE,
      {
        capability: 'workspace.admin',
        managed_system_id: null,
        governance_required: true,
        preflight: { state: 'available' },
      },
    ],
  });
}

type DirectGrantFailure = {
  status: 409 | 500;
  code:
    | 'conflict.permission_request_duplicate'
    | 'conflict.capability_already_denied'
    | 'internal.unexpected';
  message?: string;
  detail?: Record<string, unknown>;
};

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

const EXPIRED_MATCHING_GRANT = permissionGrantAdminItemSchema.parse({
  id: '99999999-7777-4777-8777-999999999999',
  actor_id: RECIPIENT_ID,
  capability: 'finding.manage',
  managed_system_id: MANAGED_SYSTEM_ID,
  granted_by_actor_id: SELF_ACTOR_ID,
  granted_at: '2026-01-15T00:00:00.000Z',
  expires_at: '2026-07-31T23:59:59.000Z',
});

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
    deferRevoke?: boolean;
    deferGrantRefetch?: boolean;
    deferDirectGrant?: boolean;
    deferGrantOptionsFor?: string[];
    listError?: 'grants' | 'denies';
    keepRevokedItem?: boolean;
    initialGrants?: typeof GRANTS;
    grantOptionsByActor?: Record<string, ReturnType<typeof grantOptionsFor>>;
    directGrantErrors?: Array<DirectGrantFailure | null>;
    revokeError?: {
      status: 404 | 409;
      code: 'conflict.permission_not_active' | 'not_found.record';
    };
  } = {},
) {
  const grants = [...(options.initialGrants ?? GRANTS)];
  const denies = [...DENIES];
  const requests: CapturedApiRequest[] = [];
  let grantListCalls = 0;
  let directGrantCalls = 0;
  let resolveGrants: (() => void) | undefined;
  let resolveDenies: (() => void) | undefined;
  const grantWaiter = new Promise<void>((resolve) => {
    resolveGrants = resolve;
  });
  const denyWaiter = new Promise<void>((resolve) => {
    resolveDenies = resolve;
  });
  let resolveRevoke: (() => void) | undefined;
  const revokeWaiter = new Promise<void>((resolve) => {
    resolveRevoke = resolve;
  });
  let resolveGrantRefetch: (() => void) | undefined;
  const grantRefetchWaiter = new Promise<void>((resolve) => {
    resolveGrantRefetch = resolve;
  });
  let resolveDirectGrant: (() => void) | undefined;
  const directGrantWaiter = new Promise<void>((resolve) => {
    resolveDirectGrant = resolve;
  });
  let resolveGrantOptions: (() => void) | undefined;
  const grantOptionsWaiter = new Promise<void>((resolve) => {
    resolveGrantOptions = resolve;
  });

  fetchManagedSystemsMock.mockResolvedValue({
    items: [{ id: MANAGED_SYSTEM_ID, name: 'Payments' }],
  });
  useMeMock.mockReturnValue({ data: { actor: { id: SELF_ACTOR_ID } } });
  useWorkspaceSettingsMock.mockReturnValue({ data: undefined });
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
        grantListCalls += 1;
        if (options.listError === 'grants') {
          throw new Error('grant list unavailable');
        }
        const snapshot =
          options.deferGrantRefetch && grantListCalls > 1
            ? [...(options.initialGrants ?? GRANTS)]
            : [...grants];
        if (options.deferLists) await grantWaiter;
        if (options.deferGrantRefetch && grantListCalls > 1) await grantRefetchWaiter;
        return {
          data: parser.parse(listPermissionGrantsResponseSchema.parse({ items: snapshot })),
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

      if (method === 'GET' && path.startsWith('/permissions/grant-options?')) {
        const actorId = new URLSearchParams(path.slice(path.indexOf('?') + 1)).get('actor_id');
        if (!actorId) throw new Error('Grant options request did not include actor_id');
        if (options.deferGrantOptionsFor?.includes(actorId)) await grantOptionsWaiter;
        const grantOptions = options.grantOptionsByActor?.[actorId] ?? grantOptionsFor(actorId);
        return { data: parser.parse(permissionGrantOptionsSchema.parse(grantOptions)) };
      }

      const revokeMatch = path.match(/^\/permissions\/(grants|denies)\/([^/]+)\/revoke$/);
      if (method === 'POST' && revokeMatch) {
        const [, kind, id] = revokeMatch;
        const body = revokePermissionBodySchema.parse(requestOptions?.body);
        if (options.revokeError) {
          throw new ApiError(options.revokeError.status, {
            code: options.revokeError.code,
            message: 'permission is not active',
          });
        }
        if (options.deferRevoke) await revokeWaiter;
        if (!options.keepRevokedItem) {
          if (kind === 'grants') {
            const index = grants.findIndex((grant) => grant.id === id);
            if (index >= 0) grants.splice(index, 1);
          } else {
            const index = denies.findIndex((deny) => deny.id === id);
            if (index >= 0) denies.splice(index, 1);
          }
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

      if (method === 'POST' && path === '/permissions/grants') {
        const body = directPermissionGrantSchema.parse(requestOptions?.body);
        const callIndex = directGrantCalls;
        directGrantCalls += 1;
        if (options.deferDirectGrant && callIndex === 0) await directGrantWaiter;
        const failure = options.directGrantErrors?.[callIndex];
        if (failure) {
          throw new ApiError(failure.status, {
            code: failure.code,
            message: failure.message ?? 'direct grant failed',
            ...(failure.detail ? { detail: failure.detail } : {}),
          });
        }
        const item = permissionGrantAdminItemSchema.parse({
          id: [
            CREATED_GRANT_ID,
            SECOND_CREATED_GRANT_ID,
            THIRD_CREATED_GRANT_ID,
            FOURTH_CREATED_GRANT_ID,
          ][callIndex],
          actor_id: body.actor_id,
          capability: body.capability,
          managed_system_id: body.managed_system_id ?? null,
          granted_by_actor_id: SELF_ACTOR_ID,
          granted_at: '2026-07-18T00:00:00.000Z',
          expires_at: body.expires_at ?? null,
        });
        grants.unshift(item);
        return { data: parser.parse(item) };
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
    releaseRevoke() {
      resolveRevoke?.();
    },
    releaseGrantRefetch() {
      resolveGrantRefetch?.();
    },
    releaseDirectGrant() {
      resolveDirectGrant?.();
    },
    releaseGrantOptions() {
      resolveGrantOptions?.();
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
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, unmount: view.unmount };
}

async function openDirectGrantDialog() {
  fireEvent.click(await screen.findByRole('button', { name: '권한 부여' }));
  return screen.findByRole('dialog', { name: '권한 부여' });
}

async function chooseSelectOption(label: string, optionName: string | RegExp) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
}

async function selectDirectGrantTargetAndScope(
  actorName = 'Actor One',
  scopeName: string | RegExp = /Finding 관리.*Payments/,
) {
  await chooseSelectOption('대상자', actorName);
  await waitFor(() =>
    expect(screen.getByTestId('direct-grant-recipient')).toHaveTextContent(actorName),
  );
  await chooseSelectOption('부여 권한 및 범위', scopeName);
}

describe('/admin/permissions/grants screen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useMeMock.mockReset();
    useWorkspaceSettingsMock.mockReset();
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
      const detail = within(screen.getByTestId('permission-grants-detail-panel'));
      expect(detail.getByText(tab === 'grants' ? '부여 정보' : '차단 정보')).toBeInTheDocument();
      expect(detail.getByText('처리')).toBeInTheDocument();
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
    await screen.findByRole('tab', { name: /^권한\s*,\s*2$/ });
    expect(screen.getByRole('tab', { name: /^차단\s*,\s*1$/ })).toBeInTheDocument();
  });

  test('keeps the failed list count unknown', async () => {
    installApi({ listError: 'grants' });
    renderScreen();

    await screen.findByText('활성 권한을 불러오지 못했습니다.');
    expect(screen.getByRole('tab', { name: '권한' })).not.toHaveTextContent('0');
    expect(screen.getByRole('tab', { name: /^차단\s*,\s*1$/ })).toBeInTheDocument();
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
      const api = installApi({ keepRevokedItem: true });
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

  test('shows a loading affordance while the revoke command is pending', async () => {
    const api = installApi({ deferRevoke: true });
    const { router } = renderScreen();

    const detail = await screen.findByTestId('permission-grants-detail-panel');
    fireEvent.change(within(detail).getByLabelText('사유 · 필수'), {
      target: { value: '중복 권한입니다.' },
    });
    const submit = within(detail).getByRole('button', { name: '권한 취소' });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(submit).toHaveAttribute('aria-busy', 'true');
      expect(submit).toBeDisabled();
    });
    api.releaseRevoke();
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('selected'));
  });

  test.each([
    {
      label: 'a non-active conflict',
      status: 409,
      code: 'conflict.permission_not_active',
      message: '이미 처리되었거나 만료되어 더 이상 활성 상태가 아닙니다.',
    },
    {
      label: 'a missing record',
      status: 404,
      code: 'not_found.record',
      message: '존재하지 않거나 접근할 수 없는 항목입니다.',
    },
  ] as const)(
    'maps $label to the shared error toast and refetches both lists',
    async ({ status, code, message }) => {
      const api = installApi({ revokeError: { status, code } });
      renderScreen();

      const detail = await screen.findByTestId('permission-grants-detail-panel');
      fireEvent.change(within(detail).getByLabelText('사유 · 필수'), {
        target: { value: '정책 변경' },
      });
      fireEvent.click(within(detail).getByRole('button', { name: '권한 취소' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
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
    },
  );

  test('blocks lifting your own deny when workspace policy forbids it', async () => {
    installApi();
    useMeMock.mockReturnValue({ data: { actor: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } } });
    useWorkspaceSettingsMock.mockReturnValue({
      data: { permission_self_approval: 'forbidden', survey_anonymity_threshold: 5 },
    });
    renderScreen(`/admin/permissions/grants?tab=denies&selected=${DENY_ID}`);

    const detail = await screen.findByTestId('permission-grants-detail-panel');
    const submit = within(detail).getByRole('button', { name: '차단 해제' });
    fireEvent.change(within(detail).getByLabelText('사유 · 필수'), {
      target: { value: '차단 사유가 해소되었습니다.' },
    });

    expect(submit).toBeDisabled();
    expect(
      within(detail).getByText('관리자는 본인에게 걸린 차단도 직접 해제할 수 없습니다.'),
    ).toBeInTheDocument();
  });

  test('offers the server candidate list and requires explicit governance confirmation', async () => {
    const api = installApi();
    renderScreen(`/admin/permissions/grants?tab=denies&selected=${DENY_ID}`);

    const dialog = await openDirectGrantDialog();
    await selectDirectGrantTargetAndScope(
      'Actor One',
      /워크스페이스 관리자 권한.*워크스페이스 전체/,
    );

    expect(within(dialog).getByText(/Role Level은 변경되지 않습니다/)).toBeInTheDocument();
    const submit = within(dialog).getByTestId('direct-grant-submit');
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('사유 · 필수'), {
      target: { value: '워크스페이스 운영을 맡깁니다.' },
    });
    expect(submit).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /관리자 권한 부여를 확인/ }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(
        api.requests.some(
          (request) => request.method === 'POST' && request.path === '/permissions/grants',
        ),
      ).toBe(true),
    );
    const post = api.requests.find(
      (request) => request.method === 'POST' && request.path === '/permissions/grants',
    );
    expect(directPermissionGrantSchema.parse(post?.body)).toEqual({
      actor_id: RECIPIENT_ID,
      capability: 'workspace.admin',
      reason: '워크스페이스 운영을 맡깁니다.',
    });
    expect(post?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test('blocks forbidden self grants even when the options response does not request an envelope', async () => {
    const api = installApi({
      grantOptionsByActor: {
        [SELF_ACTOR_ID]: grantOptionsFor(SELF_ACTOR_ID, {
          selfPolicy: 'forbidden',
          selfApprovalRequired: false,
          candidates: [DEFAULT_GRANT_CANDIDATE],
        }),
      },
    });
    useMeMock.mockReturnValue({ data: { actor: { id: SELF_ACTOR_ID } } });
    renderScreen();

    const dialog = await openDirectGrantDialog();
    await selectDirectGrantTargetAndScope('Admin One');
    fireEvent.change(within(dialog).getByLabelText('사유 · 필수'), {
      target: { value: '정책상 본인에게 부여할 수 없습니다.' },
    });

    expect(within(dialog).getByText(/본인에게 직접 권한을 부여할 수 없습니다/)).toBeInTheDocument();
    expect(within(dialog).getByTestId('direct-grant-submit')).toBeDisabled();
    expect(
      api.requests.some(
        (request) => request.method === 'POST' && request.path === '/permissions/grants',
      ),
    ).toBe(false);
  });

  test('sends the self-audit envelope only for an allowed self grant', async () => {
    const api = installApi({
      grantOptionsByActor: {
        [SELF_ACTOR_ID]: grantOptionsFor(SELF_ACTOR_ID, {
          candidates: [DEFAULT_GRANT_CANDIDATE],
        }),
      },
    });
    useMeMock.mockReturnValue({ data: { actor: { id: SELF_ACTOR_ID } } });
    renderScreen();

    const dialog = await openDirectGrantDialog();
    await selectDirectGrantTargetAndScope('Admin One');
    fireEvent.change(within(dialog).getByLabelText('사유 · 필수'), {
      target: { value: '본인 담당 시스템을 지원합니다.' },
    });
    fireEvent.change(within(dialog).getByLabelText('정책 근거 · 필수'), {
      target: { value: '권한 정책 4.3항' },
    });
    fireEvent.change(within(dialog).getByLabelText('동료 검토자 부재 사유 · 필수'), {
      target: { value: '동일 범위의 동료 검토자가 부재합니다.' },
    });
    fireEvent.click(within(dialog).getByTestId('direct-grant-submit'));

    await waitFor(() =>
      expect(
        api.requests.some(
          (request) => request.method === 'POST' && request.path === '/permissions/grants',
        ),
      ).toBe(true),
    );
    const post = api.requests.find(
      (request) => request.method === 'POST' && request.path === '/permissions/grants',
    );
    expect(directPermissionGrantSchema.parse(post?.body)).toEqual({
      actor_id: SELF_ACTOR_ID,
      capability: 'finding.manage',
      managed_system_id: MANAGED_SYSTEM_ID,
      reason: '본인 담당 시스템을 지원합니다.',
      self_approval: {
        policy_citation: '권한 정책 4.3항',
        peer_reviewer_absence: '동일 범위의 동료 검토자가 부재합니다.',
      },
    });
  });

  test('clears governance and self-audit consent when the candidate scope changes', async () => {
    installApi({
      grantOptionsByActor: {
        [SELF_ACTOR_ID]: grantOptionsFor(SELF_ACTOR_ID, {
          candidates: [
            {
              capability: 'workspace.admin',
              managed_system_id: null,
              governance_required: true,
              preflight: { state: 'available' },
            },
            DEFAULT_GRANT_CANDIDATE,
          ],
        }),
      },
    });
    useMeMock.mockReturnValue({ data: { actor: { id: SELF_ACTOR_ID } } });
    renderScreen();

    const dialog = await openDirectGrantDialog();
    await selectDirectGrantTargetAndScope(
      'Admin One',
      /워크스페이스 관리자 권한.*워크스페이스 전체/,
    );
    fireEvent.change(within(dialog).getByLabelText('정책 근거 · 필수'), {
      target: { value: '권한 정책 4.3항' },
    });
    fireEvent.change(within(dialog).getByLabelText('동료 검토자 부재 사유 · 필수'), {
      target: { value: '동료 검토자가 부재합니다.' },
    });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /관리자 권한 부여를 확인/ }));

    await chooseSelectOption('부여 권한 및 범위', /Finding 관리.*Payments/);
    expect(within(dialog).getByLabelText('정책 근거 · 필수')).toHaveValue('');
    expect(within(dialog).getByLabelText('동료 검토자 부재 사유 · 필수')).toHaveValue('');
    await chooseSelectOption('부여 권한 및 범위', /워크스페이스 관리자 권한.*워크스페이스 전체/);
    expect(
      within(dialog).getByRole('checkbox', { name: /관리자 권한 부여를 확인/ }),
    ).not.toBeChecked();
  });

  test.each([
    {
      name: 'open request',
      preflight: {
        state: 'request_review',
        request_id: REVIEW_REQUEST_ID,
        review_route: `/admin/permissions/requests?selected=${REVIEW_REQUEST_ID}`,
      },
      link: `/admin/permissions/requests?selected=${REVIEW_REQUEST_ID}`,
      linkName: /요청 검토/,
    },
    {
      name: 'overlapping deny',
      preflight: {
        state: 'deny_lift',
        deny_ids: [SECOND_DENY_ID],
        lift_route: `/admin/permissions/grants?tab=denies&selected=${SECOND_DENY_ID}`,
      },
      link: `/admin/permissions/grants?tab=denies&selected=${SECOND_DENY_ID}`,
      linkName: /차단 해제/,
    },
  ])(
    'uses the server preflight destination for an $name',
    async ({ preflight, link, linkName }) => {
      installApi({
        grantOptionsByActor: {
          [RECIPIENT_ID]: grantOptionsFor(RECIPIENT_ID, {
            candidates: [{ ...DEFAULT_GRANT_CANDIDATE, preflight }],
          }),
        },
      });
      renderScreen();

      const dialog = await openDirectGrantDialog();
      await selectDirectGrantTargetAndScope();

      expect(within(dialog).getByRole('link', { name: linkName })).toHaveAttribute('href', link);
      expect(within(dialog).getByTestId('direct-grant-submit')).toBeDisabled();
    },
  );

  test.each([
    {
      code: 'conflict.permission_request_duplicate',
      detail: {
        request_id: REVIEW_REQUEST_ID,
        review_route: `/admin/permissions/requests?selected=${REVIEW_REQUEST_ID}`,
      },
      link: `/admin/permissions/requests?selected=${REVIEW_REQUEST_ID}`,
      linkName: /요청 검토/,
    },
    {
      code: 'conflict.capability_already_denied',
      detail: {
        deny_ids: [SECOND_DENY_ID],
        lift_route: `/admin/permissions/grants?tab=denies&selected=${SECOND_DENY_ID}`,
      },
      link: `/admin/permissions/grants?tab=denies&selected=${SECOND_DENY_ID}`,
      linkName: /차단 해제/,
    },
  ] as const)(
    'retains the draft and exposes the destination when submit discovers $code',
    async ({ code, detail, link, linkName }) => {
      const api = installApi({ directGrantErrors: [{ status: 409, code, detail }] });
      renderScreen();

      const dialog = await openDirectGrantDialog();
      await selectDirectGrantTargetAndScope();
      const reason = within(dialog).getByLabelText('사유 · 필수');
      fireEvent.change(reason, { target: { value: '검토 대상이 뒤늦게 확인되었습니다.' } });
      fireEvent.click(within(dialog).getByTestId('direct-grant-submit'));

      expect(await within(dialog).findByRole('link', { name: linkName })).toHaveAttribute(
        'href',
        link,
      );
      expect(reason).toHaveValue('검토 대상이 뒤늦게 확인되었습니다.');
      expect(
        api.requests.filter(
          (request) => request.method === 'POST' && request.path === '/permissions/grants',
        ),
      ).toHaveLength(1);
    },
  );

  test.each([
    { name: 'populated', initialGrants: GRANTS },
    { name: 'empty', initialGrants: [] },
    { name: 'expired grant reissue', initialGrants: [EXPIRED_MATCHING_GRANT] },
  ])(
    'selects the returned grant from the denies tab when the $name grants list refetch is stale',
    async ({ initialGrants }) => {
      const api = installApi({ initialGrants, deferGrantRefetch: true });
      const { router, queryClient } = renderScreen(
        `/admin/permissions/grants?tab=denies&selected=${DENY_ID}`,
      );
      const dialog = await openDirectGrantDialog();
      await selectDirectGrantTargetAndScope();
      fireEvent.change(within(dialog).getByLabelText('사유 · 필수'), {
        target: { value: 'Payments Finding 운영을 맡깁니다.' },
      });
      fireEvent.change(within(dialog).getByLabelText('만료일 · 선택'), {
        target: { value: '2027-01-31' },
      });
      fireEvent.click(within(dialog).getByTestId('direct-grant-submit'));

      await waitFor(() =>
        expect(router.state.location.search).toEqual({ selected: CREATED_GRANT_ID }),
      );
      await waitFor(() =>
        expect(
          api.requests.filter(
            (request) => request.method === 'GET' && request.path === '/permissions/grants',
          ),
        ).toHaveLength(2),
      );
      const post = api.requests.find(
        (request) => request.method === 'POST' && request.path === '/permissions/grants',
      );
      expect(directPermissionGrantSchema.parse(post?.body)).toEqual({
        actor_id: RECIPIENT_ID,
        capability: 'finding.manage',
        managed_system_id: MANAGED_SYSTEM_ID,
        expires_at: '2027-01-31T23:59:59.000Z',
        reason: 'Payments Finding 운영을 맡깁니다.',
      });
      const detail = screen.getByTestId('permission-grants-detail-panel');
      expect(detail).toHaveTextContent('Actor One · Finding 관리');
      expect(detail).toHaveTextContent('Payments');
      expect(detail).toHaveTextContent('2027. 1. 31.');

      await act(async () => api.releaseGrantRefetch());
      await waitFor(() =>
        expect(screen.getByTestId('permission-grants-detail-panel')).toHaveTextContent(
          '2027. 1. 31.',
        ),
      );
      expect(
        queryClient
          .getQueryData<typeof GRANTS>(['permission-grants', 'admin'])
          ?.some((grant) => grant.id === CREATED_GRANT_ID),
      ).toBe(true);

      await act(async () => router.history.back());
      await waitFor(() =>
        expect(router.state.location.search).toEqual({ tab: 'denies', selected: DENY_ID }),
      );
      await act(async () => router.history.forward());
      await waitFor(() =>
        expect(router.state.location.search).toEqual({ selected: CREATED_GRANT_ID }),
      );
    },
  );

  test('keeps the current selection when a delayed grant completes after changing tabs', async () => {
    const api = installApi({ deferDirectGrant: true });
    const { router } = renderScreen(`/admin/permissions/grants?tab=denies&selected=${DENY_ID}`);
    const dialog = await openDirectGrantDialog();
    await selectDirectGrantTargetAndScope();
    fireEvent.change(within(dialog).getByLabelText('사유 · 필수'), {
      target: { value: '새 담당자에게 Finding 운영을 맡깁니다.' },
    });
    fireEvent.click(within(dialog).getByTestId('direct-grant-submit'));

    await waitFor(() =>
      expect(
        api.requests.some(
          (request) => request.method === 'POST' && request.path === '/permissions/grants',
        ),
      ).toBe(true),
    );
    await act(async () =>
      router.navigate({ to: '/admin/permissions/grants', search: { selected: GRANT_ID } }),
    );
    await waitFor(() => expect(router.state.location.search).toEqual({ selected: GRANT_ID }));

    await act(async () => api.releaseDirectGrant());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '권한 부여' })).toBeNull());
    expect(router.state.location.search).toEqual({ selected: GRANT_ID });
  });

  test('starts a fresh draft when the direct-grant dialog closes and reopens', async () => {
    installApi();
    renderScreen();
    const firstDialog = await openDirectGrantDialog();
    await selectDirectGrantTargetAndScope();
    fireEvent.change(within(firstDialog).getByLabelText('사유 · 필수'), {
      target: { value: '첫 번째 초안입니다.' },
    });
    fireEvent.keyDown(firstDialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '권한 부여' })).toBeNull());

    const secondDialog = await openDirectGrantDialog();
    expect(within(secondDialog).getByRole('combobox', { name: '대상자' })).toHaveTextContent(
      '대상자를 선택하세요.',
    );
    await selectDirectGrantTargetAndScope();
    expect(within(secondDialog).getByLabelText('사유 · 필수')).toHaveValue('');
  });

  test('does not navigate after an in-flight direct grant completes after unmount', async () => {
    const api = installApi({ deferDirectGrant: true });
    const { router, unmount } = renderScreen(`/admin/permissions/grants?selected=${GRANT_ID}`);
    const dialog = await openDirectGrantDialog();
    await selectDirectGrantTargetAndScope();
    fireEvent.change(within(dialog).getByLabelText('사유 · 필수'), {
      target: { value: '화면을 떠나도 생성 결과는 캐시에 반영합니다.' },
    });
    fireEvent.click(within(dialog).getByTestId('direct-grant-submit'));
    await waitFor(() =>
      expect(
        api.requests.some(
          (request) => request.method === 'POST' && request.path === '/permissions/grants',
        ),
      ).toBe(true),
    );

    unmount();
    await act(async () => {
      api.releaseDirectGrant();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(router.state.location.search).toEqual({ selected: GRANT_ID });
  });

  test('uses one key for a rapid submit and unchanged retry, then rotates it for a changed body', async () => {
    const api = installApi({
      deferDirectGrant: true,
      directGrantErrors: [
        { status: 500, code: 'internal.unexpected' },
        { status: 500, code: 'internal.unexpected' },
        null,
      ],
    });
    renderScreen();
    const dialog = await openDirectGrantDialog();
    await selectDirectGrantTargetAndScope();
    const reason = within(dialog).getByLabelText('사유 · 필수');
    fireEvent.change(reason, { target: { value: 'Same normalized intent' } });
    const submit = within(dialog).getByTestId('direct-grant-submit');

    await act(async () => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    await waitFor(() =>
      expect(
        api.requests.filter(
          (request) => request.method === 'POST' && request.path === '/permissions/grants',
        ),
      ).toHaveLength(1),
    );
    const firstKey = api.requests.find((request) => request.method === 'POST')?.idempotencyKey;
    await act(async () => api.releaseDirectGrant());
    await within(dialog).findByRole('alert');

    fireEvent.click(submit);
    await waitFor(() =>
      expect(
        api.requests.filter(
          (request) => request.method === 'POST' && request.path === '/permissions/grants',
        ),
      ).toHaveLength(2),
    );
    await within(dialog).findByRole('alert');
    const secondKey = api.requests.filter((request) => request.method === 'POST')[1]
      ?.idempotencyKey;
    expect(secondKey).toBe(firstKey);

    fireEvent.change(reason, { target: { value: 'Changed normalized intent' } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(
        api.requests.filter(
          (request) => request.method === 'POST' && request.path === '/permissions/grants',
        ),
      ).toHaveLength(3),
    );
    const thirdKey = api.requests.filter((request) => request.method === 'POST')[2]?.idempotencyKey;
    expect(thirdKey).not.toBe(firstKey);
    expect(
      directPermissionGrantSchema.parse(
        api.requests.filter((request) => request.method === 'POST').at(-1)?.body,
      ).reason,
    ).toBe('Changed normalized intent');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '권한 부여' })).toBeNull());
    const nextDialog = await openDirectGrantDialog();
    await selectDirectGrantTargetAndScope();
    fireEvent.change(within(nextDialog).getByLabelText('사유 · 필수'), {
      target: { value: 'Changed normalized intent' },
    });
    fireEvent.click(within(nextDialog).getByTestId('direct-grant-submit'));
    await waitFor(() =>
      expect(
        api.requests.filter(
          (request) => request.method === 'POST' && request.path === '/permissions/grants',
        ),
      ).toHaveLength(4),
    );
    expect(api.requests.filter((request) => request.method === 'POST')[3]?.idempotencyKey).not.toBe(
      thirdKey,
    );
  });

  test('discards delayed options for a previous recipient after changing recipients', async () => {
    const api = installApi({
      deferGrantOptionsFor: [RECIPIENT_ID],
      grantOptionsByActor: {
        [SELF_ACTOR_ID]: grantOptionsFor(SELF_ACTOR_ID, {
          candidates: [
            {
              capability: 'workspace.admin',
              managed_system_id: null,
              governance_required: true,
              preflight: { state: 'available' },
            },
          ],
        }),
        [RECIPIENT_ID]: grantOptionsFor(RECIPIENT_ID, {
          candidates: [DEFAULT_GRANT_CANDIDATE],
        }),
      },
    });
    renderScreen();
    const dialog = await openDirectGrantDialog();
    await chooseSelectOption('대상자', 'Actor One');
    await waitFor(() =>
      expect(
        api.requests.some(
          (request) =>
            request.method === 'GET' &&
            request.path === `/permissions/grant-options?actor_id=${RECIPIENT_ID}`,
        ),
      ).toBe(true),
    );
    expect(within(dialog).queryByTestId('direct-grant-submit')).not.toBeInTheDocument();

    await chooseSelectOption('대상자', 'Admin One');
    await waitFor(() =>
      expect(
        api.requests.some(
          (request) =>
            request.method === 'GET' &&
            request.path === `/permissions/grant-options?actor_id=${SELF_ACTOR_ID}`,
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getByTestId('direct-grant-recipient')).toHaveTextContent('Admin One'),
    );
    await act(async () => api.releaseGrantOptions());

    fireEvent.click(within(dialog).getByRole('combobox', { name: '부여 권한 및 범위' }));
    expect(
      await screen.findByRole('option', { name: /워크스페이스 관리자 권한.*워크스페이스 전체/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /Finding 관리.*Payments/ }),
    ).not.toBeInTheDocument();
  });
});
