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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { errorMapper, type AdminPermissionRequestRow } from "@/lib/api";

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
    requests?: readonly AdminPermissionRequestRow[];
    actorId?: string;
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
      if (url.includes("/permissions/requests/") && init?.method === "POST") {
        return response(
          options.decision?.body ?? { id: requests[0].id, status: "approved" },
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

    fireEvent.click(screen.getByRole("tab", { name: /추가 정보 필요 \(1\)/ }));
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

    fireEvent.click(screen.getByRole("tab", { name: /승인됨 \(1\)/ }));

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
      expect(JSON.parse(init.body as string)).toEqual(expectedBody);
    },
  );

  test("AC-4 shows audit capture only for this Admin's approve action, not another request or another action", async () => {
    installFetch({ actorId: "actor-pending" });
    renderRoute();

    await waitFor(() =>
      expect(screen.getByTestId("self-approval-audit-capture")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "거절" }));
    expect(screen.queryByTestId("self-approval-audit-capture")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(screen.getByTestId("self-approval-audit-capture")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /추가 정보 필요 \(1\)/ }));
    await waitFor(() =>
      expect(screen.queryByTestId("self-approval-audit-capture")).not.toBeInTheDocument(),
    );
  });

  test("AC-5 requires two trimmed eight-character audit fields and posts their exact envelope", async () => {
    installFetch({ actorId: "actor-pending" });
    renderRoute();
    await waitFor(() =>
      expect(screen.getByTestId("self-approval-audit-capture")).toBeInTheDocument(),
    );

    const submit = screen.getByTestId("permission-decision-submit");
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Policy citation/), {
      target: { value: "  policy  " },
    });
    fireEvent.change(screen.getByLabelText(/Peer reviewer 부재 사유/), {
      target: { value: "  reviewer absence  " },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Policy citation/), {
      target: { value: "  policy-8  " },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(decisionPosts()).toHaveLength(1));
    const [, init] = decisionPosts()[0]!;
    expect(JSON.parse(init.body as string)).toEqual({
      self_approval: {
        policy_citation: "policy-8",
        peer_reviewer_absence: "reviewer absence",
      },
    });
  });

  test("AC-6 disables self-approval under forbidden workspace policy without posting", async () => {
    installFetch({ actorId: "actor-pending", selfApprovalPolicy: "forbidden" });
    renderRoute();
    await waitFor(() =>
      expect(screen.getByText(/Workspace policy에서 self-approval을 금지합니다/)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(screen.getByTestId("permission-decision-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    expect(decisionPosts()).toHaveLength(0);
  });

  test("AC-7 keeps self-approval enabled and handles a backend denial while workspace settings fail or remain unresolved", async () => {
    for (const selfApprovalPolicy of ["error", "pending"] as const) {
      installFetch({
        actorId: "actor-pending",
        selfApprovalPolicy,
        decision: {
          status: 403,
          body: { code: "permission.denied", message: "self-approval denied" },
        },
      });
      renderRoute();
      await waitFor(() =>
        expect(screen.getByTestId("self-approval-audit-capture")).toBeInTheDocument(),
      );
      expect(screen.getByRole("button", { name: "승인" })).toBeEnabled();
      fireEvent.change(screen.getByLabelText(/Policy citation/), {
        target: { value: "policy-8" },
      });
      fireEvent.change(screen.getByLabelText(/Peer reviewer 부재 사유/), {
        target: { value: "reviewer absence" },
      });
      fireEvent.click(screen.getByTestId("permission-decision-submit"));

      await waitFor(() => expect(decisionPosts()).toHaveLength(1));
      const [, init] = decisionPosts()[0]!;
      expect(JSON.parse(init.body as string)).toEqual({
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
        body: { code: "conflict.stale_write", message: "stale" },
      },
      onList: () => {
        listCalls += 1;
      },
    });
    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("이미 처리된 요청입니다."),
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

    fireEvent.click(screen.getByTestId("permission-decision-submit"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(errorMapper(envelope).message),
    );
  });
});
