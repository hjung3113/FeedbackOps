import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { apiClient } = vi.hoisted(() => ({ apiClient: vi.fn() }));

vi.mock('@/lib/api', () => ({ apiClient }));

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
  responseOne: '22222222-2222-4222-8222-222222222222',
  responseTwo: '33333333-3333-4333-8333-333333333333',
  excerptTwo: '44444444-4444-4444-8444-444444444444',
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
    {
      id: 'create_finding' as const,
      availability: 'allowed' as const,
      intent: 'open_finding_draft' as const,
    },
  ],
};

describe('SurveyResultsSummary', () => {
  afterEach(() => vi.clearAllMocks());

  function renderWithClient(node: ReactNode) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return {
      ...render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>),
      queryClient,
    };
  }

  it('renders per-question choice, rating, text summaries and an identity-protected notice', () => {
    render(<SurveyResultsSummary survey={survey} results={results} />);

    expect(screen.getByText('느린 로딩')).toBeInTheDocument();
    expect(screen.getByText('low')).toBeInTheDocument();
    expect(screen.getByText('내보내기가 너무 느립니다.')).toBeInTheDocument();
    expect(screen.getByText('Identity protected responses')).toBeInTheDocument();
    expect(screen.getByText('Outcome follow-up is available')).toBeInTheDocument();
  });

  it('renders approved excerpt text without rendering its personal response identifier', async () => {
    const user = userEvent.setup();
    const responseId = '24242424-2424-4242-8242-242424242424';
    const excerptText = '대시보드 필터를 저장할 수 있으면 좋겠습니다.';
    const { container } = renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          questions: results.questions.map((question) =>
            question.kind === 'text'
              ? {
                  ...question,
                  excerpts: [{ id: ids.finding, text: excerptText, response_id: responseId }],
                }
              : question,
          ),
        }}
      />,
    );

    expect(screen.getByText(excerptText)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create Finding' }));
    expect(screen.getByTestId('survey-create-finding-draft')).toBeInTheDocument();
    expect(container.textContent).not.toContain(responseId);
  });

  it('renders a suppressed row exactly without deriving a count', () => {
    render(<SurveyResultsSummary survey={survey} results={{ ...results, next_actions: [] }} />);

    const row = screen.getByTestId(`survey-result-suppressed-${ids.suppressed}`);
    expect(row).toHaveTextContent('Results are suppressed to protect anonymity.');
    expect(row).not.toHaveTextContent(/0 responses|12 responses|response count/i);
  });

  it('renders request access for a blocked create-finding action without issuing a request', async () => {
    const user = userEvent.setup();
    render(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          next_actions: [
            {
              id: 'create_finding',
              availability: 'blocked_requestable',
              intent: 'open_finding_draft',
              requestable_permission: {
                permission: 'finding.manage',
                managed_system_id: ids.system,
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByTestId('request-access-finding.manage')).toHaveAttribute(
      'data-managed-system-id',
      ids.system,
    );
    await user.click(screen.getByTestId('request-access-finding.manage'));
    expect(apiClient).not.toHaveBeenCalled();
    for (const label of [
      'Create VOC',
      'Convert to VOC',
      'Generate VOC from Response',
      'Link Existing VOC',
    ]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId('survey-create-finding-draft')).not.toBeInTheDocument();
  });

  it('posts selected excerpts to the selected response and invalidates results after creation', async () => {
    const user = userEvent.setup();
    apiClient.mockResolvedValue({ data: { id: ids.finding } });
    const { queryClient } = renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          questions: results.questions.map((question) =>
            question.kind === 'text'
              ? {
                  ...question,
                  excerpts: [
                    {
                      id: ids.finding,
                      text: '내보내기가 너무 느립니다.',
                      response_id: ids.responseOne,
                    },
                  ],
                }
              : question,
          ),
        }}
      />,
    );
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: 'Create Finding' }));
    expect(screen.getByText('Create or link Finding')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Create Finding' })).toHaveLength(1);
    await user.click(screen.getByTestId('survey-finding-response-0'));
    await user.click(screen.getByTestId(`survey-finding-excerpt-${ids.finding}`));
    await user.click(screen.getByTestId('survey-finding-severity'));
    await user.click(await screen.findByRole('option', { name: 'High' }));
    await user.click(screen.getByTestId('survey-create-finding-submit'));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'POST',
        `/survey-responses/${ids.responseOne}/create-finding`,
        { body: { severity: 'high', approved_excerpt_ids: [ids.finding] } },
      ),
    );
    expect(apiClient).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['surveys', ids.survey, 'results'],
      }),
    );
  });

  it('clears selected excerpts when the chosen response changes', async () => {
    const user = userEvent.setup();
    apiClient.mockResolvedValue({ data: { id: ids.finding } });
    renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          questions: results.questions.map((question) =>
            question.kind === 'text'
              ? {
                  ...question,
                  excerpts: [
                    { id: ids.finding, text: '첫 번째 응답', response_id: ids.responseOne },
                    { id: ids.excerptTwo, text: '두 번째 응답', response_id: ids.responseTwo },
                  ],
                }
              : question,
          ),
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create Finding' }));
    await user.click(screen.getByTestId('survey-finding-response-0'));
    await user.click(screen.getByTestId(`survey-finding-excerpt-${ids.finding}`));
    await user.click(screen.getByTestId('survey-finding-response-1'));

    expect(screen.getByTestId('survey-create-finding-submit')).toBeDisabled();
    await user.click(screen.getByTestId(`survey-finding-excerpt-${ids.excerptTwo}`));
    await user.click(screen.getByTestId('survey-create-finding-submit'));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'POST',
        `/survey-responses/${ids.responseTwo}/create-finding`,
        { body: { severity: 'medium', approved_excerpt_ids: [ids.excerptTwo] } },
      ),
    );
  });

  it('keeps a selected response paired with its excerpts when results reorder', async () => {
    const user = userEvent.setup();
    apiClient.mockResolvedValue({ data: { id: ids.finding } });
    const holderResults = {
      ...results,
      questions: results.questions.map((question) =>
        question.kind === 'text'
          ? {
              ...question,
              excerpts: [
                { id: ids.finding, text: '첫 번째 응답', response_id: ids.responseOne },
                { id: ids.excerptTwo, text: '두 번째 응답', response_id: ids.responseTwo },
              ],
            }
          : question,
      ),
    };
    const { queryClient, rerender } = renderWithClient(
      <SurveyResultsSummary survey={survey} results={holderResults} />,
    );

    await user.click(screen.getByRole('button', { name: 'Create Finding' }));
    await user.click(screen.getByTestId('survey-finding-response-0'));
    await user.click(screen.getByTestId(`survey-finding-excerpt-${ids.finding}`));

    rerender(
      <QueryClientProvider client={queryClient}>
        <SurveyResultsSummary
          survey={survey}
          results={{
            ...holderResults,
            questions: holderResults.questions.map((question) =>
              question.kind === 'text'
                ? { ...question, excerpts: [...question.excerpts].reverse() }
                : question,
            ),
          }}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId(`survey-finding-excerpt-${ids.finding}`)).toBeChecked();
    await user.click(screen.getByTestId('survey-create-finding-submit'));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'POST',
        `/survey-responses/${ids.responseOne}/create-finding`,
        { body: { severity: 'medium', approved_excerpt_ids: [ids.finding] } },
      ),
    );
  });

  it('shows a loading affordance while creating a Finding', async () => {
    const user = userEvent.setup();
    apiClient.mockImplementation(() => new Promise(() => undefined));
    renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          questions: results.questions.map((question) =>
            question.kind === 'text'
              ? {
                  ...question,
                  excerpts: [{ id: ids.finding, text: '응답', response_id: ids.responseOne }],
                }
              : question,
          ),
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create Finding' }));
    await user.click(screen.getByTestId('survey-finding-response-0'));
    await user.click(screen.getByTestId(`survey-finding-excerpt-${ids.finding}`));
    await user.click(screen.getByTestId('survey-create-finding-submit'));

    expect(screen.getByTestId('survey-create-finding-submit')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('survey-create-finding-submit')).toBeDisabled();
  });

  it('shows a create-finding failure without closing the draft', async () => {
    const user = userEvent.setup();
    apiClient.mockRejectedValue(new Error('Finding could not be created'));
    renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          questions: results.questions.map((question) =>
            question.kind === 'text'
              ? {
                  ...question,
                  excerpts: [{ id: ids.finding, text: '응답', response_id: ids.responseOne }],
                }
              : question,
          ),
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create Finding' }));
    await user.click(screen.getByTestId('survey-finding-response-0'));
    await user.click(screen.getByTestId(`survey-finding-excerpt-${ids.finding}`));
    await user.click(screen.getByTestId('survey-create-finding-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Finding could not be created');
    expect(screen.getByTestId('survey-create-finding-draft')).toBeInTheDocument();
    expect(screen.getByTestId('survey-create-finding-submit')).not.toBeDisabled();
  });

  it('disables Create Finding when no approved excerpt is tied to an accessible response', async () => {
    const user = userEvent.setup();
    renderWithClient(<SurveyResultsSummary survey={survey} results={results} />);

    const button = screen.getByRole('button', { name: 'Create Finding' });
    expect(button).toBeDisabled();
    expect(
      screen.getByText('No approved excerpts are available for a response you can access.'),
    ).toBeInTheDocument();
    await user.click(button);
    expect(screen.queryByTestId('survey-create-finding-draft')).not.toBeInTheDocument();
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('keeps a blocked requestable action visible when its permission details are absent', () => {
    render(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          next_actions: [
            {
              id: 'create_finding',
              availability: 'blocked_requestable',
              intent: 'open_finding_draft',
            },
          ],
        }}
      />,
    );

    expect(screen.getByTestId('survey-result-next-actions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request access' })).toBeDisabled();
    expect(
      screen.getByText('Access details are unavailable, so this request cannot be submitted.'),
    ).toBeInTheDocument();
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('renders no follow-up CTA when next_actions is empty', () => {
    render(<SurveyResultsSummary survey={survey} results={{ ...results, next_actions: [] }} />);

    expect(screen.queryByTestId('survey-result-next-actions')).not.toBeInTheDocument();
    expect(screen.queryByText('mark_no_follow_up')).not.toBeInTheDocument();
  });
});
