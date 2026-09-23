import type { QuestionInput, QuestionKind, SurveyQuestion } from '../../../types';

export function newQuestion(surveyId: string, sortOrder: number): SurveyQuestion {
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

export function toInput(question: SurveyQuestion): QuestionInput {
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

export function toUpdateInput(question: SurveyQuestion, persisted: SurveyQuestion): QuestionInput {
  const input = toInput(question);
  // Omission means "leave as is". Clearing a persisted branch is the only
  // falsy transition that must cross the wire explicitly (#192/#194).
  if (persisted.branch_parent_question_id && !question.branch_parent_question_id)
    input.branch_parent_question_id = null;
  return input;
}

export function questionSignature(question: SurveyQuestion): string {
  return JSON.stringify({
    ...toInput(question),
    branch_parent_question_id: question.branch_parent_question_id,
    branch_trigger_option_key: question.branch_trigger_option_key,
  });
}

export function denseQuestions(questions: SurveyQuestion[]): SurveyQuestion[] {
  return questions.map((question, sortOrder) => ({ ...question, sort_order: sortOrder }));
}

export function questionForKind(
  question: SurveyQuestion,
  kind: QuestionKind,
): Partial<SurveyQuestion> {
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

export function isLocalQuestionId(id: string): boolean {
  return id.startsWith('local-');
}

export function applyServerQuestionId(
  questions: SurveyQuestion[],
  localId: string,
  serverId: string,
): SurveyQuestion[] {
  return questions.map((question) => ({
    ...question,
    id: question.id === localId ? serverId : question.id,
    branch_parent_question_id:
      question.branch_parent_question_id === localId
        ? serverId
        : question.branch_parent_question_id,
  }));
}
