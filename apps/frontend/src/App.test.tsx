import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const apiState = {
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
  }>
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
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
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), "http://localhost:3000");
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
        return jsonResponse({
          high_severity_follow_up: [{ id: "voc-high-unlinked", title: "High severity API VOC", next_action: "Create Finding or Task Request" }],
          task_requests_pending_review: [{ id: "task-request-1", title: "API Task Request", next_action: "Review Task Request" }]
        });
      }
      if (url.pathname === "/vocs" && init?.method === "POST") {
        apiState.vocs = [
          ...apiState.vocs,
          {
            id: "voc-created-api",
            managed_system_id: "ms-tableau",
            reporter_id: "user-tableau",
            title: "Created through UI",
            description: "Saved to backend API.",
            triage_state: "new",
            reporter_facing_status: "접수됨"
          }
        ];
        return jsonResponse(apiState.vocs.at(-1), 201);
      }
      if (url.pathname === "/vocs") return jsonResponse(apiState.vocs);
      if (url.pathname === "/findings") return jsonResponse([]);
      if (url.pathname === "/task-requests") return jsonResponse([]);
      if (url.pathname === "/tasks") return jsonResponse([]);
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
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/vocs?managed_system_id=all"), expect.objectContaining({ headers: expect.any(Object) }));
    expect(screen.queryByText("Seeded Tableau VOC")).not.toBeInTheDocument();
    expect(screen.getByText("Reporter status")).toBeInTheDocument();
    expect(screen.getByText("검토 중")).toHaveAttribute("data-family", "reporter-voc");
    expect(screen.getByText("Internal triage")).toBeInTheDocument();
    const detail = screen.getByLabelText("API Tableau VOC");
    expect(within(detail).getByText("triaging")).toBeInTheDocument();
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
    expect(await screen.findAllByText("Created through UI")).toHaveLength(2);
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
