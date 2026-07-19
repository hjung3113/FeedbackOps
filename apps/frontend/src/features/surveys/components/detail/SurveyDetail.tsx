import { EmptyState } from "@fops/ui";
import { Link } from "@tanstack/react-router";
import type { Survey } from "../../types";

export function SurveyDetail({
  survey,
  canManage,
  onClose,
}: {
  survey: Survey;
  canManage: boolean;
  onClose?: () => void;
}) {
  const questions = survey.questions ?? [];
  return (
    <aside
      className="flex h-full flex-col border-l border-border-subtle bg-surface-detail p-5"
      data-testid="survey-detail"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs text-text-muted">
            {survey.display_id} · {survey.type}
          </p>
          <h1 className="text-lg font-semibold text-text-primary">
            {survey.title}
          </h1>
          <p className="text-sm text-text-muted">
            {survey.description || "설명이 없습니다."}
          </p>
          <span className="inline-flex rounded-full bg-surface-canvas px-2 py-1 text-xs">
            {survey.status}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close survey detail"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium">Builder</h2>
        {canManage && survey.status === "draft" ? (
          <Link
            to="/surveys/$surveyId"
            params={{ surveyId: survey.id }}
            search={{ builder: true }}
            className="inline-flex rounded-md bg-accent-primary px-3 py-2 text-sm font-medium text-white"
          >
            Continue building
          </Link>
        ) : (
          <p className="text-sm text-text-muted">
            {survey.status === "draft"
              ? "설문 관리 권한이 없습니다."
              : "Open 상태 — 질문 변경은 잠겨 있습니다."}
          </p>
        )}
      </section>
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium">Result summary</h2>
        <p className="rounded bg-surface-canvas p-3 text-sm text-text-muted">
          응답이 수집되면 요약과 패턴이 여기에 표시됩니다.
        </p>
      </section>
      <section className="mt-6 flex-1">
        <h2 className="mb-2 text-sm font-medium">Questions</h2>
        {questions.length ? (
          <ol className="space-y-2">
            {questions.map((question, index) => (
              <li key={question.id} className="text-sm text-text-secondary">
                Q{index + 1}. {question.prompt}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState size="sm" title="질문이 없습니다." />
        )}
      </section>
      <section className="mt-6 space-y-3 text-sm">
        <div>
          <h2 className="font-medium">Guardrail</h2>
          <p className="text-text-muted">
            Survey Response는 VOC를 생성하지 않습니다.
          </p>
        </div>
        <div>
          <h2 className="font-medium">Privacy</h2>
          <p className="text-text-muted">
            {survey.responses_identity_protected
              ? "응답은 익명으로 처리됩니다."
              : "응답자 식별 정책을 확인하세요."}
          </p>
        </div>
      </section>
    </aside>
  );
}
