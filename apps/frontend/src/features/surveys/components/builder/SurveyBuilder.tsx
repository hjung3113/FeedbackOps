import { SURVEY_TYPE_LABELS } from '@/lib/copy/enum-labels';
import { SURVEY_BUILDER_COPY } from '@/lib/copy/survey-builder';
import { formatTime } from '@/lib/format/datetime';
import { surveyQuestionKindSchema } from '@fops/shared';
import { Button, Input, WorkbenchShell } from '@fops/ui';
import { Check, Megaphone } from 'lucide-react';
import type { QuestionKind, Survey } from '../../types';
import { SurveyManagedSystemPill } from '../SurveyManagedSystemPill';
import { SurveyStatusBadge, surveyStatusLabel } from '../SurveyStatusBadge';
import { SurveyStatusConfirmationDialog } from '../SurveyStatusConfirmationDialog';
import { PreviewPane } from './PreviewPane';
import { QuestionEditor } from './QuestionEditor';
import { QuestionList } from './QuestionList';
import { SurveySettings } from './SurveySettings';
import { useSurveyBuilderController } from './hooks/useSurveyBuilderController';

const FIRST_QUESTION_COPY: Record<QuestionKind, { label: string; help: string }> = {
  single_choice: { label: '단일 선택', help: '하나의 답변을 고릅니다.' },
  multiple_choice: { label: '복수 선택', help: '여러 개의 답변을 고릅니다.' },
  rating: { label: '척도', help: '점수 범위로 평가합니다.' },
  text: { label: '주관식', help: '직접 답변을 작성합니다.' },
};

function FirstQuestionOnboarding({ onAdd }: { onAdd: (kind: QuestionKind) => void }) {
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-8">
      <div className="w-full max-w-2xl text-center">
        <h2 className="text-base font-semibold text-text-primary">첫 질문을 추가하세요</h2>
        <p className="mt-2 text-sm text-text-muted">
          질문 유형을 고르면 바로 편집을 시작합니다. 나중에 유형을 바꾸거나 질문을 더 추가할 수
          있습니다.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 text-left">
          {surveyQuestionKindSchema.options.map((kind) => {
            const copy = FIRST_QUESTION_COPY[kind];
            return (
              <button
                key={kind}
                type="button"
                onClick={() => onAdd(kind)}
                className="rounded-md border border-border-subtle bg-surface-detail p-4 text-left hover:border-border-strong hover:bg-surface-card focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-primary"
                data-testid={`survey-question-kind-${kind}`}
                data-question-kind={kind}
              >
                <span className="block text-sm font-medium text-text-primary">{copy.label}</span>
                <span className="mt-1 block text-xs text-text-muted">{copy.help}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SurveyBuilder({
  survey,
  canManage,
  gateState,
  managedSystemNamesById,
  onBack,
  onDirtyChange,
}: {
  survey: Survey;
  canManage: boolean;
  gateState?: 'loading' | 'error' | 'absent';
  managedSystemNamesById?: ReadonlyMap<string, string> | undefined;
  onBack: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const {
    title,
    onTitleChange,
    questions,
    selected,
    selectedId,
    select,
    editable,
    dirty,
    savedAt,
    isSaving,
    saveFailed,
    preview,
    setPreview,
    launchOpen,
    setLaunchOpen,
    launchPending,
    launchError,
    launchSaveFailed,
    confirmLaunch,
    patch,
    add,
    remove,
    reorder,
    save,
  } = useSurveyBuilderController({
    survey,
    canManage,
    gateState,
    onBack,
    ...(onDirtyChange ? { onDirtyChange } : {}),
  });

  const builderPage = (
    <main className="flex h-full flex-col bg-surface-canvas" data-testid="survey-builder">
      <header
        className="flex h-toolbar items-center gap-3 border-b border-border-subtle px-4"
        data-shell-header="toolbar"
        data-testid="survey-builder-toolbar"
        data-toolbar-height="50"
      >
        <Button variant="ghost" size="sm" onClick={onBack}>
          뒤로
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {editable ? (
            <Input
              aria-label="Survey 제목"
              className={
                // oxlint-disable-next-line shadcn/no-restyle -- the editable survey title is styled as heading text inside the builder toolbar
                'w-80 min-w-0 max-w-full border-transparent bg-transparent font-semibold'
              }
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
            />
          ) : (
            <h1 className="min-w-0 truncate font-semibold">{title}</h1>
          )}
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-text-muted">
            <SurveyStatusBadge status={survey.status} />
            <span className="shrink-0">{SURVEY_TYPE_LABELS[survey.type]}</span>
            <SurveyManagedSystemPill
              name={managedSystemNamesById?.get(survey.primary_managed_system_id)}
              resolved={managedSystemNamesById !== undefined}
            />
          </div>
        </div>
        {editable && (
          <>
            <span className="text-xs text-text-muted">
              {dirty
                ? '저장되지 않은 변경 사항'
                : savedAt
                  ? `저장 시각 ${formatTime(savedAt.toISOString())}`
                  : '동기화됨'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!dirty || isSaving}
              onClick={() => void save()}
            >
              <Check className="h-4 w-4" />
              초안 저장
            </Button>
          </>
        )}
        <PreviewPane survey={{ ...survey, questions }} open={preview} onOpenChange={setPreview} />
        {editable && (
          <>
            {questions.length === 0 && (
              <span id="survey-start-hint" className="text-xs text-text-muted">
                {SURVEY_BUILDER_COPY.addQuestionBeforeLaunch}
              </span>
            )}
            <Button
              variant="default"
              size="sm"
              disabled={questions.length === 0}
              {...(questions.length === 0 ? { 'aria-describedby': 'survey-start-hint' } : {})}
              onClick={() => setLaunchOpen(true)}
            >
              <Megaphone className="h-4 w-4" />
              Survey 시작
            </Button>
          </>
        )}
      </header>
      {!editable && (
        <div className="border-b border-border-subtle bg-surface-detail px-4 py-3 text-sm text-text-muted">
          {survey.status !== 'draft'
            ? `${surveyStatusLabel(survey.status)} 상태 — 질문 변경은 잠겨 있습니다.`
            : 'Survey 관리 권한이 없습니다.'}
        </div>
      )}
      {saveFailed && (
        <div className="border-b border-border-subtle px-4 py-2 text-sm text-text-danger-label">
          저장하지 못했습니다.
        </div>
      )}
      <div
        className={`grid min-h-0 flex-1 ${questions.length === 0 && editable ? 'grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-[280px_minmax(0,1fr)_300px]'}`}
      >
        {questions.length === 0 ? (
          !editable && <div aria-hidden="true" className="border-r border-border-subtle" />
        ) : (
          <QuestionList
            questions={questions}
            editable={editable}
            selectedId={selectedId}
            onSelect={select}
            onRemove={remove}
            onAdd={() => add()}
            onReorder={reorder}
          />
        )}
        <section className="min-w-0 overflow-auto p-5">
          {selected ? (
            <QuestionEditor
              question={selected}
              questions={questions}
              editable={editable}
              onChange={patch}
            />
          ) : questions.length === 0 && editable ? (
            <FirstQuestionOnboarding onAdd={add} />
          ) : questions.length === 0 ? (
            <p className="text-sm text-text-muted">질문이 없습니다.</p>
          ) : (
            <p className="text-sm text-text-muted">질문을 선택하거나 새로 추가하세요.</p>
          )}
        </section>
        <SurveySettings
          survey={survey}
          managedSystemName={managedSystemNamesById?.get(survey.primary_managed_system_id)}
          managedSystemResolved={managedSystemNamesById !== undefined}
        />
      </div>
      <SurveyStatusConfirmationDialog
        open={launchOpen}
        target="open"
        isPending={launchPending}
        error={launchError}
        {...(launchSaveFailed ? { saveError: SURVEY_BUILDER_COPY.launchSaveFailed } : {})}
        onClose={() => setLaunchOpen(false)}
        onConfirm={confirmLaunch}
      />
    </main>
  );

  return <WorkbenchShell>{builderPage}</WorkbenchShell>;
}
