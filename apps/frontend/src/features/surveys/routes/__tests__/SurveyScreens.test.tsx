import * as React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SurveyBuilder } from "../../components/builder/SurveyBuilder";
import { SurveyDetail } from "../../components/detail/SurveyDetail";
import { SurveyList } from "../../components/list/SurveyList";
import type { Survey, SurveyQuestion } from "../../types";

const { apiClient } = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiClient }));

const survey: Survey = {
  id: "survey-1",
  display_id: "SRV-1",
  title: "Q3 사용성 진단",
  type: "discovery",
  status: "draft",
  description: "설문 설명",
  primary_managed_system_id: "system-1",
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: "actor-1",
  opened_at: null,
  closed_at: null,
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
  questions: [
    {
      id: "question-1",
      survey_id: "survey-1",
      kind: "single_choice",
      prompt: "도움이 되었나요?",
      is_required: true,
      options: [
        { key: "yes", label: "예" },
        { key: "no", label: "아니오" },
      ],
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      sort_order: 0,
      branch_depth: 0,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
  ],
};
function renderWithQuery(node: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

describe("Survey screens", () => {
  beforeEach(() => {
    apiClient.mockReset();
    apiClient.mockImplementation(async (_method: string, path: string) => ({
      data: path.endsWith("/questions")
        ? { id: "question-created" }
        : { id: "question-1" },
    }));
  });
  it("renders list rows, empty, loading, and error states without a Create VOC affordance", () => {
    const select = vi.fn();
    const { rerender } = render(
      <SurveyList
        surveys={[survey]}
        isLoading={false}
        error={null}
        onSelect={select}
      />,
    );
    expect(screen.getByText("Q3 사용성 진단")).toBeInTheDocument();
    expect(screen.queryByText("Create VOC")).not.toBeInTheDocument();
    expect(screen.queryByTestId(/create-voc/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /create voc/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Q3 사용성 진단"));
    expect(select).toHaveBeenCalledWith("survey-1");
    fireEvent.click(screen.getByRole("button", { name: "카드 보기" }));
    expect(screen.getByTestId("survey-list-cards")).toBeInTheDocument();
    expect(screen.getByText("— / —")).toBeInTheDocument();
    rerender(
      <SurveyList
        surveys={[]}
        isLoading={false}
        error={null}
        onSelect={select}
      />,
    );
    expect(screen.getByText("생성된 설문이 없습니다.")).toBeInTheDocument();
    rerender(
      <SurveyList surveys={[]} isLoading error={null} onSelect={select} />,
    );
    expect(screen.getByTestId("survey-list-skeleton")).toBeInTheDocument();
    rerender(
      <SurveyList
        surveys={[]}
        isLoading={false}
        error={new Error("failed")}
        onSelect={select}
      />,
    );
    expect(screen.getByTestId("survey-list-error")).toBeInTheDocument();
  });

  it("keeps a non-draft builder read-only", () => {
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, status: "open" }}
        canManage
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.getByText("open 상태 — 질문 변경은 잠겨 있습니다."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "새 질문 추가" }),
    ).not.toBeInTheDocument();
  });

  it("renders the actual closed status in builder and detail lock copy", () => {
    const closedSurvey = { ...survey, status: "closed" as const };
    const { rerender } = renderWithQuery(<SurveyBuilder survey={closedSurvey} canManage onBack={vi.fn()} />);
    expect(screen.getByText("closed · discovery")).toBeInTheDocument();
    expect(screen.getByText("closed 상태 — 질문 변경은 잠겨 있습니다.")).toBeInTheDocument();
    rerender(<QueryClientProvider client={new QueryClient()}><SurveyDetail survey={closedSurvey} canManage /></QueryClientProvider>);
    expect(screen.getByText("closed 상태 — 질문 변경은 잠겨 있습니다.")).toBeInTheDocument();
  });

  it("renders a survey detail title, type, status, and questions", () => {
    render(<SurveyDetail survey={survey} canManage={false} />);

    expect(screen.getByText("Q3 사용성 진단")).toBeInTheDocument();
    expect(screen.getByText("SRV-1 · discovery")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("Q1. 도움이 되었나요?")).toBeInTheDocument();
  });

  it.each(["single_choice", "multiple_choice", "rating", "text"] as const)(
    "sends a strict PATCH payload when changing to %s",
    async (kind) => {
      renderWithQuery(
        <SurveyBuilder survey={survey} canManage onBack={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole("combobox", { name: "Question kind" }));
      fireEvent.click(screen.getByRole("option", { name: kind }));
      if (kind === "single_choice") {
        fireEvent.change(screen.getByDisplayValue("도움이 되었나요?"), {
          target: { value: "수정된 단일 선택" },
        });
      }
      await waitFor(() =>
        expect(apiClient).toHaveBeenCalledWith(
          "PATCH",
          "/surveys/survey-1/questions/question-1",
          expect.objectContaining({ body: expect.any(Object) }),
        ),
      );
      const body = apiClient.mock.calls.at(-1)?.[2].body;
      expect(body).not.toHaveProperty("rating_min", null);
      expect(body).not.toHaveProperty("rating_max", null);
      expect(body).not.toHaveProperty("options", null);
      expect(body).not.toHaveProperty("branch_parent_question_id", null);
    },
  );

  it("creates, edits, and deletes a question through the survey question endpoints", async () => {
    renderWithQuery(
      <SurveyBuilder survey={survey} canManage onBack={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "새 질문 추가" }));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        "POST",
        "/surveys/survey-1/questions",
        expect.objectContaining({ body: expect.any(Object) }),
      ),
    );
    const createBody = apiClient.mock.calls.find(
      (call) => call[0] === "POST",
    )?.[2].body;
    expect(createBody).toMatchObject({
      kind: "single_choice",
      prompt: "새 질문",
    });
    expect(createBody).not.toHaveProperty("rating_min");
    expect(createBody).not.toHaveProperty("branch_parent_question_id");
    fireEvent.change(screen.getByDisplayValue("새 질문"), {
      target: { value: "수정된 질문" },
    });
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        "PATCH",
        "/surveys/survey-1/questions/question-created",
        expect.any(Object),
      ),
    );
    fireEvent.click(screen.getAllByLabelText("질문 삭제").at(-1)!);
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        "DELETE",
        "/surveys/survey-1/questions/question-created",
      ),
    );
  });

  it("patches the current question state after an edit during its pending create", async () => {
    let resolveCreate: ((value: { data: { id: string } }) => void) | undefined;
    apiClient.mockImplementation((method: string, path: string) => {
      if (method === "POST" && path.endsWith("/questions")) return new Promise((resolve) => { resolveCreate = resolve; });
      return Promise.resolve({ data: { id: "question-created" } });
    });
    renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "새 질문 추가" }));
    await waitFor(() => expect(resolveCreate).toBeDefined());
    fireEvent.change(screen.getByDisplayValue("새 질문"), { target: { value: "POST 중 수정" } });
    await act(async () => resolveCreate?.({ data: { id: "question-created" } }));
    await waitFor(() => expect(apiClient).toHaveBeenCalledWith("PATCH", "/surveys/survey-1/questions/question-created", expect.objectContaining({ body: expect.objectContaining({ prompt: "POST 중 수정" }) })));
  });

  it("recreates a persisted branched question when its branch is removed", async () => {
    const parentQuestion = survey.questions?.[0] as SurveyQuestion;
    const child: SurveyQuestion = { ...parentQuestion, id: "question-2", prompt: "추가 질문", branch_depth: 1, branch_parent_question_id: "question-1", branch_trigger_option_key: "no", sort_order: 1 };
    renderWithQuery(<SurveyBuilder survey={{ ...survey, questions: [...(survey.questions ?? []), child] }} canManage onBack={vi.fn()} />);
    fireEvent.click(screen.getByText("Q2"));
    fireEvent.change(screen.getByLabelText("분기 부모 질문"), { target: { value: "" } });
    await waitFor(() => expect(apiClient).toHaveBeenCalledWith("DELETE", "/surveys/survey-1/questions/question-2"));
    await waitFor(() => expect(apiClient).toHaveBeenCalledWith("POST", "/surveys/survey-1/questions", expect.objectContaining({ body: expect.objectContaining({ prompt: "추가 질문", sort_order: 1 }) })));
    const deleteIndex = apiClient.mock.calls.findIndex(
      (call) => call[0] === "DELETE" && call[1] === "/surveys/survey-1/questions/question-2",
    );
    const recreateIndex = apiClient.mock.calls.findIndex(
      (call) => call[0] === "POST" && call[1] === "/surveys/survey-1/questions" && call[2].body.prompt === "추가 질문",
    );
    expect(deleteIndex).toBeLessThan(recreateIndex);
    const recreateBody = apiClient.mock.calls.find((call) => call[0] === "POST" && call[1] === "/surveys/survey-1/questions" && call[2].body.prompt === "추가 질문")?.[2].body;
    expect(recreateBody).not.toHaveProperty("branch_parent_question_id");
    expect(recreateBody).not.toHaveProperty("branch_trigger_option_key");
  });

  it("disables a question editor while removing its branch", async () => {
    let resolveDelete: (() => void) | undefined;
    apiClient.mockImplementation((method: string, path: string) => {
      if (method === "DELETE" && path.endsWith("/question-2")) {
        return new Promise((resolve) => {
          resolveDelete = () => resolve({ data: {} });
        });
      }
      return Promise.resolve({ data: { id: "question-recreated" } });
    });
    const parentQuestion = survey.questions?.[0] as SurveyQuestion;
    const child: SurveyQuestion = { ...parentQuestion, id: "question-2", prompt: "추가 질문", branch_depth: 1, branch_parent_question_id: "question-1", branch_trigger_option_key: "no", sort_order: 1 };
    renderWithQuery(<SurveyBuilder survey={{ ...survey, questions: [...(survey.questions ?? []), child] }} canManage onBack={vi.fn()} />);
    fireEvent.click(screen.getByText("Q2"));
    fireEvent.change(screen.getByLabelText("분기 부모 질문"), { target: { value: "" } });
    await waitFor(() => expect(resolveDelete).toBeDefined());
    const title = screen.getByDisplayValue("추가 질문");
    expect(title).toBeDisabled();
    fireEvent.change(title, { target: { value: "삭제 중 수정" } });
    expect(apiClient).not.toHaveBeenCalledWith("PATCH", "/surveys/survey-1/questions/question-2", expect.anything());
    await act(async () => resolveDelete?.());
    await waitFor(() => expect(screen.getByDisplayValue("추가 질문")).not.toBeDisabled());
  });

  it("uses the selected parent option to reveal a branched preview question", async () => {
    const parentQuestion = survey.questions?.[0] as SurveyQuestion;
    const child: SurveyQuestion = {
      ...parentQuestion,
      id: "question-2",
      prompt: "추가 질문",
      branch_depth: 1,
      branch_parent_question_id: "question-1",
      branch_trigger_option_key: "no",
      sort_order: 1,
    };
    renderWithQuery(
      <SurveyBuilder
        survey={{ ...survey, questions: [...survey.questions!, child] }}
        canManage
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Q2"));
    fireEvent.change(screen.getByLabelText("분기 조건 옵션"), {
      target: { value: "yes" },
    });
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        "PATCH",
        "/surveys/survey-1/questions/question-2",
        expect.objectContaining({
          body: expect.objectContaining({ branch_trigger_option_key: "yes" }),
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const preview = screen.getByRole("dialog");
    expect(
      within(preview).queryByText(/Q2\. 추가 질문/),
    ).not.toBeInTheDocument();
    fireEvent.click(within(preview).getByLabelText("예"));
    expect(within(preview).getByText(/Q2\. 추가 질문/)).toBeInTheDocument();
  });

  it("does not expose a Create VOC affordance in detail or builder surfaces", () => {
    const { rerender } = renderWithQuery(
      <SurveyDetail survey={survey} canManage={false} />,
    );
    expect(screen.queryByText("Create VOC")).not.toBeInTheDocument();
    expect(screen.queryByTestId(/create-voc/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /create voc/i }),
    ).not.toBeInTheDocument();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <SurveyBuilder survey={survey} canManage onBack={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Create VOC")).not.toBeInTheDocument();
    expect(screen.queryByTestId(/create-voc/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /create voc/i }),
    ).not.toBeInTheDocument();
  });

  it.each(["loading", "error", "absent"] as const)(
    "does not expose builder mutations when survey.manage is %s",
    (state) => {
      renderWithQuery(
        <SurveyBuilder
          survey={survey}
          canManage={false}
          gateState={state}
          onBack={vi.fn()}
        />,
      );
      expect(
        screen.queryByRole("button", { name: "새 질문 추가" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("설문 생성")).not.toBeInTheDocument();
    },
  );
});
