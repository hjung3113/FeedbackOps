import { findingDtoSchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { apiClient, apiRequest } = vi.hoisted(() => ({
  apiClient: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiClient,
  apiRequest,
}));

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
      권한 요청
    </button>
  ),
}));

import { ApiParseError } from '@/lib/api';
import { SurveyResultsSummary } from '../SurveyResultsSummary';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const ids = {
  survey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  system: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  choice: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  rating: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  text: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  suppressed: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  finding: '11111111-1111-4111-8111-111111111111',
  findingTwo: '12121212-1212-4121-8121-121212121212',
  responseOne: '22222222-2222-4222-8222-222222222222',
  responseTwo: '33333333-3333-4333-8333-333333333333',
  excerptTwo: '44444444-4444-4444-8444-444444444444',
};

const refetchIds = {
  responseA: '55555555-5555-4555-8555-555555555555',
  responseB: '66666666-6666-4666-8666-666666666666',
  movedExcerpt: '77777777-7777-4777-8777-777777777777',
  retainedExcerpt: '88888888-8888-4888-8888-888888888888',
  otherExcerpt: '99999999-9999-4999-8999-999999999999',
};

function makeFinding(id: string, summary: string) {
  return findingDtoSchema.parse({
    id,
    workspace_id: ids.survey,
    display_id: 'FND-510',
    primary_managed_system_id: ids.system,
    title: 'Survey follow-up',
    summary,
    evidence_count: 1,
    severity: 'high',
    confidence: null,
    status: 'active',
    analytics_area_id: null,
    linked_task_id: null,
    linked_milestone_id: null,
    created_by: ids.finding,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    source_type: 'survey_response',
  });
}

function makeDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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
  response_state: 'visible' as const,
  anonymity_threshold: 5,
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
    for (const label of ['낮은 점수', '중간 점수', '높은 점수', '선택형', '평점', '서술형']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const rawLabel of ['low', 'mid', 'high', 'choice', 'rating', 'text']) {
      expect(screen.queryByText(rawLabel, { exact: true })).not.toBeInTheDocument();
    }
    expect(screen.getByText('내보내기가 너무 느립니다.')).toBeInTheDocument();
    expect(screen.getByText('신원 보호 응답')).toBeInTheDocument();
    expect(screen.getByText('후속 조치 검토 사용 가능')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Finding 생성' }));
    expect(screen.getByTestId('survey-create-finding-draft')).toBeInTheDocument();
    expect(screen.getByText('응답 선택')).toBeInTheDocument();
    expect(screen.getByText('응답 1')).toBeInTheDocument();
    await user.click(screen.getByRole('radio'));
    expect(screen.getByText('승인된 발췌')).toBeInTheDocument();
    expect(screen.getByText('심각도')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '선택한 응답으로 Finding 생성' }),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain(responseId);
  });

  it.each([
    ['low', '낮음'],
    ['medium', '중간'],
    ['high', '높음'],
    ['critical', '심각'],
  ] as const)('renders the Korean Finding severity option for %s', async (_severity, label) => {
    const user = userEvent.setup();
    const responseId = ids.responseOne;
    renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          questions: results.questions.map((question) =>
            question.kind === 'text'
              ? {
                  ...question,
                  excerpts: [{ id: ids.finding, text: '승인된 발췌', response_id: responseId }],
                }
              : question,
          ),
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Finding 생성' }));
    await user.click(screen.getByTestId('survey-finding-severity'));

    expect(await screen.findByRole('option', { name: label })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: _severity })).not.toBeInTheDocument();
  });

  it('renders a suppressed row exactly without deriving a count', () => {
    render(<SurveyResultsSummary survey={survey} results={{ ...results, next_actions: [] }} />);

    const row = screen.getByTestId(`survey-result-suppressed-${ids.suppressed}`);
    expect(row).toHaveTextContent('익명 보호를 위해 이 질문의 결과는 숨겨집니다.');
    expect(row).not.toHaveTextContent(/0 responses|12 responses|response count/i);
  });

  it('shows the zero-response state with the configured threshold and no new action', () => {
    renderWithClient(
      <SurveyResultsSummary survey={survey} results={{ ...results, response_state: 'none' }} />,
    );

    expect(screen.getByText('아직 응답이 없습니다')).toBeInTheDocument();
    expect(screen.getByText('응답이 5건 이상 모이면 결과가 표시됩니다.')).toBeInTheDocument();
    expect(screen.queryByText('느린 로딩')).not.toBeInTheDocument();
    const emptyState = screen.getByText('아직 응답이 없습니다').parentElement;
    if (emptyState === null) throw new Error('Expected the EmptyState container');
    expect(within(emptyState).queryByRole('button')).toBeNull();
  });

  it('shows below-threshold copy without exposing a response count', () => {
    const questions = results.questions.map((question) => ({
      question_id: question.question_id,
      visibility: 'suppressed' as const,
      response_count: null,
      suppression: { code: 'anonymity_threshold' as const },
    }));
    const { container } = renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{ ...results, response_state: 'below_threshold', questions }}
      />,
    );

    expect(screen.getByText('응답이 5건 이상 모이면 결과가 표시됩니다')).toBeInTheDocument();
    expect(
      screen.getByText('익명 보호를 위해 5건 미만일 때는 집계와 정확한 응답 수를 숨깁니다.'),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+\s+responses?/i);
    expect(screen.getByTestId('survey-result-next-actions')).toBeInTheDocument();
    expect(screen.queryByText('느린 로딩')).not.toBeInTheDocument();
  });

  it('keeps visible results on the existing per-question rendering', () => {
    renderWithClient(<SurveyResultsSummary survey={survey} results={results} />);

    expect(screen.getByText('느린 로딩')).toBeInTheDocument();
    expect(screen.getAllByText('응답 12건')).toHaveLength(2);
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

    await user.click(screen.getByRole('button', { name: 'Finding 생성' }));
    // Panel heading and trigger share the glossary label; scope to the draft panel.
    expect(
      within(await screen.findByTestId('survey-create-finding-draft')).getByText('Finding 생성'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Finding 생성' })).toHaveLength(1);
    await user.click(screen.getByTestId('survey-finding-response-0'));
    await user.click(screen.getByTestId(`survey-finding-excerpt-${ids.finding}`));
    await user.click(screen.getByTestId('survey-finding-severity'));
    await user.click(await screen.findByRole('option', { name: '높음' }));
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

    await user.click(screen.getByRole('button', { name: 'Finding 생성' }));
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

    await user.click(screen.getByRole('button', { name: 'Finding 생성' }));
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

  it('removes a selected excerpt that moves from response A to response B after a refetch', async () => {
    const user = userEvent.setup();
    apiClient.mockResolvedValue({ data: { id: ids.finding } });
    const holderResults = {
      ...results,
      questions: results.questions.map((question) =>
        question.kind === 'text'
          ? {
              ...question,
              excerpts: [
                {
                  id: refetchIds.movedExcerpt,
                  text: '이동한 발췌',
                  response_id: refetchIds.responseA,
                },
                {
                  id: refetchIds.retainedExcerpt,
                  text: '남은 발췌',
                  response_id: refetchIds.responseA,
                },
                {
                  id: refetchIds.otherExcerpt,
                  text: '다른 응답 발췌',
                  response_id: refetchIds.responseB,
                },
              ],
            }
          : question,
      ),
    };
    const { queryClient, rerender } = renderWithClient(
      <SurveyResultsSummary survey={survey} results={holderResults} />,
    );

    await user.click(screen.getByRole('button', { name: 'Finding 생성' }));
    await user.click(screen.getByTestId('survey-finding-response-0'));
    await user.click(screen.getByTestId(`survey-finding-excerpt-${refetchIds.movedExcerpt}`));
    await user.click(screen.getByTestId(`survey-finding-excerpt-${refetchIds.retainedExcerpt}`));

    rerender(
      <QueryClientProvider client={queryClient}>
        <SurveyResultsSummary
          survey={survey}
          results={{
            ...holderResults,
            questions: holderResults.questions.map((question) =>
              question.kind === 'text'
                ? {
                    ...question,
                    excerpts: [
                      {
                        id: refetchIds.retainedExcerpt,
                        text: '남은 발췌',
                        response_id: refetchIds.responseA,
                      },
                      {
                        id: refetchIds.otherExcerpt,
                        text: '다른 응답 발췌',
                        response_id: refetchIds.responseB,
                      },
                      {
                        id: refetchIds.movedExcerpt,
                        text: '이동한 발췌',
                        response_id: refetchIds.responseB,
                      },
                    ],
                  }
                : question,
            ),
          }}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByTestId(`survey-finding-excerpt-${refetchIds.retainedExcerpt}`),
    ).toBeChecked();
    const submit = screen.getByTestId('survey-create-finding-submit');
    expect(submit).not.toBeDisabled();
    await user.click(submit);
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'POST',
        `/survey-responses/${refetchIds.responseA}/create-finding`,
        {
          body: { severity: 'medium', approved_excerpt_ids: [refetchIds.retainedExcerpt] },
        },
      ),
    );
  });

  it('clears a selected excerpt that is absent from every response after a refetch', async () => {
    const user = userEvent.setup();
    const holderResults = {
      ...results,
      questions: results.questions.map((question) =>
        question.kind === 'text'
          ? {
              ...question,
              excerpts: [
                {
                  id: refetchIds.movedExcerpt,
                  text: '사라질 발췌',
                  response_id: refetchIds.responseA,
                },
                {
                  id: refetchIds.retainedExcerpt,
                  text: '선택하지 않은 발췌',
                  response_id: refetchIds.responseA,
                },
                {
                  id: refetchIds.otherExcerpt,
                  text: '다른 응답 발췌',
                  response_id: refetchIds.responseB,
                },
              ],
            }
          : question,
      ),
    };
    const { queryClient, rerender } = renderWithClient(
      <SurveyResultsSummary survey={survey} results={holderResults} />,
    );

    await user.click(screen.getByRole('button', { name: 'Finding 생성' }));
    await user.click(screen.getByTestId('survey-finding-response-0'));
    await user.click(screen.getByTestId(`survey-finding-excerpt-${refetchIds.movedExcerpt}`));

    rerender(
      <QueryClientProvider client={queryClient}>
        <SurveyResultsSummary
          survey={survey}
          results={{
            ...holderResults,
            questions: holderResults.questions.map((question) =>
              question.kind === 'text'
                ? {
                    ...question,
                    excerpts: [
                      {
                        id: refetchIds.retainedExcerpt,
                        text: '선택하지 않은 발췌',
                        response_id: refetchIds.responseA,
                      },
                      {
                        id: refetchIds.otherExcerpt,
                        text: '다른 응답 발췌',
                        response_id: refetchIds.responseB,
                      },
                    ],
                  }
                : question,
            ),
          }}
        />
      </QueryClientProvider>,
    );

    const submit = screen.getByTestId('survey-create-finding-submit');
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('keeps the pre-refetch request body when only response group order reverses', async () => {
    const user = userEvent.setup();
    apiClient.mockResolvedValue({ data: { id: ids.finding } });
    const holderResults = {
      ...results,
      questions: results.questions.map((question) =>
        question.kind === 'text'
          ? {
              ...question,
              excerpts: [
                {
                  id: refetchIds.retainedExcerpt,
                  text: '첫 번째 응답 발췌',
                  response_id: refetchIds.responseA,
                },
                {
                  id: refetchIds.otherExcerpt,
                  text: '두 번째 응답 발췌',
                  response_id: refetchIds.responseB,
                },
              ],
            }
          : question,
      ),
    };
    const { queryClient, rerender } = renderWithClient(
      <SurveyResultsSummary survey={survey} results={holderResults} />,
    );
    const request = [
      'POST',
      `/survey-responses/${refetchIds.responseA}/create-finding`,
      { body: { severity: 'medium', approved_excerpt_ids: [refetchIds.retainedExcerpt] } },
    ] as const;

    await user.click(screen.getByRole('button', { name: 'Finding 생성' }));
    await user.click(screen.getByTestId('survey-finding-response-0'));
    await user.click(screen.getByTestId(`survey-finding-excerpt-${refetchIds.retainedExcerpt}`));
    await user.click(screen.getByTestId('survey-create-finding-submit'));
    await waitFor(() => expect(apiClient).toHaveBeenCalledWith(...request));
    apiClient.mockClear();

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

    expect(
      screen.getByTestId(`survey-finding-excerpt-${refetchIds.retainedExcerpt}`),
    ).toBeChecked();
    await user.click(screen.getByTestId('survey-create-finding-submit'));
    await waitFor(() => expect(apiClient).toHaveBeenCalledWith(...request));
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

    await user.click(screen.getByRole('button', { name: 'Finding 생성' }));
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

    await user.click(screen.getByRole('button', { name: 'Finding 생성' }));
    await user.click(screen.getByTestId('survey-finding-response-0'));
    await user.click(screen.getByTestId(`survey-finding-excerpt-${ids.finding}`));
    await user.click(screen.getByTestId('survey-create-finding-submit'));

    // #665: failures render the Korean catalog message, never the raw error text.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    expect(alert).not.toHaveTextContent('Finding could not be created');
    expect(screen.getByTestId('survey-create-finding-draft')).toBeInTheDocument();
    expect(screen.getByTestId('survey-create-finding-submit')).not.toBeDisabled();
  });

  it('disables Create Finding when no approved excerpt is tied to an accessible response', async () => {
    const user = userEvent.setup();
    renderWithClient(<SurveyResultsSummary survey={survey} results={results} />);

    const button = screen.getByRole('button', { name: 'Finding 생성' });
    expect(button).toBeDisabled();
    expect(screen.getByText('접근 가능한 응답에 승인된 발췌가 없습니다.')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: '권한 요청' })).toBeDisabled();
    expect(
      screen.getByText('접근 정보를 확인할 수 없어 요청을 제출할 수 없습니다.'),
    ).toBeInTheDocument();
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('renders no follow-up CTA when next_actions is empty', () => {
    render(<SurveyResultsSummary survey={survey} results={{ ...results, next_actions: [] }} />);

    expect(screen.queryByTestId('survey-result-next-actions')).not.toBeInTheDocument();
    expect(screen.queryByText('mark_no_follow_up')).not.toBeInTheDocument();
  });

  it('loads the selected Finding and submits a Task Request from the Request Task action', async () => {
    const user = userEvent.setup();
    const finding = makeFinding(ids.finding, 'Survey-derived Finding summary.');
    apiRequest.mockResolvedValue({ data: finding });
    apiClient.mockResolvedValue({ data: { id: ids.responseTwo } });
    renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          next_actions: [
            {
              id: 'request_task',
              availability: 'allowed',
              intent: 'open_task_request_draft',
              source_finding_id: ids.finding,
            },
          ],
        }}
      />,
    );

    expect(apiRequest).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Task 요청' }));
    const draft = await screen.findByTestId('request-task-draft');
    expect(draft).toHaveTextContent('출처 FND-510 · Finding');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      apiRequest.mock.calls.some(
        ([method, path]) => method === 'GET' && path === `/findings/${ids.finding}`,
      ),
    ).toBe(true);
    expect(screen.getByTestId('request-task-evidence-summary-input')).toHaveValue(finding.summary);

    await user.type(
      screen.getByTestId('request-task-requested-outcome-input'),
      'Reduce export wait time',
    );
    await user.click(screen.getByTestId('request-task-submit'));

    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'POST',
        `/findings/${ids.finding}/request-task`,
        expect.objectContaining({
          body: {
            evidence_summary: finding.summary,
            requested_outcome: 'Reduce export wait time',
          },
          idempotencyKey: expect.any(String),
        }),
      ),
    );
  });

  it('keeps multiple Request Task actions paired with their own Findings', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const firstFinding = makeFinding(ids.finding, 'First Finding summary.');
    const secondFinding = makeFinding(ids.findingTwo, 'Second Finding summary.');
    apiRequest
      .mockResolvedValueOnce({ data: firstFinding })
      .mockResolvedValueOnce({ data: secondFinding });
    renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          next_actions: [
            {
              id: 'request_task',
              availability: 'allowed',
              intent: 'open_task_request_draft',
              source_finding_id: ids.finding,
            },
            {
              id: 'request_task',
              availability: 'allowed',
              intent: 'open_task_request_draft',
              source_finding_id: ids.findingTwo,
            },
          ],
        }}
      />,
    );

    // Duplicate React keys only warn, so assert the warning is absent.
    const keyWarnings = consoleError.mock.calls.filter((call) =>
      call.map(String).join(' ').includes('same key'),
    );
    expect(keyWarnings).toEqual([]);
    consoleError.mockRestore();
    const [firstButton, secondButton] = screen.getAllByRole('button', { name: 'Task 요청' });
    expect(screen.getAllByRole('button', { name: 'Task 요청' })).toHaveLength(2);
    if (!firstButton || !secondButton) throw new Error('expected two Request Task buttons');
    await user.click(firstButton);
    const firstDraft = await screen.findByTestId('request-task-draft');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('request-task-evidence-summary-input')).toHaveValue(
      firstFinding.summary,
    );
    await user.click(within(firstDraft).getByRole('button', { name: '초안 닫기' }));

    await user.click(secondButton);
    await waitFor(() =>
      expect(
        apiRequest.mock.calls.some(
          ([method, path]) => method === 'GET' && path === `/findings/${ids.findingTwo}`,
        ),
      ).toBe(true),
    );
    await screen.findByTestId('request-task-draft');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('request-task-evidence-summary-input')).toHaveValue(
      secondFinding.summary,
    );
  });

  it('opens only the latest Finding when overlapping detail requests resolve out of order', async () => {
    const user = userEvent.setup();
    const firstFinding = makeFinding(ids.finding, 'First Finding summary.');
    const secondFinding = makeFinding(ids.findingTwo, 'Second Finding summary.');
    const firstLoad = makeDeferred<{ data: typeof firstFinding }>();
    const secondLoad = makeDeferred<{ data: typeof secondFinding }>();
    apiRequest.mockImplementation((_method, path) => {
      if (path === `/findings/${ids.finding}`) return firstLoad.promise;
      if (path === `/findings/${ids.findingTwo}`) return secondLoad.promise;
      throw new Error(`Unexpected request: ${String(path)}`);
    });
    apiClient.mockResolvedValue({ data: { id: ids.responseTwo } });
    renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          next_actions: [
            {
              id: 'request_task',
              availability: 'allowed',
              intent: 'open_task_request_draft',
              source_finding_id: ids.finding,
            },
            {
              id: 'request_task',
              availability: 'allowed',
              intent: 'open_task_request_draft',
              source_finding_id: ids.findingTwo,
            },
          ],
        }}
      />,
    );

    const [firstButton, secondButton] = screen.getAllByRole('button', { name: 'Task 요청' });
    if (!firstButton || !secondButton) throw new Error('expected two Request Task buttons');
    await user.click(firstButton);
    await waitFor(() =>
      expect(
        apiRequest.mock.calls.some(
          ([method, path]) => method === 'GET' && path === `/findings/${ids.finding}`,
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(firstButton).toBeDisabled());
    await user.click(secondButton);
    await waitFor(() =>
      expect(
        apiRequest.mock.calls.some(
          ([method, path]) => method === 'GET' && path === `/findings/${ids.findingTwo}`,
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(secondButton).toBeDisabled());
    expect(apiRequest.mock.calls.filter(([method]) => method === 'GET')).toHaveLength(2);

    await act(async () => {
      firstLoad.resolve({ data: firstFinding });
      await firstLoad.promise;
    });
    expect(screen.queryByRole('region', { name: 'Task Request 초안' })).not.toBeInTheDocument();

    await act(async () => {
      secondLoad.resolve({ data: secondFinding });
      await secondLoad.promise;
    });
    await screen.findByRole('region', { name: 'Task Request 초안' });
    expect(screen.getAllByRole('region', { name: 'Task Request 초안' })).toHaveLength(1);
    expect(screen.getByTestId('request-task-evidence-summary-input')).toHaveValue(
      secondFinding.summary,
    );

    await user.type(
      screen.getByTestId('request-task-requested-outcome-input'),
      'Reduce export wait time',
    );
    await user.click(screen.getByTestId('request-task-submit'));
    await waitFor(() =>
      expect(apiClient).toHaveBeenCalledWith(
        'POST',
        `/findings/${ids.findingTwo}/request-task`,
        expect.objectContaining({
          body: {
            evidence_summary: secondFinding.summary,
            requested_outcome: 'Reduce export wait time',
          },
          idempotencyKey: expect.any(String),
        }),
      ),
    );
  });

  it('retries a failed Finding load when Request Task is clicked again', async () => {
    const user = userEvent.setup();
    const finding = makeFinding(ids.finding, 'Finding available after retry.');
    apiRequest
      .mockRejectedValueOnce(new ApiParseError(200, `/findings/${ids.finding}`, []))
      .mockResolvedValueOnce({ data: finding });
    renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          next_actions: [
            {
              id: 'request_task',
              availability: 'allowed',
              intent: 'open_task_request_draft',
              source_finding_id: ids.finding,
            },
          ],
        }}
      />,
    );

    const button = screen.getByRole('button', { name: 'Task 요청' });
    await user.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Finding을 불러오지 못했습니다.');
    expect(screen.queryByRole('region', { name: 'Task Request 초안' })).not.toBeInTheDocument();

    await user.click(button);
    await screen.findByRole('region', { name: 'Task Request 초안' });
    expect(screen.getByTestId('request-task-evidence-summary-input')).toHaveValue(finding.summary);
    expect(
      apiRequest.mock.calls.filter(([, path]) => path === `/findings/${ids.finding}`),
    ).toHaveLength(2);
  });

  it('does not open a modal when an errored Finding query later succeeds without another click', async () => {
    const user = userEvent.setup();
    const finding = makeFinding(ids.finding, 'Finding returned by background refetch.');
    apiRequest
      .mockRejectedValueOnce(new ApiParseError(200, `/findings/${ids.finding}`, []))
      .mockResolvedValueOnce({ data: finding });
    const { queryClient } = renderWithClient(
      <SurveyResultsSummary
        survey={survey}
        results={{
          ...results,
          next_actions: [
            {
              id: 'request_task',
              availability: 'allowed',
              intent: 'open_task_request_draft',
              source_finding_id: ids.finding,
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Task 요청' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Finding을 불러오지 못했습니다.');
    expect(screen.queryByRole('region', { name: 'Task Request 초안' })).not.toBeInTheDocument();

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['finding', ids.finding], type: 'all' });
    });
    expect(
      apiRequest.mock.calls.filter(([, path]) => path === `/findings/${ids.finding}`),
    ).toHaveLength(2);
    expect(queryClient.getQueryData(['finding', ids.finding])).toEqual(finding);
    expect(screen.queryByRole('region', { name: 'Task Request 초안' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Finding을 불러오지 못했습니다.');
  });
});
