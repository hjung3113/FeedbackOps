import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SurveyBuilder } from '../../components/builder/SurveyBuilder';
import { SurveyDetail } from '../../components/detail/SurveyDetail';
import { SurveyList } from '../../components/list/SurveyList';
import type { Survey } from '../../types';

const survey: Survey = {
  id: 'survey-1', display_id: 'SRV-1', title: 'Q3 사용성 진단', type: 'discovery', status: 'draft',
  description: '설문 설명', primary_managed_system_id: 'system-1', analytics_area_id: null,
  operator_actor_id: null, responses_identity_protected: true, created_by: 'actor-1',
  opened_at: null, closed_at: null, created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z',
  questions: [{ id: 'question-1', survey_id: 'survey-1', kind: 'single_choice', prompt: '도움이 되었나요?', is_required: true, options: [{ key: 'yes', label: '예' }, { key: 'no', label: '아니오' }], rating_min: null, rating_max: null, rating_low_label: null, rating_high_label: null, sort_order: 0, branch_depth: 0, branch_parent_question_id: null, branch_trigger_option_key: null }],
};
function renderWithQuery(node: React.ReactElement) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>); }

describe('Survey screens', () => {
  it('renders list rows, empty, loading, and error states without a Create VOC affordance', () => {
    const select = vi.fn();
    const { rerender } = render(<SurveyList surveys={[survey]} isLoading={false} error={null} onSelect={select} />);
    expect(screen.getByText('Q3 사용성 진단')).toBeInTheDocument();
    expect(screen.queryByText('Create VOC')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Q3 사용성 진단'));
    expect(select).toHaveBeenCalledWith('survey-1');
    rerender(<SurveyList surveys={[]} isLoading={false} error={null} onSelect={select} />);
    expect(screen.getByText('생성된 설문이 없습니다.')).toBeInTheDocument();
    rerender(<SurveyList surveys={[]} isLoading error={null} onSelect={select} />);
    expect(screen.getByTestId('survey-list-skeleton')).toBeInTheDocument();
    rerender(<SurveyList surveys={[]} isLoading={false} error={new Error('failed')} onSelect={select} />);
    expect(screen.getByTestId('survey-list-error')).toBeInTheDocument();
  });

  it('keeps a non-draft builder read-only', () => {
    renderWithQuery(<SurveyBuilder survey={{ ...survey, status: 'live' }} canManage onBack={vi.fn()} />);
    expect(screen.getByText('Live 상태 — 질문 변경은 잠겨 있습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '새 질문 추가' })).not.toBeInTheDocument();
  });

  it('renders a survey detail title, type, status, and questions', () => {
    render(<SurveyDetail survey={survey} canManage={false} />);

    expect(screen.getByText('Q3 사용성 진단')).toBeInTheDocument();
    expect(screen.getByText('SRV-1 · discovery')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('Q1. 도움이 되었나요?')).toBeInTheDocument();
  });

  it.each(['single_choice', 'multiple_choice', 'rating', 'text'] as const)(
    'offers %s as a draft question kind to a managing actor',
    (kind) => {
      renderWithQuery(<SurveyBuilder survey={survey} canManage onBack={vi.fn()} />);
      fireEvent.click(screen.getByRole('combobox', { name: 'Question kind' }));
      expect(screen.getByRole('option', { name: kind })).toBeInTheDocument();
    },
  );

  it.each(['loading', 'error', 'absent'] as const)(
    'does not expose builder mutations when survey.manage is %s',
    (state) => {
      renderWithQuery(<SurveyBuilder survey={survey} canManage={false} gateState={state} onBack={vi.fn()} />);
      expect(screen.queryByRole('button', { name: '새 질문 추가' })).not.toBeInTheDocument();
      expect(screen.queryByText('설문 생성')).not.toBeInTheDocument();
    },
  );
});
