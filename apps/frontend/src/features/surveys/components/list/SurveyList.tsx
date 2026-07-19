import { EmptyState, Input, Skeleton } from "@fops/ui";
import * as React from "react";
import type { Survey, SurveyStatus } from "../../types";

const statusLabel: Record<SurveyStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};
const tabs: Array<{ label: string; value: SurveyStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Draft", value: "draft" },
  { label: "Closed", value: "closed" },
];

export function SurveyList({
  surveys,
  isLoading,
  error,
  selectedId,
  onSelect,
}: {
  surveys: Survey[];
  isLoading: boolean;
  error: Error | null;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const [status, setStatus] = React.useState<SurveyStatus | "all">("all");
  const [search, setSearch] = React.useState("");
  const visible = surveys.filter(
    (survey) =>
      (status === "all" || survey.status === status) &&
      `${survey.display_id} ${survey.title}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  if (isLoading)
    return (
      <div className="space-y-2 p-4" data-testid="survey-list-skeleton">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  if (error)
    return (
      <div
        className="p-6 text-sm text-text-muted"
        data-testid="survey-list-error"
      >
        데이터를 불러오지 못했습니다.
      </div>
    );
  return (
    <div data-testid="survey-list">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2">
        <div className="flex gap-1" role="tablist" aria-label="Survey status">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              onClick={() => setStatus(tab.value)}
              className="rounded px-2 py-1 text-xs hover:bg-surface-card"
            >
              {tab.label}
              <span className="ml-1 text-text-muted">
                {tab.value === "all"
                  ? surveys.length
                  : surveys.filter((survey) => survey.status === tab.value)
                      .length}
              </span>
            </button>
          ))}
        </div>
        <Input
          aria-label="Survey 검색"
          className="ml-auto max-w-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Survey 검색…"
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="생성된 설문이 없습니다."
          body="설문을 만들어 응답을 수집하세요."
        />
      ) : (
        <div className="divide-y divide-border-subtle">
          {visible.map((survey) => (
            <button
              key={survey.id}
              type="button"
              onClick={() => onSelect(survey.id)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-card ${selectedId === survey.id ? "bg-surface-detail" : ""}`}
              data-testid={`survey-row-${survey.id}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-text-primary">
                  {survey.title}
                </span>
                <span className="flex flex-wrap gap-x-2 text-xs text-text-muted">
                  <span>{survey.display_id}</span>
                  <span>{survey.primary_managed_system_id}</span>
                  <span>{statusLabel[survey.status]}</span>
                  <span>{survey.type}</span>
                </span>
              </span>
              <span className="text-right text-xs text-text-muted">
                <span className="block">Responses</span>
                <span>{survey.status === "draft" ? "0 / —" : "— / —"}</span>
              </span>
              <span className="max-w-24 truncate text-xs text-text-muted">
                {survey.operator_actor_id ?? "Unassigned"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
