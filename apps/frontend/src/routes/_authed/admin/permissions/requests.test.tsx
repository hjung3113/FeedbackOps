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
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

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
    requester_actor_id: "actor-pending",
    requested_capability: "workspace.read",
    requested_managed_system_id: null,
    reason: "need access",
    status: "pending",
    created_at: "2026-07-17T00:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    requester_actor_id: "actor-info",
    requested_capability: "workspace.write",
    requested_managed_system_id: "system-1",
    reason: "need detail",
    status: "needs_more_info",
    created_at: "2026-07-16T00:00:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    requester_actor_id: "actor-approved",
    requested_capability: "workspace.admin",
    requested_managed_system_id: null,
    reason: "done",
    status: "approved",
    created_at: "2026-07-15T00:00:00.000Z",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    requester_actor_id: "actor-rejected",
    requested_capability: "workspace.delete",
    requested_managed_system_id: null,
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
  } = {},
) {
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/me/permissions/check"))
        return response({ state: "approved", decision: { allow: true } });
      if (
        url === "/permissions/requests?status=all" &&
        (!init?.method || init.method === "GET")
      ) {
        options.onList?.();
        return response({ requests: REQUESTS, count: REQUESTS.length });
      }
      if (url.includes("/permissions/requests/") && init?.method === "POST") {
        return response(
          options.decision?.body ?? { id: REQUESTS[0].id, status: "approved" },
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

describe("/admin/permissions/requests", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  test("renders five client tabs and filters mixed request statuses", async () => {
    installFetch();
    renderRoute();
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: /대기 중 \(1\)/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(
      within(screen.getByTestId("permission-requests-list")).getByText(
        "workspace.read",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /승인됨 \(1\)/ }));
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

  test.each([
    ["승인", "/approve", "", true],
    ["추가 정보 요청", "/need-more-info", "", true],
    ["거절", "/reject", "정책 사유", true],
    ["명시적 거부", "/deny", "명시적 거부 사유", true],
  ])(
    "posts %s to %s with an Idempotency-Key",
    async (action, suffix, reason, shouldPost) => {
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
        expect(posts.length > 0).toBe(shouldPost);
      });
      const [url, init] = (
        globalThis.fetch as ReturnType<typeof vi.fn>
      ).mock.calls.find(([, candidate]) => candidate?.method === "POST")!;
      expect(url).toBe(`/permissions/requests/${REQUESTS[0].id}${suffix}`);
      expect(new Headers(init.headers).get("Idempotency-Key")).toMatch(
        /^[0-9a-f-]{36}$/i,
      );
    },
  );

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
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(2));

    installFetch({
      decision: {
        status: 409,
        body: { code: "conflict.stale_write", message: "stale" },
      },
      onList: () => {
        listCalls += 1;
      },
    });
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("이미 처리된 요청입니다"),
    );
    await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(3));
  });
});
