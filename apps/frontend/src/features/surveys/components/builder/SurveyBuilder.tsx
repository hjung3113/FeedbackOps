import { Button, Input } from '@fops/ui';
import { Check, Eye, Megaphone } from 'lucide-react';
import type { Survey } from '../../types';
import { SurveyStatusConfirmationDialog } from '../SurveyStatusConfirmationDialog';
import { PreviewPane } from './PreviewPane';
import { QuestionEditor } from './QuestionEditor';
import { QuestionList } from './QuestionList';
import { SurveySettings } from './SurveySettings';
import { useSurveyBuilderController } from './hooks/useSurveyBuilderController';

export function SurveyBuilder({
  survey,
  canManage,
  gateState,
  onBack,
}: {
  survey: Survey;
  canManage: boolean;
  gateState?: 'loading' | 'error' | 'absent';
  onBack: () => void;
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
    confirmLaunch,
    patch,
    add,
    remove,
    reorder,
    save,
  } = useSurveyBuilderController({ survey, canManage, gateState, onBack });

  return (
    <main className="flex h-full flex-col bg-surface-canvas" data-testid="survey-builder">
      <header className="flex h-toolbar items-center gap-3 border-b border-border-subtle px-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <div className="min-w-0 flex-1">
          {editable ? (
            <Input
              aria-label="Survey title"
              className="w-80 max-w-full border-transparent bg-transparent font-semibold"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
            />
          ) : (
            <h1 className="truncate font-semibold">{title}</h1>
          )}
          <span className="text-xs text-text-muted">
            {survey.status} · {survey.type}
          </span>
        </div>
        {editable && (
          <>
            <span className="text-xs text-text-muted">
              {dirty
                ? '저장되지 않은 변경 사항'
                : savedAt
                  ? `Saved at ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Synced'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!dirty || isSaving}
              onClick={() => void save()}
            >
              <Check className="h-4 w-4" />
              Save draft
            </Button>
          </>
        )}
        <Button variant="subtle" size="sm" onClick={() => setPreview(true)}>
          <Eye className="h-4 w-4" />
          Preview
        </Button>
        {editable && (
          <Button variant="default" size="sm" onClick={() => setLaunchOpen(true)}>
            <Megaphone className="h-4 w-4" />
            Launch
          </Button>
        )}
      </header>
      {!editable && (
        <div className="border-b border-border-subtle bg-surface-detail px-4 py-3 text-sm text-text-muted">
          {survey.status !== 'draft'
            ? `${survey.status} 상태 — 질문 변경은 잠겨 있습니다.`
            : '설문 관리 권한이 없습니다.'}
        </div>
      )}
      {saveFailed && (
        <div className="border-b border-border-subtle px-4 py-2 text-sm text-text-danger">
          저장하지 못했습니다.
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_300px]">
        <QuestionList
          questions={questions}
          editable={editable}
          selectedId={selectedId}
          onSelect={select}
          onRemove={remove}
          onAdd={add}
          onReorder={reorder}
        />
        <section className="min-w-0 overflow-auto p-5">
          {selected ? (
            <QuestionEditor
              question={selected}
              questions={questions}
              editable={editable}
              onChange={patch}
            />
          ) : (
            <p className="text-sm text-text-muted">질문을 선택하거나 새로 추가하세요.</p>
          )}
        </section>
        <SurveySettings survey={survey} />
      </div>
      {preview && (
        <PreviewPane survey={{ ...survey, questions }} onClose={() => setPreview(false)} />
      )}
      <SurveyStatusConfirmationDialog
        open={launchOpen}
        target="open"
        isPending={launchPending}
        error={launchError}
        onClose={() => setLaunchOpen(false)}
        onConfirm={confirmLaunch}
      />
    </main>
  );
}
