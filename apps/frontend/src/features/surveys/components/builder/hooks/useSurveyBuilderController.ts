import type { ApiError } from '@/lib/api';
import * as React from 'react';
import { useOpenSurvey, useSurveyQuestionMutations } from '../../../hooks/useSurveys';
import type { Survey, SurveyQuestion } from '../../../types';
import { applyServerQuestionId, denseQuestions, newQuestion } from '../lib/questionDraft';
import { saveSurveyDraft } from '../lib/saveSurveyDraft';

export function useSurveyBuilderController(args: {
  survey: Survey;
  canManage: boolean;
  gateState?: 'loading' | 'error' | 'absent' | undefined;
  onBack: () => void;
}): {
  title: string;
  onTitleChange: (value: string) => void;
  questions: SurveyQuestion[];
  selected: SurveyQuestion | null;
  selectedId: string | null;
  select: (id: string) => void;
  editable: boolean;
  dirty: boolean;
  savedAt: Date | null;
  isSaving: boolean;
  saveFailed: boolean;
  preview: boolean;
  setPreview: (open: boolean) => void;
  launchOpen: boolean;
  setLaunchOpen: (open: boolean) => void;
  launchPending: boolean;
  launchError: ApiError | null;
  confirmLaunch: () => void;
  patch: (next: SurveyQuestion) => void;
  add: () => void;
  remove: (id: string) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  save: () => Promise<void>;
} {
  const { survey, canManage, gateState, onBack } = args;
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
    const localQuestion = newQuestion(survey.id, questionsRef.current.length);
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
    updateQuestions((all) => applyServerQuestionId(all, localId, serverId));
    setSelectedId((current) => (current === localId ? serverId : current));
  };

  const onTitleChange = (value: string) => {
    titleRef.current = value;
    setTitle(value);
    setDirty(true);
    setSaveFailed(false);
  };

  const confirmLaunch = () => {
    openSurvey.mutate(undefined, {
      onSuccess: () => {
        setLaunchOpen(false);
        onBack();
      },
    });
  };

  const save = async () => {
    setIsSaving(true);
    setSaveFailed(false);
    try {
      const savedAt = await saveSurveyDraft({
        questionsRef,
        titleRef,
        savedTitleRef,
        savedQuestionsRef,
        replaceLocalId,
        updateQuestions,
        mutations: {
          updateSurvey: (body) => mutations.updateSurvey.mutateAsync(body),
          remove: (id) => mutations.remove.mutateAsync(id),
          create: (body) => mutations.create.mutateAsync(body),
          update: (args) => mutations.update.mutateAsync(args),
          reorder: (questionIds) => mutations.reorder.mutateAsync(questionIds),
        },
      });
      setSavedAt(savedAt);
      setDirty(false);
    } catch {
      setDirty(true);
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    title,
    onTitleChange,
    questions,
    selected,
    selectedId,
    select: setSelectedId,
    editable,
    dirty,
    savedAt,
    isSaving,
    saveFailed,
    preview,
    setPreview,
    launchOpen,
    setLaunchOpen,
    launchPending: openSurvey.isPending,
    launchError: openSurvey.error,
    confirmLaunch,
    patch,
    add,
    remove,
    reorder,
    save,
  };
}
