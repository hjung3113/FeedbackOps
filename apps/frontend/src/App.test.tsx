import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const apiState = {
  dashboardFailuresByActor: new Set<string>(),
  vocs: [
    {
      id: "voc-api-1",
      managed_system_id: "ms-tableau",
      analytics_area_id: "aa-tableau-exec",
      reporter_id: "user-tableau",
      title: "API Tableau VOC",
      description: "Loaded from backend API.",
      severity: "medium",
      triage_state: "triaging",
      reporter_facing_status: "검토 중",
      owner_id: "dev-tableau"
    }
  ] as Array<{
    id: string;
    managed_system_id: string;
    analytics_area_id?: string;
    reporter_id: string;
    title: string;
    description: string;
    severity?: string;
    triage_state: string;
    reporter_facing_status: string;
    owner_id?: string;
  }>,
  findings: [] as Array<{ id: string; managed_system_id: string; title: string; summary: string; status: string; source_voc_id?: string }>,
  taskRequests: [] as Array<{
    id: string;
    managed_system_id: string;
    title: string;
    status: string;
    source_type: string;
    source_id: string;
    requested_by_id: string;
  }>,
  tasks: [] as Array<{ id: string; managed_system_id: string; title: string; status: string }>
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function requestActor(init?: RequestInit) {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.["x-actor-id"] ?? "";
}

function findFetchCall(path: string, method = "GET") {
  return vi.mocked(fetch).mock.calls.find(([input, init]) => {
    const url = new URL(input.toString(), "http://localhost:3000");
    return url.pathname === path && (init?.method ?? "GET") === method;
  });
}

function canReadTaskRequests(actorId: string) {
  return actorId === "admin" || actorId === "dev-tableau";
}

function canReadInternalExecution(actorId: string) {
  return actorId === "admin" || actorId === "dev-tableau";
}

beforeEach(() => {
  apiState.dashboardFailuresByActor = new Set();
  apiState.vocs = [
    {
      id: "voc-api-1",
      managed_system_id: "ms-tableau",
      analytics_area_id: "aa-tableau-exec",
      reporter_id: "user-tableau",
      title: "API Tableau VOC",
      description: "Loaded from backend API.",
      severity: "medium",
      triage_state: "triaging",
      reporter_facing_status: "검토 중",
      owner_id: "dev-tableau"
    }
  ];
  apiState.findings = [];
  apiState.taskRequests = [];
  apiState.tasks = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), "http://localhost:3000");
      const body = init?.body ? JSON.parse(init.body.toString()) : {};
      if (url.pathname === "/api/health") return jsonResponse({ ok: true });
      if (url.pathname === "/managed-systems") {
        return jsonResponse([
          { id: "ms-tableau", name: "Tableau", workspace_id: "ws-main" },
          { id: "ms-looker", name: "Looker", workspace_id: "ws-main" }
        ]);
      }
      if (url.pathname === "/analytics-areas") {
        return jsonResponse([{ id: "aa-tableau-exec", managed_system_id: "ms-tableau", name: "Executive Reporting" }]);
      }
      if (url.pathname === "/dashboard/action-queues") {
        const actorId = requestActor(init);
        if (apiState.dashboardFailuresByActor.has(actorId)) {
          return jsonResponse({ error: { code: "permission_denied", message: "Dashboard unavailable for current role." } }, 403);
        }
        return jsonResponse({
          high_severity_follow_up: apiState.findings.some((finding) => finding.source_voc_id === "voc-api-1")
            ? []
            : [{ id: "voc-api-1", title: "API Tableau VOC", next_action: "Create Finding or Task Request" }],
          task_requests_pending_review: apiState.taskRequests
            .filter((request) => request.status === "pending_review")
            .map((request) => ({ id: request.id, title: request.title, next_action: "Review Task Request" }))
        });
      }
      if (url.pathname === "/vocs/voc-api-1" && init?.method === "PATCH") {
        apiState.vocs = apiState.vocs.map((voc) =>
          voc.id === "voc-api-1"
            ? { ...voc, severity: body.severity, triage_state: body.triage_state, owner_id: body.owner_id }
            : voc
        );
        return jsonResponse(apiState.vocs[0]);
      }
      if (url.pathname === "/vocs/voc-api-1/public-updates" && init?.method === "POST") {
        return jsonResponse({ id: "conversation-public", type: "public_update", body: body.body }, 201);
      }
      if (url.pathname === "/vocs/voc-api-1/reporter-replies" && init?.method === "POST") {
        const actorId = requestActor(init);
        if (actorId !== "user-tableau") {
          return jsonResponse({ error: { code: "permission_denied", message: "Reporter Reply is limited to the VOC reporter." } }, 403);
        }
        return jsonResponse({ id: "conversation-reporter", type: "reporter_reply", body: body.body }, 201);
      }
      if (url.pathname === "/vocs/voc-api-1/internal-comments" && init?.method === "POST") {
        return jsonResponse({ id: "conversation-internal", type: "internal_comment", body: body.body }, 201);
      }
      if (url.pathname === "/vocs/voc-api-1/create-finding" && init?.method === "POST") {
        apiState.findings = [
          ...apiState.findings,
          { id: "finding-api-1", managed_system_id: "ms-tableau", title: body.title, summary: body.summary, status: "active", source_voc_id: "voc-api-1" }
        ];
        return jsonResponse(apiState.findings.at(-1), 201);
      }
      if (url.pathname === "/vocs" && init?.method === "POST") {
        apiState.vocs = [
          ...apiState.vocs,
          {
            id: "voc-created-api",
            managed_system_id: body.managed_system_id,
            analytics_area_id: body.analytics_area_id,
            reporter_id: requestActor(init),
            title: body.title,
            description: body.description,
            triage_state: "new",
            reporter_facing_status: "접수됨"
          }
        ];
        return jsonResponse(apiState.vocs.at(-1), 201);
      }
      if (url.pathname === "/vocs") {
        const managedSystemId = url.searchParams.get("managed_system_id");
        if (managedSystemId && managedSystemId !== "all") {
          return jsonResponse(apiState.vocs.filter((voc) => voc.managed_system_id === managedSystemId));
        }
        return jsonResponse(apiState.vocs);
      }
      if (url.pathname === "/findings/finding-api-1/request-task" && init?.method === "POST") {
        apiState.taskRequests = [
          ...apiState.taskRequests,
          {
            id: "task-request-api-1",
            managed_system_id: "ms-tableau",
            title: body.title,
            status: "pending_review",
            source_type: "finding",
            source_id: "finding-api-1",
            requested_by_id: requestActor(init)
          }
        ];
        return jsonResponse(apiState.taskRequests.at(-1), 201);
      }
      if (url.pathname === "/findings") {
        if (!canReadInternalExecution(requestActor(init))) {
          return jsonResponse({ error: { code: "permission_denied", message: "Findings require Developer or Admin access." } }, 403);
        }
        return jsonResponse(apiState.findings);
      }
      if (url.pathname === "/task-requests/task-request-api-1/approve" && init?.method === "POST") {
        apiState.taskRequests = apiState.taskRequests.map((request) => (request.id === "task-request-api-1" ? { ...request, status: "approved" } : request));
        return jsonResponse(apiState.taskRequests[0]);
      }
      if (url.pathname === "/task-requests/task-request-api-1/reject" && init?.method === "POST") {
        apiState.taskRequests = apiState.taskRequests.map((request) => (request.id === "task-request-api-1" ? { ...request, status: "rejected" } : request));
        return jsonResponse(apiState.taskRequests[0]);
      }
      if (url.pathname === "/task-requests/task-request-api-1/request-more-evidence" && init?.method === "POST") {
        apiState.taskRequests = apiState.taskRequests.map((request) =>
          request.id === "task-request-api-1" ? { ...request, status: "needs_more_evidence" } : request
        );
        return jsonResponse(apiState.taskRequests[0]);
      }
      if (url.pathname === "/task-requests/task-request-api-1/convert-to-task" && init?.method === "POST") {
        apiState.taskRequests = apiState.taskRequests.map((request) => (request.id === "task-request-api-1" ? { ...request, status: "converted" } : request));
        apiState.tasks = [{ id: "task-api-1", managed_system_id: "ms-tableau", title: "Task from request", status: "Backlog" }];
        return jsonResponse(apiState.tasks[0], 201);
      }
      if (url.pathname === "/task-requests") {
        if (!canReadTaskRequests(requestActor(init))) {
          return jsonResponse({ error: { code: "permission_denied", message: "Task Requests require Developer or Admin access." } }, 403);
        }
        return jsonResponse(apiState.taskRequests);
      }
      if (url.pathname === "/tasks") {
        if (!canReadInternalExecution(requestActor(init))) {
          return jsonResponse({ error: { code: "permission_denied", message: "Tasks require Developer or Admin access." } }, 403);
        }
        return jsonResponse(apiState.tasks);
      }
      return jsonResponse({ error: { code: "not_found", message: "Missing mock route" } }, 404);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FeedbackOps frontend MVP shell", () => {
  it("renders Home as an action dashboard first screen", () => {
    render(<App initialPath="/" />);

    expect(screen.getByRole("heading", { name: "Action Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("renders docs-aligned Admin navigation", () => {
    render(<App initialPath="/" />);

    for (const label of ["Home", "My Work", "VOC", "Surveys", "Tasks", "Integration", "Admin"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("renders VOC list/detail with separate reporter and internal status plus composers", () => {
    render(<App initialPath="/vocs?selected=voc-seeded-tableau" />);

    expect(screen.getByRole("heading", { name: "VOC Inbox" })).toBeInTheDocument();
  });

  it("loads VOC rows and detail from the backend API", async () => {
    render(<App initialPath="/vocs?selected=voc-api-1" />);

    expect(await screen.findAllByText("API Tableau VOC")).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/vocs?managed_system_id=ms-tableau"), expect.objectContaining({ headers: expect.any(Object) }));
    expect(screen.queryByText("Seeded Tableau VOC")).not.toBeInTheDocument();
    expect(screen.getByText("Reporter status")).toBeInTheDocument();
    expect(screen.getByText("검토 중")).toHaveAttribute("data-family", "reporter-voc");
    expect(screen.getByText("Internal triage")).toBeInTheDocument();
    const detail = screen.getByLabelText("API Tableau VOC");
    expect(within(detail).getAllByText("triaging").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Public Update")).toBeInTheDocument();
    expect(screen.getByLabelText("Reporter Reply")).toBeInTheDocument();
    expect(screen.getByLabelText("Internal Comment")).toBeInTheDocument();
  });

  it("submits VOC creation to the backend and refreshes the list", async () => {
    render(<App initialPath="/vocs" />);

    fireEvent.change(await screen.findByLabelText("VOC title"), { target: { value: "Created through UI" } });
    fireEvent.change(screen.getByLabelText("VOC description"), { target: { value: "Saved to backend API." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit VOC" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/vocs"), expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(screen.getAllByText("Created through UI")).toHaveLength(2));
  });

  it("uses the active role switch actor for VOC creation", async () => {
    render(<App initialPath="/vocs" />);

    fireEvent.change(await screen.findByLabelText("Role Level"), { target: { value: "dev-tableau" } });
    fireEvent.change(await screen.findByLabelText("VOC title"), { target: { value: "Developer authored VOC" } });
    fireEvent.change(screen.getByLabelText("VOC description"), { target: { value: "Reporter is derived from the active actor." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit VOC" }));

    await waitFor(() => expect(findFetchCall("/vocs", "POST")?.[1]).toMatchObject({ headers: expect.objectContaining({ "x-actor-id": "dev-tableau" }) }));
    expect(apiState.vocs.at(-1)?.reporter_id).toBe("dev-tableau");
  });

  it("uses the active role switch actor for public updates and reporter replies", async () => {
    render(<App initialPath="/vocs?selected=voc-api-1" />);

    fireEvent.change(await screen.findByLabelText("Role Level"), { target: { value: "dev-tableau" } });
    fireEvent.change(await screen.findByLabelText("Public Update"), { target: { value: "Developer public update" } });
    fireEvent.click(screen.getByRole("button", { name: "Post Public Update" }));
    await waitFor(() =>
      expect(findFetchCall("/vocs/voc-api-1/public-updates", "POST")?.[1]).toMatchObject({
        headers: expect.objectContaining({ "x-actor-id": "dev-tableau" })
      })
    );

    fireEvent.change(screen.getByLabelText("Reporter Reply"), { target: { value: "Developer should not be silently impersonated" } });
    fireEvent.click(screen.getByRole("button", { name: "Post Reporter Reply" }));
    await waitFor(() =>
      expect(findFetchCall("/vocs/voc-api-1/reporter-replies", "POST")?.[1]).toMatchObject({
        headers: expect.objectContaining({ "x-actor-id": "dev-tableau" })
      })
    );
    expect(await screen.findByText("Reporter Reply is limited to the VOC reporter.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Role Level"), { target: { value: "user-tableau" } });
    fireEvent.change(await screen.findByLabelText("Reporter Reply"), { target: { value: "Reporter-authored reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Post Reporter Reply" }));
    await waitFor(() => {
      const reporterReplyCalls = vi.mocked(fetch).mock.calls.filter(([input, init]) => {
        const url = new URL(input.toString(), "http://localhost:3000");
        return url.pathname === "/vocs/voc-api-1/reporter-replies" && init?.method === "POST";
      });
      expect(reporterReplyCalls.at(-1)?.[1]).toMatchObject({ headers: expect.objectContaining({ "x-actor-id": "user-tableau" }) });
    });
  });

  it("clears a stale dashboard error after a successful role refetch", async () => {
    apiState.dashboardFailuresByActor.add("admin");
    render(<App initialPath="/" />);

    expect(await screen.findByText("Dashboard unavailable for current role.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Role Level"), { target: { value: "dev-tableau" } });

    expect(await screen.findByText("API Tableau VOC")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Dashboard unavailable for current role.")).not.toBeInTheDocument());
  });

  it("filters VOC API requests by selected Managed System and clears stale detail", async () => {
    render(<App initialPath="/vocs" />);

    expect(await screen.findAllByText("API Tableau VOC")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Managed System"), { target: { value: "ms-looker" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/vocs?managed_system_id=ms-looker"), expect.any(Object)));
    expect(await screen.findByText("No records")).toBeInTheDocument();
    expect(screen.getByText("Select a VOC")).toBeInTheDocument();
  });

  it("renders backend permission_denied as a blocked Task Requests state for User role", async () => {
    render(<App initialPath="/tasks?view=requests" />);

    fireEvent.change(screen.getByLabelText("Role Level"), { target: { value: "user-tableau" } });

    expect(await screen.findAllByText("Task Requests require Developer or Admin access.")).toHaveLength(2);
    expect(screen.getAllByText("Request access")).toHaveLength(2);
  });

  it("hides VOC internal execution controls for User while reporter surfaces remain usable", async () => {
    render(<App initialPath="/vocs?selected=voc-api-1" />);

    expect(await screen.findAllByText("API Tableau VOC")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Role Level"), { target: { value: "user-tableau" } });

    expect(await screen.findByText("Internal execution actions require Developer or Admin access.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Triage state")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Severity")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Owner")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save triage" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Public Update")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post Public Update" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Internal Comment")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post Internal Comment" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Finding title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Finding summary")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Finding" })).not.toBeInTheDocument();

    expect(screen.getByLabelText("VOC title")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Submit VOC" })).toBeEnabled();
    expect(screen.getByLabelText("Reporter Reply")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Post Reporter Reply" })).toBeEnabled();
    expect(screen.getByText("Reporter status")).toBeInTheDocument();
  });

  it("blocks User from Finding detail actions and hides Request Task", async () => {
    apiState.findings = [{ id: "finding-api-1", managed_system_id: "ms-tableau", title: "Finding from backend", summary: "Evidence summary", status: "active" }];
    render(<App initialPath="/integration/findings?selected=finding-api-1" />);

    expect(await screen.findAllByText("Finding from backend")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Role Level"), { target: { value: "user-tableau" } });

    expect(await screen.findAllByText("Findings require Developer or Admin access.")).toHaveLength(2);
    expect(screen.getAllByText("Request access")).toHaveLength(2);
    expect(screen.queryByLabelText("Task Request title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request Task" })).not.toBeInTheDocument();
  });

  it("blocks User from Task backstage lists and review controls", async () => {
    apiState.taskRequests = [
      {
        id: "task-request-api-1",
        managed_system_id: "ms-tableau",
        title: "Task request from backend",
        status: "pending_review",
        source_type: "finding",
        source_id: "finding-api-1",
        requested_by_id: "dev-tableau"
      }
    ];
    apiState.tasks = [{ id: "task-api-1", managed_system_id: "ms-tableau", title: "Task from backend", status: "Backlog" }];
    render(<App initialPath="/tasks?view=requests&selected=task-request-api-1" />);

    expect(await screen.findAllByText("Task request from backend")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Role Level"), { target: { value: "user-tableau" } });

    expect(await screen.findAllByText("Task Requests require Developer or Admin access.")).toHaveLength(2);
    expect(screen.getAllByText("Request access")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request more evidence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convert to Task" })).not.toBeInTheDocument();
    expect(screen.queryByText("Task from backend")).not.toBeInTheDocument();
  });

  it("runs the operator vertical slice through backend API actions", async () => {
    render(<App initialPath="/vocs?selected=voc-api-1" />);

    fireEvent.change(await screen.findByLabelText("Role Level"), { target: { value: "Admin" } });
    fireEvent.change(screen.getByLabelText("Triage state"), { target: { value: "triaged" } });
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "dev-tableau" } });
    fireEvent.click(screen.getByRole("button", { name: "Save triage" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/vocs/voc-api-1"), expect.objectContaining({ method: "PATCH" })));
    expect(await screen.findByText("high")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Public Update"), { target: { value: "Reporter-safe update" } });
    fireEvent.click(screen.getByRole("button", { name: "Post Public Update" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/vocs/voc-api-1/public-updates"), expect.objectContaining({ method: "POST" })));

    fireEvent.change(screen.getByLabelText("Finding title"), { target: { value: "Finding from UI" } });
    fireEvent.change(screen.getByLabelText("Finding summary"), { target: { value: "Evidence summary from selected VOC." } });
    fireEvent.click(screen.getByRole("button", { name: "Create Finding" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/vocs/voc-api-1/create-finding"), expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Finding from UI")).toBeInTheDocument();

    cleanup();
    render(<App initialPath="/integration/findings?selected=finding-api-1" />);
    expect(await screen.findAllByText("Finding from UI")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Task Request title"), { target: { value: "Task Request from UI" } });
    fireEvent.click(screen.getByRole("button", { name: "Request Task" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/findings/finding-api-1/request-task"), expect.objectContaining({ method: "POST" })));

    cleanup();
    render(<App initialPath="/tasks?view=requests&selected=task-request-api-1" />);
    expect(await screen.findAllByText("Task Request from UI")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/task-requests/task-request-api-1/approve"), expect.objectContaining({ method: "POST" })));
    fireEvent.click(screen.getByRole("button", { name: "Convert to Task" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/task-requests/task-request-api-1/convert-to-task"), expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(screen.getAllByText("Backlog").some((node) => node.getAttribute("data-family") === "task")).toBe(true));
  });

  it("renders permission blocked content with safe summary", () => {
    render(<App initialPath="/integration/findings?selected=restricted-finding" />);

    expect(screen.getByText("Summary visible to reporter")).toBeInTheDocument();
    expect(screen.getByText("Request access")).toBeInTheDocument();
    expect(screen.queryByText("Private root-cause notes")).not.toBeInTheDocument();
  });

  it("does not expose Survey Response to VOC conversion", () => {
    render(<App initialPath="/surveys/survey-1/results" />);

    expect(screen.getByRole("heading", { name: "Survey Results" })).toBeInTheDocument();
    expect(screen.queryByText(/Create VOC/i)).not.toBeInTheDocument();
    expect(screen.getByText("Create Finding")).toBeInTheDocument();
  });
});
