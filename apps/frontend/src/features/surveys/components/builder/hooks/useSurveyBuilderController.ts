import type { ApiError } from '@/lib/api';
import * as React from 'react';
import { useOpenSurvey, useSurveyQuestionMutations } from '../../../hooks/useSurveys';
import type { QuestionKind, Survey, SurveyQuestion } from '../../../types';
import { hasInvalidChoiceOptions } from '../lib/optionValidation';
import {
  applyServerQuestionId,
  denseQuestions,
  newQuestion,
  questionSignature,
} from '../lib/questionDraft';
import { saveSurveyDraft } from '../lib/saveSurveyDraft';

function hasInvalidQuestion(question: SurveyQuestion): boolean {
  return question.prompt.trim().length === 0 || hasInvalidChoiceOptions(question);
}

export function useSurveyBuilderController(args: {
  survey: Survey;
  canManage: boolean;
  gateState?: 'loading' | 'error' | 'absent' | undefined;
  onBack: () => void;
  onDirtyChange?: (dirty: boolean) => void;
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
  launchSaveFailed: boolean;
  launchOptionValidationFailed: boolean;
  confirmLaunch: () => void;
  patch: (next: SurveyQuestion) => void;
  add: (kind?: QuestionKind) => void;
  remove: (id: string) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  save: () => Promise<boolean>;
} {
  const { survey, canManage, gateState, onBack } = args;
  const [questions, setQuestions] = React.useState<SurveyQuestion[]>(survey.questions ?? []);
  const questionsRef = React.useRef(questions);
  const [title, setTitle] = React.useState(survey.title);
  const titleRef = React.useRef(title);
  const savedTitleRef = React.useRef(survey.title);
  const savedQuestionsRef = React.useRef<SurveyQuestion[]>(survey.questions ?? []);
  const [selectedId, setSelectedId] = React.useState<string | null>(questions[0]?.id ?? null);
  const [dirty, setDirty] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [launchOpen, setLaunchOpenState] = React.useState(false);
  const [launchSaveFailed, setLaunchSaveFailed] = React.useState(false);
  const [launchOptionValidationFailed, setLaunchOptionValidationFailed] = React.useState(false);
  const mutations = useSurveyQuestionMutations(survey.id);
  const openSurvey = useOpenSurvey(survey.id);
  const editable = canManage && survey.status === 'draft' && !gateState;
  const selected = questions.find((question) => question.id === selectedId) ?? null;
  const updateDirty = (next: boolean) => {
    setDirty(next);
    args.onDirtyChange?.(next);
  };
  const setLaunchOpen = (open: boolean) => {
    setLaunchOpenState(open);
    if (open) {
      setLaunchSaveFailed(false);
      setLaunchOptionValidationFailed(false);
    }
  };
  const updateQuestions = (update: (current: SurveyQuestion[]) => SurveyQuestion[]) => {
    const next = update(questionsRef.current);
    questionsRef.current = next;
    setQuestions(next);
  };

  const patch = (next: SurveyQuestion) => {
    updateQuestions((all) => {
      const current = all.find((question) => question.id === next.id);
      if (!current) return all;
      const nextKeys = new Set(next.options?.map((option) => option.key) ?? []);
      const removedKeys = new Set(
        (current.options ?? []).map((option) => option.key).filter((key) => !nextKeys.has(key)),
      );
      const firstRemainingKey = next.options?.[0]?.key ?? null;
      return all.map((question) => {
        if (question.id === next.id) return next;
        if (
          question.branch_parent_question_id !== next.id ||
          !question.branch_trigger_option_key ||
          !removedKeys.has(question.branch_trigger_option_key)
        )
          return question;
        return firstRemainingKey
          ? { ...question, branch_trigger_option_key: firstRemainingKey }
          : {
              ...question,
              branch_depth: 0,
              branch_parent_question_id: null,
              branch_trigger_option_key: null,
            };
      });
    });
    updateDirty(true);
    setSaveFailed(false);
  };

  const add = (kind: QuestionKind = 'single_choice') => {
    const localQuestion = newQuestion(survey.id, questionsRef.current.length, kind);
    updateQuestions((all) => [...all, localQuestion]);
    setSelectedId(localQuestion.id);
    updateDirty(true);
    setSaveFailed(false);
  };

  const remove = (id: string) => {
    updateQuestions((all) => {
      const next = all.filter((question) => question.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return denseQuestions(next);
    });
    updateDirty(true);
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
    updateDirty(true);
    setSaveFailed(false);
  };

  const replaceLocalId = (localId: string, serverId: string) => {
    updateQuestions((all) => applyServerQuestionId(all, localId, serverId));
    setSelectedId((current) => (current === localId ? serverId : current));
  };

  const onTitleChange = (value: string) => {
    titleRef.current = value;
    setTitle(value);
    updateDirty(true);
    setSaveFailed(false);
  };

  const confirmLaunch = () => {
    setLaunchSaveFailed(false);
    setLaunchOptionValidationFailed(false);
    void (async () => {
      const invalidQuestion = questionsRef.current.find(hasInvalidQuestion);
      if (invalidQuestion) {
        setSelectedId(invalidQuestion.id);
        if (invalidQuestion.prompt.trim().length === 0) setLaunchOpen(false);
        else setLaunchOptionValidationFailed(true);
        return;
      }
      if (dirty && !(await save())) {
        setLaunchSaveFailed(true);
        return;
      }
      openSurvey.mutate(undefined, {
        onSuccess: () => {
          setLaunchOpen(false);
          onBack();
        },
      });
    })();
  };

  const save = async (): Promise<boolean> => {
    const invalidQuestion = questionsRef.current.find(hasInvalidQuestion);
    if (invalidQuestion) {
      setSelectedId(invalidQuestion.id);
      setSaveFailed(false);
      return false;
    }
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
      const savedQuestions = savedQuestionsRef.current;
      const questionsAreSaved =
        questionsRef.current.length === savedQuestions.length &&
        questionsRef.current.every((question, index) => {
          const savedQuestion = savedQuestions[index];
          return (
            savedQuestion?.id === question.id &&
            questionSignature(savedQuestion) === questionSignature(question)
          );
        });
      const isClean = titleRef.current === savedTitleRef.current && questionsAreSaved;
      updateDirty(!isClean);
      return isClean;
    } catch {
      updateDirty(true);
      setSaveFailed(true);
      return false;
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
    launchPending: openSurvey.isPending || isSaving,
    launchError: openSurvey.error,
    launchSaveFailed,
    launchOptionValidationFailed,
    confirmLaunch,
    patch,
    add,
    remove,
    reorder,
    save,
  };
}
