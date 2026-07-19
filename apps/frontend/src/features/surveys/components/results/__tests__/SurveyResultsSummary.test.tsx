import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/admin/permissions/request-access-button', () => ({
  RequestAccessButton: ({
    capability,
    managedSystemId,
  }: { capability: string; managedSystemId?: string }) => (
    <button
      data-managed-system-id={managedSystemId}
      data-testid={`request-access-${capability}`}
      type="button"
    >
      Request access
    </button>
  ),
}));

import { SurveyResultsSummary } from '../SurveyResultsSummary';

const ids = {
  survey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  system: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  choice: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  rating: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  text: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  suppressed: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  finding: '11111111-1111-4111-8111-111111111111',
};

const survey = {
  id: ids.survey,
  display_id: 'SRV-21',
  title: 'Q3 매출 리포트 사용성 진단',
  type: 'outcome' as const,
  status: 'closed' as const,
  description: null,
  primary_managed_system_id: ids.system,
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: ids.finding,
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [
    {
      id: ids.choice,
      survey_id: ids.survey,
      kind: 'single_choice' as const,
      prompt: '가장 자주 쓰는 기능은?',
      is_required: true,
      options: null,
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      sort_order: 0,
      branch_depth: 0,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
    {
      id: ids.rating,
      survey_id: ids.survey,
      kind: 'rating' as const,
      prompt: '만족하시나요?',
      is_required: true,
      options: null,
      rating_min: 1,
      rating_max: 5,
      rating_low_label: null,
      rating_high_label: null,
      sort_order: 1,
      branch_depth: 0,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
    {
      id: ids.text,
      survey_id: ids.survey,
      kind: 'text' as const,
      prompt: '개선할 점은?',
      is_required: false,
      options: null,
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      sort_order: 2,
      branch_depth: 0,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
  ],
};

const results = {
  survey_id: ids.survey,
  status: 'closed' as const,
  identity_protected: true,
  questions: [
    {
      question_id: ids.choice,
      visibility: 'visible' as const,
      kind: 'choice' as const,
      answer_count: 12,
      option_buckets: [
        { key: 'slow', label: '느린 로딩', count: 8 },
        { key: 'other', label: '기타', count: 4 },
      ],
    },
    {
      question_id: ids.rating,
      visibility: 'visible' as const,
      kind: 'rating' as const,
      answer_count: 12,
      distribution: { low: 8, mid: 3, high: 1 },
    },
    {
      question_id: ids.text,
      visibility: 'visible' as const,
      kind: 'text' as const,
      answer_count: 2,
      distribution: null,
      excerpts: [{ id: ids.finding, text: '내보내기가 너무 느립니다.' }],
    },
    {
      question_id: ids.suppressed,
      visibility: 'suppressed' as const,
      response_count: null,
      suppression: { code: 'anonymity_threshold' as const },
    },
  ],
  next_actions: [
    { id: 'create_finding' as const, availability: 'allowed' as const, intent: 'open_finding_draft' as const },
  ],
};

describe('SurveyResultsSummary', () => {
  it('renders per-question choice, rating, text summaries and an identity-protected notice', () => {
    render(<SurveyResultsSummary survey={survey} results={results} />);

    expect(screen.getByText('느린 로딩')).toBeInTheDocument();
    expect(screen.getByText('low')).toBeInTheDocument();
    expect(screen.getByText('내보내기가 너무 느립니다.')).toBeInTheDocument();
    expect(screen.getByText('Identity protected responses')).toBeInTheDocument();
    expect(screen.getByText('Outcome follow-up is available')).toBeInTheDocument();
  });

  it('renders a suppressed row exactly without deriving a count', () => {
    render(<SurveyResultsSummary survey={survey} results={{ ...results, next_actions: [] }} />);

    const row = screen.getByTestId(`survey-result-suppressed-${ids.suppressed}`);
    expect(row).toHaveTextContent('Results are suppressed to protect anonymity.');
    expect(row).not.toHaveTextContent(/0 responses|12 responses|response count/i);
  });

  it('renders only allowed backend action ids and request access for blocked actions', () => {
    render(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          next_actions: [
            { id: 'create_finding', availability: 'allowed', intent: 'open_finding_draft' },
            {
              id: 'request_task',
              availability: 'blocked_requestable',
              intent: 'open_task_request_draft',
              source_finding_id: ids.finding,
              requestable_permission: {
                permission: 'finding.manage',
                managed_system_id: ids.system,
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Create Finding' })).toHaveAttribute(
      'data-action-id',
      'create_finding',
    );
    expect(screen.getByTestId('request-access-finding.manage')).toHaveAttribute(
      'data-managed-system-id',
      ids.system,
    );
    expect(screen.queryByText('Create VOC')).not.toBeInTheDocument();
    expect(screen.queryByText('Convert to VOC')).not.toBeInTheDocument();
    expect(screen.queryByText('Request Task')).not.toBeInTheDocument();
  });

  it('renders no follow-up CTA when next_actions is empty', () => {
    render(<SurveyResultsSummary survey={survey} results={{ ...results, next_actions: [] }} />);

    expect(screen.queryByTestId('survey-result-next-actions')).not.toBeInTheDocument();
    expect(screen.queryByText('mark_no_follow_up')).not.toBeInTheDocument();
  });
});
