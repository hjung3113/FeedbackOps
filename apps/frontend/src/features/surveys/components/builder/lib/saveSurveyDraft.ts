import type { QuestionInput, SurveyQuestion } from '../../../types';
import {
  denseQuestions,
  isLocalQuestionId,
  questionSignature,
  toInput,
  toUpdateInput,
} from './questionDraft';

export async function saveSurveyDraft(deps: {
  questionsRef: { current: SurveyQuestion[] };
  titleRef: { current: string };
  savedTitleRef: { current: string };
  savedQuestionsRef: { current: SurveyQuestion[] };
  replaceLocalId: (localId: string, serverId: string) => void;
  updateQuestions: (update: (current: SurveyQuestion[]) => SurveyQuestion[]) => void;
  mutations: {
    updateSurvey: (body: { title: string }) => Promise<unknown>;
    remove: (id: string) => Promise<unknown>;
    create: (body: QuestionInput) => Promise<{ id: string }>;
    update: (args: { id: string; body: QuestionInput }) => Promise<unknown>;
    reorder: (questionIds: string[]) => Promise<unknown>;
  };
}): Promise<Date> {
  const {
    questionsRef,
    titleRef,
    savedTitleRef,
    savedQuestionsRef,
    replaceLocalId,
    updateQuestions,
    mutations,
  } = deps;

  if (titleRef.current !== savedTitleRef.current)
    await mutations.updateSurvey({ title: titleRef.current });

  const persisted = savedQuestionsRef.current;
  for (const question of persisted) {
    if (!questionsRef.current.some((candidate) => candidate.id === question.id))
      await mutations.remove(question.id);
  }

  const savedOptionKeys = new Map(
    persisted.map(
      (question) =>
        [question.id, new Set(question.options?.map((option) => option.key) ?? [])] as const,
    ),
  );
  const deferredBranchIds = new Set<string>();
  const deferredBranchSignatures = new Map<string, string>();
  const preUpdatedChildIds = new Set<string>();
  const rememberSavedQuestion = (question: SurveyQuestion) => {
    const index = savedQuestionsRef.current.findIndex((saved) => saved.id === question.id);
    if (index < 0) {
      savedQuestionsRef.current = [...savedQuestionsRef.current, question];
      return;
    }
    savedQuestionsRef.current = savedQuestionsRef.current.map((saved, savedIndex) =>
      savedIndex === index ? question : saved,
    );
  };
  const rememberSavedOptions = (question: SurveyQuestion) => {
    savedOptionKeys.set(question.id, new Set(question.options?.map((option) => option.key) ?? []));
  };
  const clearBranch = (question: SurveyQuestion): SurveyQuestion => ({
    ...question,
    branch_depth: 0,
    branch_parent_question_id: null,
    branch_trigger_option_key: null,
  });
  const hasSavedTrigger = (question: SurveyQuestion): boolean => {
    const parentId = question.branch_parent_question_id;
    const triggerKey = question.branch_trigger_option_key;
    return Boolean(parentId && triggerKey && savedOptionKeys.get(parentId)?.has(triggerKey));
  };

  for (const local of questionsRef.current.filter((question) => isLocalQuestionId(question.id))) {
    const current = questionsRef.current.find((question) => question.id === local.id);
    if (!current) continue;
    const parentId = current.branch_parent_question_id;
    const triggerKey = current.branch_trigger_option_key;
    const deferBranch = Boolean(
      parentId && triggerKey && !savedOptionKeys.get(parentId)?.has(triggerKey),
    );
    const createQuestion = deferBranch ? clearBranch(current) : current;
    let sentSignature = questionSignature(createQuestion);
    const created = await mutations.create(toInput(createQuestion));
    rememberSavedQuestion({ ...createQuestion, id: created.id });
    replaceLocalId(local.id, created.id);
    rememberSavedOptions({ ...createQuestion, id: created.id });
    if (deferBranch) deferredBranchIds.add(created.id);
    let latest = questionsRef.current.find((question) => question.id === created.id);
    while (latest) {
      const updateQuestion = deferBranch ? clearBranch(latest) : latest;
      const nextSignature = questionSignature(updateQuestion);
      if (nextSignature === sentSignature) break;
      sentSignature = nextSignature;
      await mutations.update({ id: created.id, body: toInput(updateQuestion) });
      rememberSavedQuestion(updateQuestion);
      rememberSavedOptions(updateQuestion);
      latest = questionsRef.current.find((question) => question.id === created.id);
    }
    if (deferBranch) deferredBranchSignatures.set(created.id, sentSignature);
  }

  const childBranchesFirst = new Set<string>();
  const detachChildrenFirst = new Set<string>();
  for (const persistedParent of persisted) {
    const currentParent = questionsRef.current.find(
      (question) => question.id === persistedParent.id,
    );
    if (!currentParent) continue;
    const remainingKeys = new Set(currentParent.options?.map((option) => option.key) ?? []);
    const removedKeys = new Set(
      (persistedParent.options ?? [])
        .map((option) => option.key)
        .filter((key) => !remainingKeys.has(key)),
    );
    if (removedKeys.size === 0) continue;
    for (const persistedChild of persisted) {
      if (
        persistedChild.branch_parent_question_id === persistedParent.id &&
        persistedChild.branch_trigger_option_key &&
        removedKeys.has(persistedChild.branch_trigger_option_key)
      ) {
        const currentChild = questionsRef.current.find(
          (question) => question.id === persistedChild.id,
        );
        if (!currentChild) continue;
        if (hasSavedTrigger(currentChild)) {
          childBranchesFirst.add(persistedChild.id);
        } else {
          detachChildrenFirst.add(persistedChild.id);
          if (currentChild.branch_parent_question_id) deferredBranchIds.add(persistedChild.id);
        }
      }
    }
  }

  for (const childId of detachChildrenFirst) {
    const persistedChild = persisted.find((question) => question.id === childId);
    let current = questionsRef.current.find((question) => question.id === childId);
    if (!persistedChild || !current) continue;
    let detached = clearBranch(current);
    let sentSignature = questionSignature(detached);
    await mutations.update({ id: childId, body: toUpdateInput(detached, persistedChild) });
    rememberSavedQuestion(detached);
    rememberSavedOptions(detached);
    preUpdatedChildIds.add(childId);
    current = questionsRef.current.find((question) => question.id === childId);
    while (current) {
      detached = clearBranch(current);
      const nextSignature = questionSignature(detached);
      if (nextSignature === sentSignature) break;
      sentSignature = nextSignature;
      await mutations.update({ id: childId, body: toUpdateInput(detached, persistedChild) });
      rememberSavedQuestion(detached);
      rememberSavedOptions(detached);
      current = questionsRef.current.find((question) => question.id === childId);
    }
    if (deferredBranchIds.has(childId)) deferredBranchSignatures.set(childId, sentSignature);
  }

  const persistedUpdateOrder = [
    ...persisted.filter((question) => childBranchesFirst.has(question.id)),
    ...persisted.filter((question) => !childBranchesFirst.has(question.id)),
  ];
  for (const persistedQuestion of persistedUpdateOrder) {
    let current = questionsRef.current.find((question) => question.id === persistedQuestion.id);
    if (
      !current ||
      preUpdatedChildIds.has(persistedQuestion.id) ||
      questionSignature(current) === questionSignature(persistedQuestion)
    )
      continue;
    let sentSignature = questionSignature(persistedQuestion);
    let deferBranch = false;
    while (current) {
      if (
        current.branch_parent_question_id &&
        current.branch_trigger_option_key &&
        !hasSavedTrigger(current)
      ) {
        deferBranch = true;
        deferredBranchIds.add(current.id);
      }
      const updateQuestion = deferBranch ? clearBranch(current) : current;
      const nextSignature = questionSignature(updateQuestion);
      if (nextSignature === sentSignature) break;
      sentSignature = nextSignature;
      await mutations.update({
        id: updateQuestion.id,
        body: toUpdateInput(updateQuestion, persistedQuestion),
      });
      rememberSavedQuestion(updateQuestion);
      rememberSavedOptions(updateQuestion);
      current = questionsRef.current.find((question) => question.id === persistedQuestion.id);
    }
    if (deferBranch) {
      preUpdatedChildIds.add(persistedQuestion.id);
      deferredBranchSignatures.set(persistedQuestion.id, sentSignature);
    }
  }

  for (const childId of deferredBranchIds) {
    let current = questionsRef.current.find((question) => question.id === childId);
    let sentSignature =
      deferredBranchSignatures.get(childId) ??
      (current ? questionSignature(clearBranch(current)) : '');
    while (current) {
      const parentId = current.branch_parent_question_id;
      const triggerKey = current.branch_trigger_option_key;
      if (parentId && triggerKey && !savedOptionKeys.get(parentId)?.has(triggerKey))
        throw new Error('Branch trigger option is not saved on its parent');
      const nextSignature = questionSignature(current);
      if (nextSignature === sentSignature) break;
      sentSignature = nextSignature;
      await mutations.update({ id: childId, body: toInput(current) });
      rememberSavedQuestion(current);
      rememberSavedOptions(current);
      current = questionsRef.current.find((question) => question.id === childId);
    }
  }

  const nextQuestions = denseQuestions(questionsRef.current);
  const previousIds = persisted.map((question) => question.id);
  const nextIds = nextQuestions.map((question) => question.id);
  const orderChanged =
    previousIds.length !== nextIds.length || previousIds.some((id, index) => id !== nextIds[index]);
  if (orderChanged) await mutations.reorder(nextIds);
  updateQuestions(() => nextQuestions);
  savedQuestionsRef.current = nextQuestions;
  savedTitleRef.current = titleRef.current;
  return new Date();
}
