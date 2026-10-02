export function countNonEmptyRespondentAnswers(
  questions: readonly { id: string }[],
  answers: Record<string, unknown>,
): number {
  return questions.reduce((count, question) => {
    const answer = answers[question.id];
    const isNonEmpty =
      (typeof answer === 'string' && answer.trim().length > 0) ||
      (Array.isArray(answer) && answer.length > 0) ||
      typeof answer === 'number';
    return count + (isNonEmpty ? 1 : 0);
  }, 0);
}
