import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SurveyQuestion } from '../../types';
import { BranchEditor } from './BranchEditor';

const parentQuestion: SurveyQuestion = {
  id: '10000000-0000-4000-8000-000000000001',
  survey_id: '20000000-0000-4000-8000-000000000001',
  kind: 'single_choice',
  prompt: 'Q1: 서비스 만족도',
  is_required: false,
  options: [
    { key: 'satisfied', label: '만족' },
    { key: 'unsatisfied', label: '불만족' },
  ],
  rating_min: null,
  rating_max: null,
  rating_low_label: null,
  rating_high_label: null,
  sort_order: 0,
  branch_depth: 0,
  branch_parent_question_id: null,
  branch_trigger_option_key: null,
};

const childQuestion: SurveyQuestion = {
  ...parentQuestion,
  id: '10000000-0000-4000-8000-000000000002',
  prompt: 'Q2: 추가 의견',
  sort_order: 1,
};

describe('BranchEditor', () => {
  it('keeps the selected branch parent and its default option key in the form state', async () => {
    const onChange = vi.fn();
    render(
      <BranchEditor question={childQuestion} parents={[parentQuestion]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Q1 · Q1: 서비스 만족도' }));

    expect(onChange).toHaveBeenCalledWith({
      branch_parent_question_id: parentQuestion.id,
      branch_trigger_option_key: 'satisfied',
    });
  });

  it('keeps the selected option key in the form state', async () => {
    const onChange = vi.fn();
    const question = {
      ...childQuestion,
      branch_parent_question_id: parentQuestion.id,
      branch_trigger_option_key: 'satisfied',
    };
    render(
      <BranchEditor
        question={question}
        parent={parentQuestion}
        parents={[parentQuestion]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: '분기 조건 옵션' }));
    fireEvent.click(await screen.findByRole('option', { name: '불만족' }));

    expect(onChange).toHaveBeenCalledWith({ branch_trigger_option_key: 'unsatisfied' });
  });

  it('labels an empty prompt with its question position instead of its UUID', async () => {
    const unnamedParent = {
      ...parentQuestion,
      id: '10000000-0000-4000-8000-000000000003',
      prompt: '',
      sort_order: 1,
    };
    render(
      <BranchEditor
        question={childQuestion}
        parents={[parentQuestion, unnamedParent]}
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));

    expect(await screen.findByRole('option', { name: 'Q2' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: unnamedParent.id })).not.toBeInTheDocument();
  });

  it('distinguishes duplicate prompts and numbers a disabled current parent', async () => {
    const firstParent = { ...parentQuestion, prompt: '공통 질문', sort_order: 0 };
    const secondParent = {
      ...parentQuestion,
      id: '10000000-0000-4000-8000-000000000003',
      prompt: '공통 질문',
      sort_order: 1,
    };
    const currentParent = {
      ...parentQuestion,
      id: '10000000-0000-4000-8000-000000000004',
      kind: 'multiple_choice' as const,
      prompt: '공통 질문',
      sort_order: 2,
    };

    render(
      <BranchEditor
        question={{ ...childQuestion, branch_parent_question_id: currentParent.id }}
        parent={currentParent}
        parents={[firstParent, secondParent]}
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: '분기 부모 질문' }));

    expect(await screen.findByRole('option', { name: 'Q1 · 공통 질문' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Q2 · 공통 질문' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Q3 · 공통 질문' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('labels blank parent options by their position', async () => {
    const parentWithBlankOptions: SurveyQuestion = {
      ...parentQuestion,
      options: [
        { key: 'first', label: ' ' },
        { key: 'second', label: '' },
      ],
    };
    render(
      <BranchEditor
        question={{
          ...childQuestion,
          branch_parent_question_id: parentWithBlankOptions.id,
          branch_trigger_option_key: 'first',
        }}
        parent={parentWithBlankOptions}
        parents={[parentWithBlankOptions]}
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: '분기 조건 옵션' }));

    expect(await screen.findByRole('option', { name: '옵션 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '옵션 2' })).toBeInTheDocument();
  });
});
