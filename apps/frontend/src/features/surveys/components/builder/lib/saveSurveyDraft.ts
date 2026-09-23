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

  for (const local of questionsRef.current.filter((question) => isLocalQuestionId(question.id))) {
    const current = questionsRef.current.find((question) => question.id === local.id);
    if (!current) continue;
    let sentSignature = questionSignature(current);
    const created = await mutations.create(toInput(current));
    replaceLocalId(local.id, created.id);
    let latest = questionsRef.current.find((question) => question.id === created.id);
    while (latest && questionSignature(latest) !== sentSignature) {
      sentSignature = questionSignature(latest);
      await mutations.update({ id: created.id, body: toInput(latest) });
      latest = questionsRef.current.find((question) => question.id === created.id);
    }
  }

  for (const persistedQuestion of persisted) {
    let current = questionsRef.current.find((question) => question.id === persistedQuestion.id);
    if (!current || questionSignature(current) === questionSignature(persistedQuestion)) continue;
    let sentSignature = questionSignature(current);
    await mutations.update({
      id: current.id,
      body: toUpdateInput(current, persistedQuestion),
    });
    current = questionsRef.current.find((question) => question.id === persistedQuestion.id);
    while (current && questionSignature(current) !== sentSignature) {
      sentSignature = questionSignature(current);
      await mutations.update({
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
    previousIds.length !== nextIds.length || previousIds.some((id, index) => id !== nextIds[index]);
  if (orderChanged) await mutations.reorder(nextIds);
  updateQuestions(() => nextQuestions);
  savedQuestionsRef.current = nextQuestions;
  savedTitleRef.current = titleRef.current;
  return new Date();
}
