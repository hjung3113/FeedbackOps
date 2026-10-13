import { adminDetailFixture } from '@/test/permission-details';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { type AdminPermissionRequestRow, errorMapper } from "@/lib/api";
import { ADMIN_PERMISSIONS_COPY } from "@/lib/copy/admin-permissions";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@fops/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fops/ui")>();
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

import { PermissionRequestsConsolePage } from "./requests";

const REQUESTS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    requester_actor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    requested_capability: "workspace.read",
    requested_managed_system_id: null,
    requested_expiration: null,
    revision: 7,
    reason: "need access",
    status: "pending",
    created_at: "2026-07-17T00:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    requester_actor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    requested_capability: "workspace.write",
    requested_managed_system_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    requested_expiration: null,
    revision: 7,
    reason: "need detail",
    status: "needs_more_info",
    created_at: "2026-07-16T00:00:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    requester_actor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    requested_capability: "workspace.admin",
    requested_managed_system_id: null,
    requested_expiration: null,
    revision: 7,
    reason: "done",
    status: "approved",
    created_at: "2026-07-15T00:00:00.000Z",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    requester_actor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    requested_capability: "workspace.delete",
    requested_managed_system_id: null,
    requested_expiration: null,
    revision: 7,
    reason: "no",
    status: "rejected",
    created_at: "2026-07-14T00:00:00.000Z",
  },
] as const;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildHarness() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/permissions/requests",
    component: PermissionRequestsConsolePage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({
      initialEntries: ["/admin/permissions/requests"],
    }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { router, queryClient };
}

function installFetch(
  options: {
    decision?: { status: number; body: unknown };
    onList?: () => void;
    requests?: readonly AdminPermissionRequestRow[];
    actorId?: string;
    detail?: (row: AdminPermissionRequestRow) => unknown;
    selfApprovalPolicy?: "allowed" | "forbidden" | "error" | "pending";
  } = {},
) {
  const requests = options.requests ?? REQUESTS;
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/me/permissions/check"))
        return response({ state: "approved", decision: { allow: true } });
      if (url === "/me")
        return response({
          actor: {
            id: options.actorId ?? "another-admin",
            external_id: "admin",
            email: "admin@example.test",
            display_name: "Admin",
            role_level: "admin",
          },
          workspace_id: "workspace-1",
        });
      if (url === "/workspace/settings") {
        if (options.selfApprovalPolicy === "error")
          return response({ code: "internal.unexpected", message: "settings unavailable" }, 500);
        if (options.selfApprovalPolicy === "pending") return new Promise<Response>(() => {});
        return response({
          permission_self_approval: options.selfApprovalPolicy ?? "allowed",
          survey_anonymity_threshold: 5,
        });
      }
      if (
        url === "/permissions/requests?status=all" &&
        (!init?.method || init.method === "GET")
      ) {
        options.onList?.();
        return response({ requests, count: requests.length });
      }
      if (/^\/permissions\/requests\/[^/]+$/.test(url)) {
        const row = requests.find((candidate) => url.endsWith(candidate.id));
        if (row) return response(options.detail?.(row) ?? adminDetailFixture(row, row.requester_actor_id === options.actorId, options.selfApprovalPolicy === 'forbidden' ? 'forbidden' : 'allowed'));
      }
      if (url.includes("/permissions/requests/") && init?.method === "POST") {
        return response(
          options.decision?.body ?? { id: requests[0].id, revision: 8, updated_at: "2026-10-13T00:00:00.000Z", status: "approved" },
          options.decision?.status ?? 200,
        );
      }
      return response(
        { code: "internal.unexpected", message: "unmocked" },
        500,
      );
    },
  ) as typeof globalThis.fetch;
}

function renderRoute() {
  const { router, queryClient } = buildHarness();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function decisionPosts() {
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([, init]) => init?.method === "POST",
  );
}

describe("/admin/permissions/requests", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  test('same-ID revision refresh clears decision, reason, self envelope and expiry without resubmitting', async () => {
    let row: AdminPermissionRequestRow = { ...REQUESTS[0] };
    installFetch({ actorId: row.requester_actor_id, detail: () => adminDetailFixture(row, true) });
    const { router, queryClient } = buildHarness();
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByTestId('permission-decision-section');
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'old reason' } });
    fireEvent.change(screen.getByLabelText(/정책 근거/), {
      target: { value: 'old policy citation' },
    });
    fireEvent.change(screen.getByLabelText(/동료 검토자 부재 사유/), {
      target: { value: 'old absence reason' },
    });
    fireEvent.click(screen.getByRole('radio', { name: '만료일 변경' }));
    fireEvent.change(screen.getByLabelText('새 만료일'), { target: { value: '2099-12-31' } });
    row = {
      ...row,
      revision: 8,
      reason: 'edited request',
      requested_managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    };
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['permission-requests', 'admin-detail', row.id],
      });
    });
    await screen.findByText('edited request');
    expect(screen.getByLabelText(/^사유/)).toHaveValue('');
    expect(screen.queryByTestId('self-approval-audit-capture')).not.toBeInTheDocument();
    expect(screen.getByTestId('permission-decision-submit')).toBeDisabled();
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(decisionPosts()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    expect(screen.getByLabelText(/정책 근거/)).toHaveValue('');
    expect(screen.getByLabelText(/동료 검토자 부재 사유/)).toHaveValue('');
    expect(screen.getByRole('radio', { name: '요청 만료일 유지 · 만료 없음' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByLabelText('새 만료일')).toHaveValue('');
  });

  test('an unchanged background refetch keeps the decision draft intact', async () => {
    installFetch();
    const { router, queryClient } = buildHarness();
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByTestId('permission-decision-section');
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'kept review' } });
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['permission-requests', 'admin-detail', REQUESTS[0].id],
      });
    });
    await waitFor(() =>
      expect(screen.getByLabelText(/^사유/)).toHaveValue('kept review'),
    );
    expect(screen.getByRole('button', { name: '승인' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('permission-decision-submit')).toBeEnabled();
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    expect(JSON.parse(decisionPosts()[0]![1].body as string)).toEqual({
      expected_revision: 7,
      reason: 'kept review',
    });
  });

  test.each([false, true])(
    'stale conflict refetches selected detail and never resubmits (failed refetch: %s)',
    async (failedRead) => {
      let reads = 0;
      installFetch({
        detail: (row) => {
          reads += 1;
          return adminDetailFixture({
            ...row,
            revision: reads === 1 ? 7 : 8,
            reason: reads === 1 ? row.reason : 'latest ask',
          });
        },
        decision: {
          status: 409,
          body: { code: 'conflict.stale_write', message: 'stale', detail: { current_revision: 8 } },
        },
      });
      const base = globalThis.fetch;
      let selectedReads = 0;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === `/permissions/requests/${REQUESTS[0].id}`) {
          selectedReads += 1;
          if (failedRead && selectedReads > 1)
            return response({ code: 'internal.unexpected', message: 'read failed' }, 500);
        }
        return base(input, init);
      }) as typeof fetch;
      renderRoute();
      await screen.findByTestId('permission-decision-section');
      fireEvent.click(screen.getByRole('button', { name: '승인' }));
      fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'old review' } });
      fireEvent.click(screen.getByTestId('permission-decision-submit'));
      if (failedRead) {
        await screen.findByText('요청 상세를 불러오지 못했습니다. 다시 확인해 주세요.');
        expect(screen.queryByTestId('permission-decision-section')).not.toBeInTheDocument();
      } else {
        await screen.findByText('latest ask');
        expect(screen.getByLabelText(/^사유/)).toHaveValue('');
        expect(screen.getByTestId('permission-decision-submit')).toBeDisabled();
        fireEvent.click(screen.getByTestId('permission-decision-submit'));
      }
      await act(async () => {
        await Promise.resolve();
      });
      expect(selectedReads).toBe(2);
      expect(decisionPosts()).toHaveLength(1);
    },
  );

  test('an unchanged background refetch during a pending decision neither resets the lock nor duplicates the POST', async () => {
    installFetch();
    const base = globalThis.fetch;
    let finish: ((value: Response) => void) | undefined;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : base(input, init),
    ) as typeof fetch;
    const { router, queryClient } = buildHarness();
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByTestId('permission-decision-section');
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['permission-requests', 'admin-detail', REQUESTS[0].id],
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(decisionPosts()).toHaveLength(1);
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(decisionPosts()).toHaveLength(1);
    await act(async () => {
      finish?.(
        response({
          id: REQUESTS[0].id,
          revision: 8,
          status: 'approved',
          updated_at: '2026-10-13T00:00:00.000Z',
        }),
      );
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(decisionPosts()).toHaveLength(1);
  });

  test('an unchanged background refetch does not rotate the identical retry key', async () => {
    installFetch({
      detail: (row) => adminDetailFixture({ ...row, revision: 7 }),
      decision: { status: 500, body: { code: 'internal.unexpected', message: 'uncertain' } },
    });
    const { router, queryClient } = buildHarness();
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByTestId('permission-decision-section');
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['permission-requests', 'admin-detail', REQUESTS[0].id],
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId('permission-decision-submit')).toBeEnabled(),
    );
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(decisionPosts()).toHaveLength(2));
    expect(new Headers(decisionPosts()[1]![1].headers).get('Idempotency-Key')).toBe(
      new Headers(decisionPosts()[0]![1].headers).get('Idempotency-Key'),
    );
  });

  test('stale review latches a persistent focused inline notice until a new action is picked', async () => {
    let reads = 0;
    installFetch({
      detail: (row) => {
        reads += 1;
        return adminDetailFixture({
          ...row,
          revision: reads === 1 ? 7 : 8,
          reason: reads === 1 ? row.reason : 'latest ask',
        });
      },
      decision: {
        status: 409,
        body: { code: 'conflict.stale_write', message: 'stale', detail: { current_revision: 8 } },
      },
    });
    renderRoute();
    await screen.findByTestId('permission-decision-section');
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await screen.findByText('latest ask');
    const alerts = screen.getAllByText(ADMIN_PERMISSIONS_COPY.reviewAgain);
    expect(alerts).toHaveLength(1);
    const alert = screen.getByTestId('permission-request-stale-alert');
    await waitFor(() => expect(alert).toHaveFocus());
    // The notice persists after the refetch-triggered remount has settled.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('permission-request-stale-alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '거절' }));
    expect(screen.queryByTestId('permission-request-stale-alert')).not.toBeInTheDocument();
  });

  test('stale stays blocked while selected refetch is pending even if expiry controls reset mutation errors', async () => {
    let reads = 0;
    installFetch({
      decision: {
        status: 409,
        body: { code: 'conflict.stale_write', message: 'stale', detail: { current_revision: 8 } },
      },
    });
    const base = globalThis.fetch;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === `/permissions/requests/${REQUESTS[0].id}` && ++reads > 1)
        return new Promise<Response>(() => {});
      return base(input, init);
    }) as typeof fetch;
    renderRoute();
    await screen.findByTestId('permission-decision-section');
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(reads).toBe(2));
    const clear = screen.queryByRole('radio', { name: '만료 없음' });
    if (clear) fireEvent.click(clear);
    expect(screen.getByTestId('permission-decision-submit')).toBeDisabled();
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(decisionPosts()).toHaveLength(1);
  });

  test('uncertain failure retries the identical intent key and rotates after explicit new revision review', async () => {
    let revision = 7;
    installFetch({
      detail: (row) => adminDetailFixture({ ...row, revision }),
      decision: { status: 500, body: { code: 'internal.unexpected', message: 'uncertain' } },
    });
    const { router, queryClient } = buildHarness();
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByTestId('permission-decision-section');
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(decisionPosts()).toHaveLength(2));
    const key = (index: number) =>
      new Headers(decisionPosts()[index]![1].headers).get('Idempotency-Key');
    expect(key(1)).toBe(key(0));
    revision = 8;
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['permission-requests', 'admin-detail', REQUESTS[0].id],
      });
    });
    await waitFor(() => expect(screen.getByTestId('permission-decision-submit')).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'fresh review' } });
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(decisionPosts()).toHaveLength(3));
    expect(key(2)).not.toBe(key(0));
    expect(JSON.parse(decisionPosts()[2]![1].body as string)).toEqual({
      expected_revision: 8,
      reason: 'fresh review',
    });
  });

  test('an old pending decision completion cannot change or populate the new selection', async () => {
    installFetch();
    const base = globalThis.fetch;
    let finish: ((value: Response) => void) | undefined;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : base(input, init),
    ) as typeof fetch;
    renderRoute();
    await screen.findByTestId('permission-decision-section');
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^추가 정보 필요/ }));
    await screen.findByText('need detail');
    fireEvent.click(screen.getByRole('button', { name: '거절' }));
    fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'new selection review' } });
    await act(async () => {
      finish?.(
        response({
          id: REQUESTS[0].id,
          revision: 8,
          status: 'approved',
          updated_at: '2026-10-13T00:00:00.000Z',
        }),
      );
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.getByText('need detail')).toBeInTheDocument();
    expect(screen.getByLabelText(/^사유/)).toHaveValue('new selection review');
    expect(decisionPosts()).toHaveLength(1);
  });

  test('uses server allowed actions and approval scope candidates with exact narrowing body', async () => {
    installFetch({
      detail: (row) => ({
        ...adminDetailFixture(row),
        allowed_actions: ['approve'],
        approval_scope_candidates: [
          { managed_system_id: null },
          { managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
        ],
      }),
    });
    renderRoute();
    await screen.findByTestId('permission-decision-section');
    expect(screen.queryByRole('button', { name: '거절' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '추가 정보 요청' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    const scope = screen.getByRole('combobox', { name: '승인 범위' });
    fireEvent.keyDown(scope, { key: 'ArrowDown' });
    const option = await screen.findByRole('option', { name: 'Managed System · cccccccc' });
    fireEvent.click(option);
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    expect(JSON.parse(decisionPosts()[0]![1].body as string)).toEqual({
      expected_revision: 7,
      granted_managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
    expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent(
      '워크스페이스 전체',
    );
  });

  test('two submits in the same event turn send one decision intent', async () => {
    installFetch();
    renderRoute();
    await screen.findByTestId('permission-decision-section');
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('permission-decision-submit'));
      fireEvent.click(screen.getByTestId('permission-decision-submit'));
      await Promise.resolve();
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(decisionPosts()).toHaveLength(1);
  });

  test('switching request IDs clears the decision and reason and posts the new selected revision', async () => {
    installFetch();
    renderRoute();
    await screen.findByTestId('permission-decision-section');
    fireEvent.click(screen.getByRole('button', { name: '거절' }));
    fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'first request draft' } });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^추가 정보 필요/ }));
    await screen.findByText('need detail');
    expect(screen.getByLabelText(/^사유/)).toHaveValue('');
    expect(screen.getByTestId('permission-decision-submit')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '추가 정보 요청' }));
    fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'new question' } });
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    expect(decisionPosts()[0]![0]).toBe(`/permissions/requests/${REQUESTS[1].id}/need-more-info`);
    expect(JSON.parse(decisionPosts()[0]![1].body as string)).toEqual({
      expected_revision: 7,
      note: 'new question',
    });
  });

  test('cancelled history uses the withdrawal label and has no decision controls', async () => {
    installFetch({ requests: [{ ...REQUESTS[0], status: 'cancelled' }] });
    renderRoute();
    await screen.findByRole('tab', { name: /^전체/ });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }));
    await waitFor(() =>
      expect(screen.getByTestId('permission-request-detail-panel')).toHaveTextContent('철회'),
    );
    expect(screen.queryByTestId('permission-decision-section')).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  test("renders five client tabs and filters mixed request statuses", async () => {
    installFetch();
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: /^대기 중\s*,\s*1$/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(
      within(screen.getByTestId("permission-requests-list")).getByText(
        "workspace.read",
      ),
    ).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^승인됨\s*,\s*1$/ }));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("permission-requests-list")).getByText(
          "workspace.admin",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId("permission-requests-list")).queryByText(
        "workspace.read",
      ),
    ).not.toBeInTheDocument();
  });

  test("keeps the detail panel closed until a row is selected or the tab changes", async () => {
    installFetch();
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-request-detail-panel"),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));
    await waitFor(() =>
      expect(
        screen.queryByTestId("permission-request-detail-panel"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^추가 정보 필요\s*,\s*1$/ }));
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-request-detail-panel"),
      ).toBeInTheDocument(),
    );
  });

  test("selects the first visible request when a selected request drops out on tab change", async () => {
    installFetch();
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-request-detail-panel"),
      ).toBeInTheDocument(),
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^승인됨\s*,\s*1$/ }));

    await waitFor(() =>
      expect(
        screen.getByTestId("permission-request-detail-panel"),
      ).toHaveTextContent("workspace.admin"),
    );
  });

  test.each([
    ["승인", "/approve", "승인 사유", { reason: "승인 사유" }],
    [
      "추가 정보 요청",
      "/need-more-info",
      "추가 정보 사유",
      { note: "추가 정보 사유" },
    ],
    ["거절", "/reject", "정책 사유", { reason: "정책 사유" }],
    [
      "명시적 거부",
      "/deny",
      "명시적 거부 사유",
      { reason: "명시적 거부 사유" },
    ],
  ])(
    "posts %s to %s with its exact decision body and an Idempotency-Key",
    async (action, suffix, reason, expectedBody) => {
      installFetch();
      renderRoute();
      await waitFor(() =>
        expect(
          screen.getByTestId("permission-decision-section"),
        ).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: action }));
      if (reason)
        fireEvent.change(screen.getByLabelText(/사유/), {
          target: { value: reason },
        });
      fireEvent.click(screen.getByTestId("permission-decision-submit"));
      await waitFor(() => {
        const posts = (
          globalThis.fetch as ReturnType<typeof vi.fn>
        ).mock.calls.filter(([, init]) => init?.method === "POST");
        expect(posts).toHaveLength(1);
      });
      const post = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([, candidate]) => candidate?.method === "POST",
      );
      if (!post) throw new Error("Expected a decision POST request");
      const [url, init] = post;
      expect(url).toBe(`/permissions/requests/${REQUESTS[0].id}${suffix}`);
      expect(new Headers(init.headers).get("Idempotency-Key")).toMatch(
        /^[0-9a-f-]{36}$/i,
      );
      expect(JSON.parse(init.body as string)).toEqual({ ...expectedBody, expected_revision: 7 });
    },
  );

  test("#524 no decision is pre-selected on entry, and submit stays disabled until one is chosen explicitly", async () => {
    installFetch();
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-decision-section"),
      ).toBeInTheDocument(),
    );

    for (const label of ["승인", "추가 정보 요청", "거절", "명시적 거부"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    expect(screen.getByTestId("permission-decision-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        ([, init]) => init?.method === "POST",
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(
      screen.getByRole("button", { name: "승인" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("permission-decision-submit")).toBeEnabled();
  });

  test("AC-4 shows audit capture only for this Admin's approve action, not another request or another action", async () => {
    installFetch({ actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" });
    renderRoute();

    await waitFor(() =>
      expect(
        screen.getByTestId("permission-decision-section"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("self-approval-audit-capture")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(screen.getByTestId("self-approval-audit-capture")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "거절" }));
    expect(screen.queryByTestId("self-approval-audit-capture")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(screen.getByTestId("self-approval-audit-capture")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^추가 정보 필요\s*,\s*1$/ }));
    await waitFor(() =>
      expect(screen.queryByTestId("self-approval-audit-capture")).not.toBeInTheDocument(),
    );
  });

  test("AC-5 requires two trimmed eight-character audit fields and posts their exact envelope", async () => {
    installFetch({ actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" });
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-decision-section"),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    await waitFor(() =>
      expect(screen.getByTestId("self-approval-audit-capture")).toBeInTheDocument(),
    );

    const submit = screen.getByTestId("permission-decision-submit");
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/정책 근거/), {
      target: { value: "  policy7  " },
    });
    fireEvent.change(screen.getByLabelText(/동료 검토자 부재 사유/), {
      target: { value: "  reviewer absence  " },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/정책 근거/), {
      target: { value: "  policy-8  " },
    });
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/동료 검토자 부재 사유/), {
      target: { value: "  absence  " },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/동료 검토자 부재 사유/), {
      target: { value: "  reviewer  " },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    const [, init] = decisionPosts()[0]!;
    expect(JSON.parse(init.body as string)).toEqual({
      expected_revision: 7,
      self_approval: {
        policy_citation: "policy-8",
        peer_reviewer_absence: "reviewer",
      },
    });
  });

  test("AC-6 disables self-approval under forbidden workspace policy without posting", async () => {
    installFetch({ actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", selfApprovalPolicy: "forbidden" });
    renderRoute();
    await waitFor(() =>
      expect(screen.getByText(/워크스페이스 정책에서 직접 승인을 금지합니다/)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(screen.getByTestId("permission-decision-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    expect(decisionPosts()).toHaveLength(0);
  });

  test("AC-7 keeps self-approval enabled and handles a backend denial while workspace settings fail or remain unresolved", async () => {
    for (const selfApprovalPolicy of ["error", "pending"] as const) {
      installFetch({
        actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        selfApprovalPolicy,
        decision: {
          status: 403,
          body: { code: "permission.denied", message: "self-approval denied" },
        },
      });
      renderRoute();
      await waitFor(() =>
        expect(
          screen.getByTestId("permission-decision-section"),
        ).toBeInTheDocument(),
      );
      expect(screen.getByRole("button", { name: "승인" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "승인" }));
      await waitFor(() =>
        expect(screen.getByTestId("self-approval-audit-capture")).toBeInTheDocument(),
      );
      fireEvent.change(screen.getByLabelText(/정책 근거/), {
        target: { value: "policy-8" },
      });
      fireEvent.change(screen.getByLabelText(/동료 검토자 부재 사유/), {
        target: { value: "reviewer absence" },
      });
      fireEvent.click(screen.getByTestId("permission-decision-submit"));

      await waitFor(() => expect(decisionPosts()).toHaveLength(1));
      const [, init] = decisionPosts()[0]!;
      expect(JSON.parse(init.body as string)).toEqual({
        expected_revision: 7,
        self_approval: {
          policy_citation: "policy-8",
          peer_reviewer_absence: "reviewer absence",
        },
      });
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("권한이 없습니다."));
      cleanup();
    }
  });

  test("re-mints the Idempotency-Key after a successful decision", async () => {
    installFetch();
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-decision-section"),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "승인" }));

    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([, init]) => init?.method === "POST",
        ),
      ).toHaveLength(1),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("권한 요청이 처리되었습니다."),
    );
    await waitFor(() => expect(screen.getByTestId("permission-decision-submit")).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([, init]) => init?.method === "POST",
        ),
      ).toHaveLength(2),
    );

    const posts = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    const [firstPost, secondPost] = posts;
    if (!firstPost || !secondPost)
      throw new Error("Expected two decision POST requests");
    expect(new Headers(secondPost[1].headers).get("Idempotency-Key")).not.toBe(
      new Headers(firstPost[1].headers).get("Idempotency-Key"),
    );
  });

  test("blocks an empty reject reason, allows empty approve, refetches after success and stale write", async () => {
    let listCalls = 0;
    installFetch({
      onList: () => {
        listCalls += 1;
      },
    });
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-decision-section"),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "거절" }));
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        ([, init]) => init?.method === "POST",
      ),
    ).toBe(false);
    fireEvent.change(screen.getByLabelText(/사유/), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        ([, init]) => init?.method === "POST",
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(2));

    installFetch({
      decision: {
        status: 409,
        body: { code: "conflict.stale_write", message: "stale", detail: { current_revision: 8 } },
      },
      onList: () => {
        listCalls += 1;
      },
    });
    await waitFor(() => expect(screen.getByTestId("permission-decision-submit")).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("요청 내용이 변경되었습니다. 최신 요청을 확인한 후 다시 시도해 주세요."),
    );
    await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(3));
  });

  test("blocks a whitespace-only deny reason", async () => {
    installFetch();
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-decision-section"),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "명시적 거부" }));
    fireEvent.change(screen.getByLabelText(/사유/), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("permission-decision-submit"));

    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        ([, init]) => init?.method === "POST",
      ),
    ).toBe(false);
  });

  test("blocks an empty or whitespace-only need-more-info note", async () => {
    installFetch();
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-decision-section"),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "추가 정보 요청" }));
    expect(screen.getByLabelText("사유 · 필수")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    fireEvent.change(screen.getByLabelText(/사유/), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("permission-decision-submit"));

    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        ([, init]) => init?.method === "POST",
      ),
    ).toBe(false);
  });

  test("blocks an empty approve reason for a sensitive capability", async () => {
    installFetch({
      requests: [
        { ...REQUESTS[0], requested_capability: "workspace.admin" },
      ],
    });
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-decision-section"),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(screen.getByLabelText("사유 · 필수")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("permission-decision-submit"));

    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        ([, init]) => init?.method === "POST",
      ),
    ).toBe(false);
  });

  test("allows an empty approve reason for a non-sensitive capability", async () => {
    installFetch();
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-decision-section"),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(screen.getByLabelText("사유 · 선택")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("permission-decision-submit"));

    await waitFor(() =>
      expect(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          ([, init]) => init?.method === "POST",
        ),
      ).toBe(true),
    );
  });

  test("shows the errorMapper validation message for a sensitive decision", async () => {
    const envelope = {
      code: "validation.sensitive_reason_required",
      message: "reason required",
    } as const;
    installFetch({ decision: { status: 422, body: envelope } });
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByTestId("permission-decision-section"),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(errorMapper(envelope).message),
    );
  });
});
