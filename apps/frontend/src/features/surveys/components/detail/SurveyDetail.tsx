import { SURVEY_TYPE_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { SURVEY_PARTICIPATION_COPY } from '@/lib/copy/survey-participation';
import { Button, DetailPanelHeader, EmptyState, PanelTitleBlock } from '@fops/ui';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';
import { useCloseSurvey } from '../../hooks/useSurveys';
import type { Survey } from '../../types';
import { SurveyManagedSystemPill } from '../SurveyManagedSystemPill';
import { SurveyStatusBadge, surveyStatusLabel } from '../SurveyStatusBadge';
import { SurveyStatusConfirmationDialog } from '../SurveyStatusConfirmationDialog';

export function SurveyDetail({
  survey,
  canManage,
  onClose,
  managedSystemNamesById,
  actorNamesById,
}: {
  survey: Survey;
  canManage: boolean;
  onClose?: () => void;
  managedSystemNamesById?: ReadonlyMap<string, string> | undefined;
  actorNamesById?: ReadonlyMap<string, string> | undefined;
}) {
  const questions = survey.questions ?? [];
  const [closeOpen, setCloseOpen] = React.useState(false);
  const closeSurvey = useCloseSurvey(survey.id);
  const operatorName = survey.operator_actor_id
    ? actorNamesById === undefined
      ? '—'
      : (actorNamesById.get(survey.operator_actor_id) ?? GLOSSARY.unknownUser)
    : '담당자 미지정';
  const canEditQuestions = canManage && survey.status === 'draft';
  const builderAction = canEditQuestions ? (
    <Button asChild variant="primary" size="sm">
      <Link to="/surveys/$surveyId" params={{ surveyId: survey.id }} search={{ builder: true }}>
        {SURVEY_PARTICIPATION_COPY.editQuestions}
      </Link>
    </Button>
  ) : undefined;
  return (
    <aside
      className="flex h-full flex-col border-l border-border-subtle bg-surface-detail"
      data-testid="survey-detail"
    >
      <DetailPanelHeader
        kind="survey"
        id={survey.display_id}
        {...(onClose !== undefined ? { onClose } : {})}
        {...(builderAction !== undefined ? { extras: builderAction } : {})}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border-subtle pb-4">
          <PanelTitleBlock
            className="px-5"
            title={survey.title}
            badges={
              <>
                <SurveyStatusBadge status={survey.status} />
                <span className="inline-flex items-center rounded border border-border-subtle px-1.5 py-0.5 text-xs text-text-secondary">
                  {SURVEY_TYPE_LABELS[survey.type]}
                </span>
                <SurveyManagedSystemPill
                  name={managedSystemNamesById?.get(survey.primary_managed_system_id)}
                  resolved={managedSystemNamesById !== undefined}
                />
              </>
            }
          />
          <p className="px-5 text-xs text-text-muted">담당자 · {operatorName}</p>
          <p className="mt-2 px-5 text-sm text-text-muted">
            {survey.description || '설명이 없습니다.'}
          </p>
          {canManage && survey.status === 'open' && (
            <div className="mt-3 px-5">
              <Button variant="secondary" size="sm" onClick={() => setCloseOpen(true)}>
                Survey 종료
              </Button>
            </div>
          )}
        </div>
        {!canEditQuestions && (
          <section className="mt-6 px-5">
            <h2 className="mb-2 text-sm font-medium">Survey 빌더</h2>
            <p className="text-sm text-text-muted">
              {survey.status === 'draft'
                ? 'Survey 관리 권한이 없습니다.'
                : `${surveyStatusLabel(survey.status)} 상태 — 질문 변경은 잠겨 있습니다.`}
            </p>
          </section>
        )}
        <section className="mt-6 px-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">결과 요약</h2>
            {(survey.status === 'open' || survey.status === 'closed') && (
              <Button asChild variant="subtle" size="sm">
                <Link to="/surveys/$surveyId/results" params={{ surveyId: survey.id }}>
                  <ArrowRight className="h-4 w-4" aria-hidden />
                  결과 요약 보기
                </Link>
              </Button>
            )}
          </div>
          <p className="rounded bg-surface-canvas p-3 text-sm text-text-muted">
            응답이 수집되면 요약과 패턴이 여기에 표시됩니다.
          </p>
        </section>
        <section className="mt-6 px-5">
          <h2 className="mb-2 text-sm font-medium">질문</h2>
          {questions.length ? (
            <ol className="space-y-2">
              {questions.map((question, index) => (
                <li key={question.id} className="text-sm text-text-secondary">
                  Q{index + 1}. {question.prompt}
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              size="sm"
              title="질문이 없습니다."
              {...(canEditQuestions
                ? {
                    action: (
                      <Button asChild size="sm">
                        <Link
                          to="/surveys/$surveyId"
                          params={{ surveyId: survey.id }}
                          search={{ builder: true }}
                        >
                          {SURVEY_PARTICIPATION_COPY.addFirstQuestion}
                        </Link>
                      </Button>
                    ),
                  }
                : {})}
            />
          )}
        </section>
        <section className="mt-6 space-y-3 px-5 pb-5 text-sm">
          <div>
            <h2 className="font-medium">권한 경계</h2>
            <p className="text-text-muted">Survey 응답은 VOC를 생성하지 않습니다.</p>
          </div>
          <div>
            <h2 className="font-medium">개인정보</h2>
            <p className="text-text-muted">
              {survey.responses_identity_protected
                ? '응답은 익명으로 처리됩니다.'
                : '응답자 식별 정책을 확인하세요.'}
            </p>
          </div>
        </section>
      </div>
      <SurveyStatusConfirmationDialog
        open={closeOpen}
        target="close"
        isPending={closeSurvey.isPending}
        error={closeSurvey.error}
        onClose={() => setCloseOpen(false)}
        onConfirm={() =>
          closeSurvey.mutate(undefined, {
            onSuccess: () => setCloseOpen(false),
          })
        }
      />
    </aside>
  );
}
