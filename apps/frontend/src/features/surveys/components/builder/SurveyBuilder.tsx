import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@fops/ui';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  Megaphone,
  Plus,
  Trash2,
} from 'lucide-react';
import * as React from 'react';
import { useOpenSurvey, useSurveyQuestionMutations } from '../../hooks/useSurveys';
import type { QuestionInput, QuestionKind, Survey, SurveyQuestion } from '../../types';
import { SurveyStatusConfirmationDialog } from '../SurveyStatusConfirmationDialog';

const kinds: Array<{ value: QuestionKind; label: string }> = [
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'rating', label: 'Rating' },
  { value: 'text', label: 'Text' },
];

function newQuestion(surveyId: string, sortOrder: number): SurveyQuestion {
  return {
    id: `local-${crypto.randomUUID()}`,
    survey_id: surveyId,
    kind: 'single_choice',
    prompt: '새 질문',
    is_required: false,
    options: [
      { key: 'option-1', label: 'Option 1' },
      { key: 'option-2', label: 'Option 2' },
    ],
    rating_min: null,
    rating_max: null,
    rating_low_label: null,
    rating_high_label: null,
    sort_order: sortOrder,
    branch_depth: 0,
    branch_parent_question_id: null,
    branch_trigger_option_key: null,
  };
}

function toInput(question: SurveyQuestion): QuestionInput {
  const input: QuestionInput = {
    kind: question.kind,
    prompt: question.prompt,
    is_required: question.is_required,
    sort_order: question.sort_order,
  };
  if (question.options) input.options = question.options;
  if (question.rating_min !== null) input.rating_min = question.rating_min;
  if (question.rating_max !== null) input.rating_max = question.rating_max;
  if (question.rating_low_label !== null) input.rating_low_label = question.rating_low_label;
  if (question.rating_high_label !== null) input.rating_high_label = question.rating_high_label;
  if (question.branch_parent_question_id)
    input.branch_parent_question_id = question.branch_parent_question_id;
  if (question.branch_trigger_option_key)
    input.branch_trigger_option_key = question.branch_trigger_option_key;
  return input;
}

function toUpdateInput(question: SurveyQuestion, persisted: SurveyQuestion): QuestionInput {
  const input = toInput(question);
  // Omission means "leave as is". Clearing a persisted branch is the only
  // falsy transition that must cross the wire explicitly (#192/#194).
  if (persisted.branch_parent_question_id && !question.branch_parent_question_id)
    input.branch_parent_question_id = null;
  return input;
}

function questionSignature(question: SurveyQuestion): string {
  return JSON.stringify({
    ...toInput(question),
    branch_parent_question_id: question.branch_parent_question_id,
    branch_trigger_option_key: question.branch_trigger_option_key,
  });
}

function denseQuestions(questions: SurveyQuestion[]): SurveyQuestion[] {
  return questions.map((question, sortOrder) => ({ ...question, sort_order: sortOrder }));
}

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
  const [questions, setQuestions] = React.useState<SurveyQuestion[]>(survey.questions ?? []);
  const questionsRef = React.useRef(questions);
  const [title, setTitle] = React.useState(survey.title);
  const titleRef = React.useRef(title);
  const savedTitleRef = React.useRef(survey.title);
  const savedQuestionsRef = React.useRef<SurveyQuestion[]>(survey.questions ?? []);
  const [selectedId, setSelectedId] = React.useState<string | null>(questions[0]?.id ?? null);
  const [dirty, setDirty] = React.useState(survey.status === 'draft' && questions.length === 0);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [launchOpen, setLaunchOpen] = React.useState(false);
  const mutations = useSurveyQuestionMutations(survey.id);
  const openSurvey = useOpenSurvey(survey.id);
  const editable = canManage && survey.status === 'draft' && !gateState;
  const selected = questions.find((question) => question.id === selectedId) ?? null;
  const updateQuestions = (update: (current: SurveyQuestion[]) => SurveyQuestion[]) => {
    const next = update(questionsRef.current);
    questionsRef.current = next;
    setQuestions(next);
  };

  const patch = (next: SurveyQuestion) => {
    updateQuestions((all) => all.map((question) => (question.id === next.id ? next : question)));
    setDirty(true);
    setSaveFailed(false);
  };

  const add = () => {
    const localQuestion = newQuestion(survey.id, questions.length);
    updateQuestions((all) => [...all, localQuestion]);
    setSelectedId(localQuestion.id);
    setDirty(true);
    setSaveFailed(false);
  };

  const remove = (id: string) => {
    updateQuestions((all) => {
      const next = all.filter((question) => question.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return denseQuestions(next);
    });
    setDirty(true);
    setSaveFailed(false);
  };

  const reorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    updateQuestions((all) => {
      const next = [...all];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return all;
      next.splice(toIndex, 0, moved);
      return denseQuestions(next);
    });
    setDirty(true);
    setSaveFailed(false);
  };

  const replaceLocalId = (localId: string, serverId: string) => {
    updateQuestions((all) =>
      all.map((question) => ({
        ...question,
        id: question.id === localId ? serverId : question.id,
        branch_parent_question_id:
          question.branch_parent_question_id === localId
            ? serverId
            : question.branch_parent_question_id,
      })),
    );
    setSelectedId((current) => (current === localId ? serverId : current));
  };

  const save = async () => {
    setIsSaving(true);
    setSaveFailed(false);
    try {
      if (titleRef.current !== savedTitleRef.current)
        await mutations.updateSurvey.mutateAsync({ title: titleRef.current });

      const persisted = savedQuestionsRef.current;
      for (const question of persisted) {
        if (!questionsRef.current.some((candidate) => candidate.id === question.id))
          await mutations.remove.mutateAsync(question.id);
      }

      for (const local of questionsRef.current.filter((question) => question.id.startsWith('local-'))) {
        const current = questionsRef.current.find((question) => question.id === local.id);
        if (!current) continue;
        let sentSignature = questionSignature(current);
        const created = await mutations.create.mutateAsync(toInput(current));
        replaceLocalId(local.id, created.id);
        let latest = questionsRef.current.find((question) => question.id === created.id);
        while (latest && questionSignature(latest) !== sentSignature) {
          sentSignature = questionSignature(latest);
          await mutations.update.mutateAsync({ id: created.id, body: toInput(latest) });
          latest = questionsRef.current.find((question) => question.id === created.id);
        }
      }

      for (const persistedQuestion of persisted) {
        let current = questionsRef.current.find(
          (question) => question.id === persistedQuestion.id,
        );
        if (!current || questionSignature(current) === questionSignature(persistedQuestion))
          continue;
        let sentSignature = questionSignature(current);
        await mutations.update.mutateAsync({
          id: current.id,
          body: toUpdateInput(current, persistedQuestion),
        });
        current = questionsRef.current.find((question) => question.id === persistedQuestion.id);
        while (current && questionSignature(current) !== sentSignature) {
          sentSignature = questionSignature(current);
          await mutations.update.mutateAsync({
            id: current.id,
            body: toUpdateInput(current, persistedQuestion),
          });
          current = questionsRef.current.find((question) => question.id === persistedQuestion.id);
        }
      }

      const nextQuestions = denseQuestions(questionsRef.current);
      const previousIds = persisted.map((question) => question.id);
      const nextIds = nextQuestions.map((question) => question.id);
      const orderChanged =
        previousIds.length !== nextIds.length ||
        previousIds.some((id, index) => id !== nextIds[index]);
      if (orderChanged) await mutations.reorder.mutateAsync(nextIds);
      updateQuestions(() => nextQuestions);
      savedQuestionsRef.current = nextQuestions;
      savedTitleRef.current = titleRef.current;
      setSavedAt(new Date());
      setDirty(false);
    } catch {
      setDirty(true);
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
    }
  };

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
              onChange={(event) => {
                titleRef.current = event.target.value;
                setTitle(event.target.value);
                setDirty(true);
                setSaveFailed(false);
              }}
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
          onSelect={setSelectedId}
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
        isPending={openSurvey.isPending}
        error={openSurvey.error}
        onClose={() => setLaunchOpen(false)}
        onConfirm={() =>
          openSurvey.mutate(undefined, {
            onSuccess: () => {
              setLaunchOpen(false);
              onBack();
            },
          })
        }
      />
    </main>
  );
}

function QuestionList({
  questions,
  editable,
  selectedId,
  onSelect,
  onRemove,
  onAdd,
  onReorder,
}: {
  questions: SurveyQuestion[];
  editable: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  return (
    <section className="border-r border-border-subtle p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">Questions {questions.length}</span>
        {editable && (
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4" />새 질문 추가
          </Button>
        )}
      </div>
      <div className="space-y-1">
        {questions.map((question, index) => (
          <div
            key={question.id}
            draggable={editable}
            data-testid={`survey-question-row-${question.id}`}
            data-drag-over={overIndex === index ? 'true' : undefined}
            onDragStart={(event) => {
              if (!editable) return;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', String(index));
              setDragIndex(index);
            }}
            onDragOver={(event) => {
              if (!editable) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setOverIndex(index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null) onReorder(dragIndex, index);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            className={`relative w-full rounded text-left text-sm hover:bg-surface-card ${selectedId === question.id ? 'bg-surface-card' : ''} ${overIndex === index ? 'ring-2 ring-focus-ring' : ''}`}
          >
            <button
              type="button"
              onClick={() => onSelect(question.id)}
              className="flex w-full items-center gap-2 px-2 py-2 pr-28 text-left"
            >
              {editable && <GripVertical className="h-3.5 w-3.5" aria-label="질문 드래그 핸들" />}
              <span>Q{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{question.prompt || '제목 없음'}</span>
            </button>
            {editable && (
              <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onReorder(index, index - 1)}
                  aria-label={`Q${index + 1} 위로 이동`}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onReorder(index, index + 1)}
                  aria-label={`Q${index + 1} 아래로 이동`}
                  disabled={index === questions.length - 1}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(question.id)}
                  aria-label="질문 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SurveySettings({ survey }: { survey: Survey }) {
  return (
    <aside className="border-l border-border-subtle p-4">
      <p className="text-xs uppercase text-text-muted">Survey settings</p>
      <p className="mt-3 text-sm">Managed System</p>
      <p className="break-all text-xs text-text-muted">{survey.primary_managed_system_id}</p>
      <p className="mt-5 text-sm">응답 익명성</p>
      <p className="text-xs text-text-muted">
        {survey.responses_identity_protected
          ? '응답은 익명으로 처리되며 개인을 식별할 수 없습니다.'
          : '응답에 개인 식별자가 포함될 수 있으니 관련 정책을 확인하세요.'}
      </p>
      <p className="mt-5 text-xs text-text-muted">Survey Response → VOC 생성은 금지됩니다.</p>
    </aside>
  );
}

function QuestionEditor({
  question,
  questions,
  editable,
  onChange,
}: {
  question: SurveyQuestion;
  questions: SurveyQuestion[];
  editable: boolean;
  onChange: (question: SurveyQuestion) => void;
}) {
  const set = (patch: Partial<SurveyQuestion>) => onChange({ ...question, ...patch });
  const parent = questions.find((candidate) => candidate.id === question.branch_parent_question_id);
  const parents = questions.filter(
    (candidate) =>
      candidate.id !== question.id &&
      candidate.kind === 'single_choice' &&
      !candidate.branch_parent_question_id,
  );
  return (
    <div className="space-y-4">
      <label className="block text-sm" htmlFor="question-kind">
        Question kind
        <Select
          value={question.kind}
          disabled={!editable}
          onValueChange={(kind) => set(questionForKind(question, kind as QuestionKind))}
        >
          <SelectTrigger id="question-kind" aria-label="Question kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((kind) => (
              <SelectItem key={kind.value} value={kind.value}>
                {kind.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="block text-sm" htmlFor="question-title">
        Question title
        <Textarea
          id="question-title"
          value={question.prompt}
          disabled={!editable}
          onChange={(event) => set({ prompt: event.target.value })}
        />
      </label>
      {(question.kind === 'single_choice' || question.kind === 'multiple_choice') && (
        <OptionsEditor question={question} editable={editable} onChange={set} />
      )}
      {question.kind === 'rating' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            aria-label="최소 점수"
            type="number"
            value={question.rating_min ?? 1}
            disabled={!editable}
            onChange={(event) => set({ rating_min: Number(event.target.value) })}
          />
          <Input
            aria-label="최대 점수"
            type="number"
            value={question.rating_max ?? 5}
            disabled={!editable}
            onChange={(event) => set({ rating_max: Number(event.target.value) })}
          />
        </div>
      )}
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={question.is_required}
          disabled={!editable}
          onChange={(event) => set({ is_required: event.target.checked })}
        />
        필수 질문
      </label>
      {editable && (
        <BranchEditor
          question={question}
          parents={parents}
          onChange={set}
          {...(parent ? { parent } : {})}
        />
      )}
    </div>
  );
}

function questionForKind(question: SurveyQuestion, kind: QuestionKind): Partial<SurveyQuestion> {
  const choice = kind === 'single_choice' || kind === 'multiple_choice';
  return {
    kind,
    options: choice
      ? (question.options ?? [
          { key: 'option-1', label: 'Option 1' },
          { key: 'option-2', label: 'Option 2' },
        ])
      : null,
    rating_min: kind === 'rating' ? 1 : null,
    rating_max: kind === 'rating' ? 5 : null,
    rating_low_label: kind === 'rating' ? question.rating_low_label : null,
    rating_high_label: kind === 'rating' ? question.rating_high_label : null,
  };
}

function BranchEditor({
  question,
  parent,
  parents,
  onChange,
}: {
  question: SurveyQuestion;
  parent?: SurveyQuestion;
  parents: SurveyQuestion[];
  onChange: (patch: Partial<SurveyQuestion>) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm">
        조건부로 다음 질문을 보여주기 (one-level)
        <select
          aria-label="분기 부모 질문"
          className="mt-1 w-full rounded border border-border-subtle bg-surface-canvas p-2"
          value={question.branch_parent_question_id ?? ''}
          onChange={(event) => {
            const parentId = event.target.value;
            const nextParent = parents.find((candidate) => candidate.id === parentId);
            onChange({
              branch_parent_question_id: parentId || null,
              branch_trigger_option_key: nextParent?.options?.[0]?.key ?? null,
            });
          }}
        >
          <option value="">분기 없음</option>
          {parents.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.prompt || candidate.id}
            </option>
          ))}
        </select>
      </label>
      {parent && (
        <label className="block text-sm">
          표시 조건 옵션
          <select
            aria-label="분기 조건 옵션"
            className="mt-1 w-full rounded border border-border-subtle bg-surface-canvas p-2"
            value={question.branch_trigger_option_key ?? ''}
            onChange={(event) =>
              onChange({
                branch_trigger_option_key: event.target.value || null,
              })
            }
          >
            {(parent.options ?? []).map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function OptionsEditor({
  question,
  editable,
  onChange,
}: {
  question: SurveyQuestion;
  editable: boolean;
  onChange: (patch: Partial<SurveyQuestion>) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm">Options</p>
      {(question.options ?? []).map((option, index) => (
        <Input
          key={option.key}
          value={option.label}
          disabled={!editable}
          onChange={(event) =>
            onChange({
              options: (question.options ?? []).map((item, current) =>
                current === index ? { ...item, label: event.target.value } : item,
              ),
            })
          }
        />
      ))}
    </div>
  );
}

function PreviewPane({
  survey,
  onClose,
}: {
  survey: Survey;
  onClose: () => void;
}) {
  const [answers, setAnswers] = React.useState<Record<string, string | string[] | number>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const questions = (survey.questions ?? []).filter((question) => {
    if (!question.branch_parent_question_id || !question.branch_trigger_option_key) return true;
    const answer = answers[question.branch_parent_question_id];
    return Array.isArray(answer)
      ? answer.includes(question.branch_trigger_option_key)
      : answer === question.branch_trigger_option_key;
  });
  return (
    <dialog
      open
      className="fixed inset-0 z-50 grid grid-cols-[1fr_480px] bg-black/20"
      aria-label="Respondent preview"
    >
      <button type="button" aria-label="미리보기 닫기" onClick={onClose} />
      <section className="overflow-auto bg-surface-canvas p-6">
        <div className="flex justify-between">
          <p className="text-sm font-medium">Respondent preview</p>
          <Button size="sm" variant="ghost" onClick={onClose}>
            닫기
          </Button>
        </div>
        {submitted ? (
          <div className="mt-10 text-center">
            <p className="font-medium">응답이 제출되었습니다</p>
            <p className="mt-2 text-sm text-text-muted">
              미리보기 — 실제 응답은 저장되지 않습니다.
            </p>
            <Button
              className="mt-4"
              size="sm"
              onClick={() => {
                setAnswers({});
                setSubmitted(false);
              }}
            >
              다시 시작
            </Button>
          </div>
        ) : (
          <>
            <h2 className="mt-6 text-xl font-semibold">{survey.title || '제목 없음'}</h2>
            <p className="mt-1 text-sm text-text-muted">
              {survey.description || '아직 설명이 추가되지 않았습니다.'}
            </p>
            <p className="mt-3 rounded bg-surface-detail p-3 text-sm">
              익명성 안내 ·{' '}
              {survey.responses_identity_protected
                ? '응답은 익명으로 처리되며 개인을 식별할 수 없습니다.'
                : '응답에 개인 식별자가 포함될 수 있으니 관련 정책을 확인하세요.'}
            </p>
            <div className="mt-6 space-y-6">
              {questions.map((question) => (
                <div key={question.id}>
                  <p className="text-sm font-medium">
                    Q{(survey.questions ?? []).indexOf(question) + 1}.{' '}
                    {question.prompt || '제목 없음'}
                    {question.is_required && ' *'}
                  </p>
                  <PreviewInput
                    question={question}
                    value={answers[question.id]}
                    onChange={(value) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <footer className="mt-8 flex items-center justify-between border-t border-border-subtle pt-4 text-xs text-text-muted">
              <span>
                {questions.length}개 질문 · {Object.keys(answers).length}개 응답
              </span>
              <Button size="sm" onClick={() => setSubmitted(true)}>
                제출 (미리보기)
              </Button>
            </footer>
          </>
        )}
      </section>
    </dialog>
  );
}

function PreviewInput({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  value: string | string[] | number | undefined;
  onChange: (value: string | string[] | number) => void;
}) {
  if (question.kind === 'text')
    return (
      <Textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder="자유롭게 적어주세요…"
      />
    );
  if (question.kind === 'rating')
    return (
      <div className="mt-2 flex gap-2">
        {Array.from(
          {
            length: (question.rating_max ?? 5) - (question.rating_min ?? 1) + 1,
          },
          (_, index) => {
            const score = (question.rating_min ?? 1) + index;
            return (
              <button
                key={score}
                type="button"
                aria-pressed={value === score}
                onClick={() => onChange(score)}
                className="h-8 w-8 rounded-full border border-border-subtle"
              >
                {score}
              </button>
            );
          },
        )}
      </div>
    );
  return (
    <div className="mt-2 space-y-2">
      {(question.options ?? []).map((option) => {
        const checked =
          question.kind === 'single_choice'
            ? value === option.key
            : Array.isArray(value) && value.includes(option.key);
        return (
          <label key={option.key} className="flex gap-2 text-sm">
            <input
              type={question.kind === 'single_choice' ? 'radio' : 'checkbox'}
              name={question.id}
              checked={checked}
              onChange={() => {
                if (question.kind === 'single_choice') onChange(option.key);
                else {
                  const current = Array.isArray(value) ? value : [];
                  onChange(
                    checked
                      ? current.filter((item) => item !== option.key)
                      : [...current, option.key],
                  );
                }
              }}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
