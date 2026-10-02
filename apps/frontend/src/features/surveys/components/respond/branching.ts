export interface BranchableRespondentQuestion {
  id: string;
  branch_parent_question_id: string | null;
  branch_trigger_option_key: string | null;
}

export function getVisibleRespondentQuestions<T extends BranchableRespondentQuestion>(
  questions: readonly T[],
  answers: Record<string, unknown>,
): T[] {
  return questions.filter((question) => {
    if (!question.branch_parent_question_id || !question.branch_trigger_option_key) return true;
    return answers[question.branch_parent_question_id] === question.branch_trigger_option_key;
  });
}
