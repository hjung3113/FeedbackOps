import { describe, expect, it } from 'vitest';
import { getVisibleRespondentQuestions } from './branching';

const questions = [
  {
    id: 'parent',
    branch_parent_question_id: null,
    branch_trigger_option_key: null,
  },
  {
    id: 'child',
    branch_parent_question_id: 'parent',
    branch_trigger_option_key: 'yes',
  },
];

describe('respondent branch visibility', () => {
  it.each([
    ['unanswered', undefined, ['parent']],
    ['the other option', 'no', ['parent']],
    ['the trigger option', 'yes', ['parent', 'child']],
    ['an array containing the trigger', ['yes'], ['parent']],
  ] as const)('shows the child only for %s', (_label, answer, expectedIds) => {
    const answers = answer === undefined ? {} : { parent: answer };

    expect(
      getVisibleRespondentQuestions(questions, answers).map((question) => question.id),
    ).toEqual(expectedIds);
  });
});
